import type { FigureCheck } from "./types";

/**
 * Deterministic figure checking: every number written in a summary must be found in the text
 * extracted from the source PDF. No LLM is involved in this step, on purpose: we do not ask the
 * model to grade its own work.
 *
 * - Numbers are parsed in both French ("1 234,5") and English ("1,234.5") notations; ambiguous
 *   tokens ("1,234") produce both candidate values.
 * - The unit right after the number is captured: %, thousand / million / billion (FR + EN).
 * - "verified": same value, compatible unit (a % must match a %; "6,0 milliards" may match a
 *   bare "6,0" from a table, since tables give the unit in the header).
 * - "rounded": the source has an explicitly scaled figure that rounds to the summary's figure
 *   (e.g. summary "1,3 milliard" vs source "1 297 M€"), or a more precise value in the same unit.
 * - "not_found": anything else -> the summary is flagged for human review.
 */

export interface NumToken {
  raw: string;
  values: number[]; // candidate values (ambiguous separators give 2)
  decimals: number[]; // decimals for each candidate
  scale: number; // 1, 1e3, 1e6, 1e9
  pct: boolean;
  index: number;
}

// Unify all space variants (nbsp, narrow nbsp, thin space...) used as thousands separators.
export function normalizeText(s: string) {
  return s
    .replace(/[    ]/g, " ")
    .replace(/[−–]/g, "-")
    .replace(/[ \t]+/g, " ");
}

const NUM_RE = /(?<![\p{L}\d.,])\d{1,3}(?:(?: |,|\.)\d{3})+(?:[.,]\d+)?(?!\d)|(?<![\p{L}\d.,])\d+(?:[.,]\d+)?(?!\d)/gu;

const UNIT_RE: Array<[RegExp, number | "pct"]> = [
  [/^\s?(%|pour ?cent|percent)/i, "pct"],
  [/^\s?(milliards?|mds?\b|md€|mrds?\b|bn\b|billions?|b€|\$?bn)/i, 1e9],
  [/^\s?(millions?|mn\b|m€|m\$|m\s?(eur|usd|€|\$)|m\b)/i, 1e6],
  [/^\s?(milliers?|thousands?|k€|k\b)/i, 1e3],
];

function parseCandidates(raw: string): { v: number; d: number }[] {
  const r = raw.replace(/ /g, " ");
  const lastDot = r.lastIndexOf(".");
  const lastComma = r.lastIndexOf(",");
  const make = (intPart: string, dec = "") => ({
    v: Number(intPart.replace(/[ .,]/g, "") + (dec ? "." + dec : "")),
    d: dec.length,
  });
  if (lastDot >= 0 && lastComma >= 0) {
    const sep = Math.max(lastDot, lastComma);
    return [make(r.slice(0, sep), r.slice(sep + 1))];
  }
  const sepIdx = Math.max(lastDot, lastComma);
  if (sepIdx < 0) return [make(r)];
  const sepChar = r[sepIdx];
  const occurrences = r.split(sepChar).length - 1;
  const after = r.slice(sepIdx + 1);
  if (occurrences > 1) return [make(r)]; // "1.234.567" -> grouping
  if (after.length === 3 && !r.includes(" ")) {
    // "1,234" / "1.234": thousands (EN / FR) or decimal - keep both
    return [make(r), make(r.slice(0, sepIdx), after)];
  }
  return [make(r.slice(0, sepIdx), after)];
}

export function extractNumbers(text: string, splitGroups = true): NumToken[] {
  const out: NumToken[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const raw = m[0];
    const index = m.index ?? 0;
    const tail = text.slice(index + raw.length, index + raw.length + 14);
    let scale = 1;
    let pct = false;
    for (const [re, u] of UNIT_RE) {
      if (re.test(tail)) {
        if (u === "pct") pct = true;
        else scale = u;
        break;
      }
    }
    const cands = parseCandidates(raw);
    out.push({ raw, values: cands.map((c) => c.v), decimals: cands.map((c) => c.d), scale, pct, index });
    // A space-grouped token may be two adjacent table cells ("12 345"): also index the parts.
    if (splitGroups && raw.includes(" ")) {
      let off = 0;
      for (const part of raw.split(" ")) {
        const cs = parseCandidates(part);
        out.push({
          raw: part,
          values: cs.map((c) => c.v),
          decimals: cs.map((c) => c.d),
          scale: 1,
          pct: false,
          index: index + off,
        });
        off += part.length + 1;
      }
    }
  }
  return out;
}

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));
const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

