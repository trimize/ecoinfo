import { z } from "zod";
import { currentModel, generateStructured } from "./llm";
import { checkFigures } from "./numbers";
import { SELECTION_THRESHOLD } from "./scoring";
import { getStore } from "./store";
import type { Summary, FigureCheck, Period, Publication, Report, ReportEvent, ReportSource } from "./types";

/**
 * Day / month / year summaries ("Synthèses").
 *
 * Grounding, in three layers:
 * 1. The model only sees a closed list of AMF publications (the most newsworthy of the period,
 *    by the same score as the summary selection), each with an id. It must cite those ids.
 * 2. Every event citing no known id is dropped; ids are never invented into links.
 * 3. Every number of an event is checked (same deterministic checker as the summaries) against the
 *    text of the sources it cites: their titles and, when they exist, their verified summaries.
 */

const CANDIDATES: Record<Period, number> = { day: 25, month: 50, year: 80 };
const MAX_PER_COMPANY: Record<Period, number> = { day: 2, month: 3, year: 4 };
const EVENTS: Record<Period, string> = { day: "3 à 6", month: "5 à 8", year: "6 à 10" };

export function periodRange(period: Period, key: string): { from: string; to: string; label: string } {
  if (period === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Jour invalide (AAAA-MM-JJ)");
    const label = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(key));
    return { from: key, to: key, label };
  }
  if (period === "month") {
    if (!/^\d{4}-\d{2}$/.test(key)) throw new Error("Mois invalide (AAAA-MM)");
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}`, label };
  }
  if (!/^\d{4}$/.test(key)) throw new Error("Année invalide (AAAA)");
  return { from: `${key}-01-01`, to: `${key}-12-31`, label: `année ${key}` };
}

export const reportId = (period: Period, key: string) => `${period}:${key}`;

/** Deterministic part, also shown without any LLM: the most newsworthy publications of the period. */
export async function reportCandidates(period: Period, key: string): Promise<Publication[]> {
  const { from, to } = periodRange(period, key);
  const top = await getStore().topPublications(from, to, SELECTION_THRESHOLD, CANDIDATES[period] * 4);
  const perCompany = new Map<string, number>();
  const out: Publication[] = [];
  for (const p of top) {
    const n = perCompany.get(p.company) ?? 0;
    if (n >= MAX_PER_COMPANY[period]) continue;
    perCompany.set(p.company, n + 1);
    out.push(p);
    if (out.length >= CANDIDATES[period]) break;
  }
  return out;
}

const ReportSchema = z.object({
  headline: z.string().describe("Une phrase qui résume la période"),
  overview: z.string().describe("Vue d'ensemble de 60 à 110 mots"),
  events: z.array(
    z.object({
      title: z.string().describe("Titre court de l'événement"),
      summary: z.string().describe("2 ou 3 phrases factuelles"),
      why_it_matters: z.string().describe("Une phrase : pourquoi un décideur doit le savoir"),
      tone: z.enum(["positif", "négatif", "neutre", "mixte"]).describe("Tonalité pour la société concernée"),
      companies: z.array(z.string()),
      source_ids: z.array(z.string()).describe("Identifiants des publications qui fondent l'événement"),
    }),
  ),
});

export const REPORT_SYSTEM_PROMPT = `Tu es analyste financier et tu rédiges une synthèse des événements importants de la cote française, à partir d'une liste fermée de publications réglementées déposées auprès de l'AMF.

Règles impératives :
- Tu n'utilises QUE les publications fournies. Aucune connaissance extérieure, aucun cours de bourse, aucun événement absent de la liste.
- Chaque événement cite dans source_ids les identifiants exacts (attribut id) des publications qui le fondent. Un événement sans source n'existe pas.
- Un chiffre ne peut apparaître que s'il figure dans le titre ou le résumé d'une publication citée par cet événement ; recopie-le sans calcul, arrondi ni conversion, en notation française (1 234,5 M€ ; 3,2 %). Dans la vue d'ensemble, aucun chiffre, ni en chiffres ni en toutes lettres.
- Regroupe les publications qui traitent du même sujet en un seul événement. Classe les événements du plus au moins important pour un investisseur ou un dirigeant (ampleur, surprise, taille de la société).
- why_it_matters explique l'enjeu de manière factuelle. Pas de recommandation d'achat ou de vente, pas de prévision de cours.
- Ton neutre, en français.`;

function sourceBlock(p: Publication, summary: Summary | null) {
  const summaryText = summary && summary.status !== "unverifiable" ? `\n  <resume>${summary.body}\n  ${summary.keyFacts.join(" | ")}</resume>` : "";
  return `<publication id="${p.id}" date="${p.publishedAt.slice(0, 10)}" societe="${p.company}"${p.cac40 ? ' cac40="oui"' : ""} categorie="${p.subtype ?? "?"}" score="${p.score}">
  <titre>${p.title}</titre>${summaryText}
