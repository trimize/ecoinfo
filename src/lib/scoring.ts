import type { Publication } from "./types";

/**
 * Newsworthiness score. Transparent, rule-based, explainable line by line.
 *
 * 1. Regulatory category (the strongest signal): the issuer itself classifies the filing.
 *    "Informations privilégiées" (MAR art. 17) are by definition likely to move the share price;
 *    quarterly / periodic results and takeover-bid releases are news; buy-back reports,
 *    voting-rights totals and "document available" notices are routine compliance.
 * 2. Audience: CAC 40 issuers interest the most readers.
 * 3. Wire distribution: a release pushed to many wires (AFP, Reuters, Bloomberg...) is a press
 *    release written for the public, whereas a bare filing (rapport, attestation) is not.
 * 4. Title keywords: results / guidance / M&A / capital operations up; routine wording down.
 *
 * Then: FR/EN duplicates are collapsed (French version kept), and at most one publication per
 * company is selected, so the top N gives diverse news.
 */

const SUBTYPE_WEIGHTS: Array<[RegExp, number, string]> = [
  [/offre publique/i, 45, "Communiqué en période d'offre publique"],
  [/informations privil/i, 40, "Information privilégiée (MAR art. 17) : potentiellement sensible pour le cours"],
  [/trimestrielle/i, 30, "Information financière trimestrielle"],
  [/annuels/i, 20, "Rapport financier annuel"],
  [/semestriels/i, 15, "Rapport financier semestriel"],
  [/franchissement de seuil/i, 15, "Franchissement de seuil"],
  [/acquisition ou cession des actions/i, -15, "Rachat d'actions propres (routine)"],
  [/droits de vote/i, -25, "Déclaration mensuelle des droits de vote (routine)"],
  [/mise à disposition|honoraires|liquidit/i, -25, "Avis de mise à disposition / information administrative"],
];

/** Title signals, most newsworthy first. Several can add up (e.g. results + guidance raised). */
const TITLE_SIGNALS: Array<[RegExp, number, string]> = [
  [/r[ée]sultats?|results|chiffre d.affaires|revenue|\bsales\b|ventes|BNPA|\bEPS\b/i, 15, "Résultats / chiffre d'affaires"],
  [/(?<!\p{L})(rel[eè]v|abaiss|ajust|r[ée]vis|upgrade|raise|cut|lower|warning|adjust)/iu, 15, "Révision des perspectives / surprise"],
  [/perspectives|guidance|outlook|objectifs?/i, 5, "Perspectives / objectifs"],
  [/acqui|cession|c[eè]de|fusion|merger|rapprochement|\boffre\b|\bOPA\b|\bOPE\b|takeover/i, 15, "Opération de M&A / offre"],
  [/d[ée]pr[ée]ciation|impairment|difficult|perte|loss|profit warning/i, 10, "Événement négatif (dépréciation, difficultés)"],
  [/augmentation de capital|capital increase|[ée]mission obligataire|bond|dividende|dividend/i, 8, "Opération sur capital / financement"],
  [/contrat|contract|remporte|wins|nomination|appoint/i, 5, "Contrat / gouvernance"],
];
const NEGATIVE_KEYWORDS =
  /descriptif du programme|bilan semestriel du contrat de liquidit|contrat de liquidit|nombre d.actions|nombre total de droits|mise à disposition|rapport d.examen|attestation|honoraires|declaration of transactions|d[ée]claration des transactions/i;

export function scorePublication(p: Omit<Publication, "score" | "scoreReasons" | "selected" | "duplicateOf">) {
  let score = 0;
  const reasons: string[] = [];

  const subtype = p.subtype ?? "";
  const hit = SUBTYPE_WEIGHTS.find(([re]) => re.test(subtype));
  if (hit) {
    score += hit[1];
    reasons.push(`${hit[1] > 0 ? "+" : ""}${hit[1]} ${hit[2]}`);
  } else if (!p.subtype) {
    reasons.push("0 Sous-type absent dans la source");
  }

  if (p.cac40) {
    score += 25;
    reasons.push("+25 Société du CAC 40");
  }

  if (p.distributionCount >= 5) {
    score += 10;
    reasons.push(`+10 Diffusé à ${p.distributionCount} canaux (communiqué de presse)`);
  }

  for (const [re, w, label] of TITLE_SIGNALS) {
    if (re.test(p.title)) {
      score += w;
      reasons.push(`+${w} Titre : ${label}`);
    }
  }
  if (NEGATIVE_KEYWORDS.test(p.title)) {
    score -= 20;
    reasons.push("-20 Titre d'un document administratif");
  }

  if (!p.pdfUrl) {
    score -= 100;
    reasons.push("-100 Pas de document source : impossible de vérifier");
  }

  return { score, reasons };
}

/**
 * Detect FR/EN duplicates: same company, same subtype, same day, other language, filed
 * within 6h. Returns map englishId -> frenchId.
 */
export function findDuplicates(pubs: Pick<Publication, "id" | "company" | "subtype" | "language" | "publishedAt">[]) {
  const dup = new Map<string, string>();
  const key = (p: (typeof pubs)[number]) => `${p.company}|${p.subtype}|${p.publishedAt.slice(0, 10)}`;
  const groups = new Map<string, typeof pubs>();
  for (const p of pubs) {
    const k = key(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const g of groups.values()) {
    const fr = g.filter((p) => p.language === "Français");
    const en = g.filter((p) => p.language === "Anglais");
    const used = new Set<string>();
    for (const e of en) {
      const t = Date.parse(e.publishedAt);
      let best: (typeof fr)[number] | null = null;
      for (const f of fr) {
        if (used.has(f.id)) continue;
        const d = Math.abs(Date.parse(f.publishedAt) - t);
        if (d <= 6 * 3600_000 && (!best || d < Math.abs(Date.parse(best.publishedAt) - t))) best = f;
      }
      if (best) {
        used.add(best.id);
        dup.set(e.id, best.id);
      }
    }
  }
  return dup;
}

export const SELECTION_THRESHOLD = 50;
export const MAX_SELECTED = 5;

/** Score, dedupe and pick the top publications (one per company). */
export function rankAndSelect(
  pubs: Omit<Publication, "score" | "scoreReasons" | "selected" | "duplicateOf">[],
): Publication[] {
  const dup = findDuplicates(pubs);
  const scored: Publication[] = pubs.map((p) => {
    const { score, reasons } = scorePublication(p);
    return { ...p, score, scoreReasons: reasons, selected: false, duplicateOf: dup.get(p.id) ?? null };
  });
  const ranked = scored
    .filter((p) => !p.duplicateOf && p.score >= SELECTION_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt));
  const companies = new Set<string>();
  for (const p of ranked) {
    if (companies.size >= MAX_SELECTED) break;
    if (companies.has(p.company)) continue;
    companies.add(p.company);
    p.selected = true;
  }
  return scored;
}