function excerpt(text: string, index: number, len: number) {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + len + 70);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

/** Summary figures are written by our prompt in French notation, so parse them unambiguously. */
function parseBriefToken(t: NumToken) {
  // the summary uses spaces for thousands and a comma for decimals
  const r = t.raw.replace(/ /g, "");
  if (/^\d+,\d+$/.test(r)) {
    const [i, d] = r.split(",");
    return { v: Number(`${i}.${d}`), d: d.length };
  }
  // fallback (model slipped into English notation)
  return { v: t.values[t.values.length - 1], d: t.decimals[t.decimals.length - 1] };
}

const unitSuffix = (t: NumToken) => (t.pct ? " %" : t.scale === 1e9 ? " Md" : t.scale === 1e6 ? " M" : t.scale === 1e3 ? " k" : "");
/** Stable label of a summary figure, used to link highlighted text to its check. */
export const figureLabel = (t: NumToken) => t.raw + unitSuffix(t);

/** Stock-index names contain digits but are not figures to verify. */
export const INDEX_NAMES = /\b(CAC|SBF|Euro ?Stoxx|Stoxx|CAC Mid|CAC Small|DAX|FTSE|S&P) ?\d{2,3}\b/gi;

export function checkFigures(summaryText: string, sourceText: string): FigureCheck[] {
  const src = normalizeText(sourceText);
  const srcTokens = extractNumbers(src);
  // The summary is prose: no table-cell splitting. Index names ("CAC 40") are names, not figures.
  const summaryTokens = extractNumbers(normalizeText(summaryText).replace(INDEX_NAMES, (m) => m.replace(/\d/g, "#")), false);

  const seen = new Set<string>();
  const results: FigureCheck[] = [];
  for (const bt of summaryTokens) {
    const label = figureLabel(bt);
    if (seen.has(label)) continue;
    seen.add(label);
    const { v, d } = parseBriefToken(bt);

    const target = v * bt.scale;
    const hasValue = (s: NumToken, pred: (sv: number, sd: number) => boolean) => s.values.some((sv, k) => pred(sv, s.decimals[k]));

    // Ordered from strongest to weakest evidence; the first strategy that finds a token wins.
    const strategies: Array<[FigureCheck["status"], string, (s: NumToken) => boolean]> = [
      // a. same value, same unit ("6,0 milliards" <-> "6,0 milliards d'euros")
      ["verified", "", (s) => s.pct === bt.pct && s.scale === bt.scale && hasValue(s, (sv) => eq(sv, v))],
      // b. same absolute amount in another explicit unit ("1 milliard" <-> "1 000 millions")
      ["verified", " (conversion d'unité exacte)", (s) => s.pct === bt.pct && s.scale !== 1 && s.scale !== bt.scale && hasValue(s, (sv) => eq(sv * s.scale, target))],
      // c. table cell without unit: only if written with the very same precision and not a trivial number
      ["verified", " (cellule sans unité)", (s) => !bt.pct && !s.pct && bt.scale !== 1 && s.scale === 1 && (d > 0 || v >= 100) && hasValue(s, (sv, sd) => eq(sv, v) && sd === d)],
      // d. more precise source figure that rounds to the summary figure ("4,08 %" <-> "4,084 %", "1,3 Md" <-> "1 297 M")
      ["rounded", " (arrondi)", (s) => s.pct === bt.pct && (s.scale !== 1 || bt.scale === 1) && hasValue(s, (sv, sd) => {
        const inBriefUnit = (sv * s.scale) / bt.scale;
        const morePrecise = s.scale !== bt.scale || sd > d;
        return morePrecise && !eq(inBriefUnit, v) && eq(roundTo(inBriefUnit, d), v);
      })],
    ];

    let found: FigureCheck | null = null;
    for (const [status, note, pred] of strategies) {
      const hit = srcTokens.find(pred);
      if (hit) {
        found = { raw: label, normalized: target, status, evidence: excerpt(src, hit.index, hit.raw.length), matchedAs: hit.raw + unitSuffix(hit) + note };
        break;
      }
    }
    if (found) {
      results.push(found);
      continue;
    }

    results.push({ raw: label, normalized: target, status: "not_found", evidence: null, matchedAs: null });
  }
  return results;
}
