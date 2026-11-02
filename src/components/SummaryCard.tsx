import Link from "next/link";
import { extractNumbers, figureLabel, normalizeText } from "@/lib/numbers";
import { fmtDate } from "@/lib/format";
import type { Summary, FigureCheck, Publication } from "@/lib/types";

const STATUS_STYLE: Record<Summary["status"], string> = {
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  needs_review: "bg-amber-50 text-amber-900 ring-amber-200",
  unverifiable: "bg-stone-100 text-stone-700 ring-stone-300",
};
const STATUS_LABEL: Record<Summary["status"], string> = {
  verified: "Chiffres vérifiés",
  needs_review: "À relire",
  unverifiable: "Non vérifiable",
};
export const FIG_STYLE: Record<FigureCheck["status"], string> = {
  verified: "bg-emerald-100 text-emerald-900",
  rounded: "bg-sky-100 text-sky-900",
  not_found: "bg-red-100 text-red-900 underline decoration-red-500 decoration-wavy",
};
export const FIG_LABEL: Record<FigureCheck["status"], string> = {
  verified: "trouvé",
  rounded: "arrondi / converti",
  not_found: "introuvable",
};

/** Body text with each number wrapped in a colored span according to its check. */
export function Highlighted({ text, figures }: { text: string; figures: FigureCheck[] }) {
  const norm = normalizeText(text);
  const byLabel = new Map(figures.map((f) => [f.raw, f]));
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const t of extractNumbers(norm, false)) {
    const f = byLabel.get(figureLabel(t));
    if (!f) continue;
    parts.push(norm.slice(last, t.index));
    parts.push(
      <mark
        key={t.index}
        className={`rounded px-0.5 ${FIG_STYLE[f.status]}`}
        title={`${FIG_LABEL[f.status]}${f.matchedAs ? ` : « ${f.matchedAs} »` : ""}`}
      >
        {t.raw}
      </mark>,
    );
    last = t.index + t.raw.length;
  }
  parts.push(norm.slice(last));
  return <>{parts}</>;
}

export function SummaryCard({ summary, pub }: { summary: Summary; pub?: Publication | null }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        {pub && (
          <Link href={`/publications/${pub.id}`} className="font-medium text-stone-700 hover:underline">
            {pub.company}
          </Link>
        )}
        {pub && <span>· {fmtDate(pub.publishedAt)}</span>}
        <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ring-1 ${STATUS_STYLE[summary.status]}`}>
          {STATUS_LABEL[summary.status]}
        </span>
      </div>
      <h2 className="text-lg font-semibold leading-snug">
        <Highlighted text={summary.title} figures={summary.figures} />
      </h2>
      {summary.body && (
        <p className="mt-2 leading-relaxed text-stone-800">
          <Highlighted text={summary.body} figures={summary.figures} />
        </p>
      )}
      {summary.keyFacts.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
          {summary.keyFacts.map((k, i) => (
            <li key={i}>
              <Highlighted text={k} figures={summary.figures} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm">
        <a href={summary.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
          Document source (PDF) ↗
        </a>
      </p>

      <details className="mt-4 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Contrôle des chiffres : {summary.statusReason}
        </summary>
        {summary.figures.length === 0 ? (
          <p className="mt-2 text-stone-500">Aucun chiffre dans le résumé.</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1 pr-2">Chiffre</th>
                <th className="py-1 pr-2">Résultat</th>
                <th className="py-1">Extrait du document source</th>
              </tr>
            </thead>
            <tbody>
              {summary.figures.map((f) => (
                <tr key={f.raw} className="border-t border-stone-200 align-top">
                  <td className="py-1 pr-2 font-mono whitespace-nowrap">{f.raw}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <span className={`rounded px-1 ${FIG_STYLE[f.status]}`}>{FIG_LABEL[f.status]}</span>
                    {f.matchedAs && <div className="mt-0.5 text-stone-500">{f.matchedAs}</div>}
                  </td>
                  <td className="py-1 text-stone-600">{f.evidence ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-stone-500">
          {summary.wordCount} mots · modèle {summary.model} · {summary.sourceChars.toLocaleString("fr-FR")} caractères de source
          {summary.sourceTruncated ? " (tronquée)" : ""} · généré le {fmtDate(summary.createdAt)}
        </p>
      </details>
    </article>
  );
}