</publication>`;
}

export async function generateReport(period: Period, key: string): Promise<Report> {
  const store = getStore();
  const { from, to, label } = periodRange(period, key);
  const [candidates, count] = await Promise.all([reportCandidates(period, key), store.countPublications(from, to)]);
  if (candidates.length === 0) throw new Error(`Aucune publication marquante enregistrée pour ${label}. Synchronisez la période d'abord.`);

  const summaries = new Map<string, Summary | null>(
    await Promise.all(candidates.map(async (p) => [p.id, await store.getSummaryByPublication(p.id)] as const)),
  );
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const sourceText = (id: string) => {
    const p = byId.get(id)!;
    const b = summaries.get(id);
    return [p.title, b?.title, b?.body, ...(b?.keyFacts ?? [])].filter(Boolean).join("\n");
  };

  const user = `Période : ${label} (du ${from} au ${to}). ${count} publications déposées, dont les ${candidates.length} plus marquantes ci-dessous.

<publications>
${candidates.map((p) => sourceBlock(p, summaries.get(p.id) ?? null)).join("\n")}
</publications>

Rédige la synthèse : une phrase de titre, une vue d'ensemble, puis ${EVENTS[period]} événements.`;

  const { data, model } = await generateStructured(ReportSchema, REPORT_SYSTEM_PROMPT, user);

  let dropped = 0;
  const events: ReportEvent[] = [];
  for (const e of data.events) {
    const ids = [...new Set(e.source_ids)].filter((id) => byId.has(id));
    if (ids.length === 0) {
      dropped++;
      continue;
    }
    const figures = checkFigures([e.title, e.summary, e.why_it_matters].join("\n"), ids.map(sourceText).join("\n"));
    events.push({
      title: e.title,
      summary: e.summary,
      whyItMatters: e.why_it_matters,
      tone: e.tone,
      companies: e.companies,
      sourceIds: ids,
      figures,
      status: figures.some((f) => f.status === "not_found") ? "needs_review" : "verified",
    });
  }

  const overviewFigures: FigureCheck[] = checkFigures(
    [data.headline, data.overview].join("\n"),
    candidates.map((p) => sourceText(p.id)).join("\n"),
  );

  const problems: string[] = [];
  const reviewEvents = events.filter((e) => e.status === "needs_review").length;
  if (reviewEvents) problems.push(`${reviewEvents} événement(s) avec un chiffre introuvable dans ses sources`);
  if (overviewFigures.some((f) => f.status === "not_found")) problems.push("chiffre introuvable dans la vue d'ensemble");
  if (dropped) problems.push(`${dropped} événement(s) écarté(s) faute de source valide`);

  const sources: ReportSource[] = candidates.map((p) => ({
    id: p.id,
    company: p.company,
    title: p.title,
    publishedAt: p.publishedAt,
    pdfUrl: p.pdfUrl,
    score: p.score,
    subtype: p.subtype,
    hasBrief: !!summaries.get(p.id),
  }));

  return {
    id: reportId(period, key),
    period,
    key,
    from,
    to,
    headline: data.headline,
    overview: data.overview,
    overviewFigures,
    events,
    sources,
    publicationsInPeriod: count,
    droppedEvents: dropped,
    status: problems.length ? "needs_review" : "verified",
    statusReason: problems.length
      ? `À relire : ${problems.join(" ; ")}.`
      : `${events.length} événements, tous adossés à des documents AMF ; chiffres retrouvés dans les sources citées.`,
    model: model ?? currentModel(),
    createdAt: new Date().toISOString(),
  };
}
