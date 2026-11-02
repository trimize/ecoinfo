import Link from "next/link";
import { ReportButton } from "@/components/Actions";
import { FIG_LABEL, FIG_STYLE, Highlighted } from "@/components/BriefCard";
import { isPro } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { periodRange, reportCandidates, reportId } from "@/lib/reports";
import { periodEnd } from "@/lib/schedule";
import { getStore } from "@/lib/store";
import type { Period, Report, ReportEvent, ReportSource } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIODS: { id: Period; label: string; hint: string }[] = [
  { id: "day", label: "Jour", hint: "Les annonces de la journée" },
  { id: "month", label: "Mois", hint: "Ce qui a marqué le mois" },
  { id: "year", label: "Année", hint: "Les tendances de l'année" },
];

const TONE: Record<ReportEvent["tone"], string> = {
  positif: "bg-emerald-100 text-emerald-800",
  négatif: "bg-red-100 text-red-800",
  neutre: "bg-stone-100 text-stone-700",
  mixte: "bg-amber-100 text-amber-800",
};

function shiftKey(period: Period, key: string, delta: number) {
  if (period === "year") return String(Number(key) + delta);
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  }
  return new Date(Date.parse(key) + delta * 86_400_000).toISOString().slice(0, 10);
}

function defaultKey(period: Period, latest: string) {
  return period === "day" ? latest : period === "month" ? latest.slice(0, 7) : latest.slice(0, 4);
}

function SourceChip({ s }: { s: ReportSource }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <Link href={`/publications/${s.id}`} className="font-medium text-stone-800 hover:underline">
        {s.company}
      </Link>
      <span className="text-stone-400">{fmtDate(s.publishedAt).slice(0, 8)}</span>
      <Link href={`/publications/${s.id}`} className="min-w-0 flex-1 truncate text-stone-600 hover:underline" title={s.title}>
        {s.title}
      </Link>
      {s.hasBrief && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">brève vérifiée</span>}
      {s.pdfUrl && (
        <a href={s.pdfUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
          PDF ↗
        </a>
      )}
    </li>
  );
}

function EventCard({ e, rank, sources }: { e: ReportEvent; rank: number; sources: Map<string, ReportSource> }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
          {rank}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold leading-snug">
              <Highlighted text={e.title} figures={e.figures} />
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[e.tone]}`}>{e.tone}</span>
            {e.status === "needs_review" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">à relire</span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-stone-800">
            <Highlighted text={e.summary} figures={e.figures} />
          </p>
          <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
            <span className="font-medium">Pourquoi c&apos;est important : </span>
            <Highlighted text={e.whyItMatters} figures={e.figures} />
          </p>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
              Sources ({e.sourceIds.length})
            </p>
            <ul className="space-y-1">
              {e.sourceIds.map((id) => {
                const s = sources.get(id);
                return s ? <SourceChip key={id} s={s} /> : null;
              })}
            </ul>
          </div>
          {e.figures.length > 0 && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">Contrôle des {e.figures.length} chiffre(s)</summary>
              <ul className="mt-1 flex flex-wrap gap-1">
                {e.figures.map((f) => (
                  <li key={f.raw} className={`rounded px-1 ${FIG_STYLE[f.status]}`} title={f.evidence ?? ""}>
                    {f.raw} · {FIG_LABEL[f.status]}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

function ReportView({ report }: { report: Report }) {
  const sources = new Map(report.sources.map((s) => [s.id, s]));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${report.status === "verified" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
          >
            {report.status === "verified" ? "Sources et chiffres vérifiés" : "À relire"}
          </span>
          {Date.parse(report.createdAt) < periodEnd(report.period, report.key) && (
            <span
              className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-900"
              title="Rédigée avant la fin de la période : la version définitive est générée automatiquement à sa clôture."
            >
              Provisoire
            </span>
          )}
          <span className="text-stone-500">{report.statusReason}</span>
        </div>
        <h2 className="text-xl font-semibold leading-snug">
          <Highlighted text={report.headline} figures={report.overviewFigures} />
        </h2>
        <p className="mt-2 leading-relaxed text-stone-700">
          <Highlighted text={report.overview} figures={report.overviewFigures} />
        </p>
        <p className="mt-3 text-xs text-stone-400">
          Fondée sur les {report.sources.length} publications les plus marquantes parmi {report.publicationsInPeriod.toLocaleString("fr-FR")} déposées · {report.model} · générée le {fmtDate(report.createdAt)}
        </p>
      </div>
      <div className="space-y-3">
        {report.events.map((e, i) => (
          <EventCard key={i} e={e} rank={i + 1} sources={sources} />
        ))}
      </div>
    </div>
  );
}

export default async function SynthesesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = getStore();
  const [latest, pro] = await Promise.all([store.latestDay(), isPro()]);
  const period: Period = sp.p === "month" || sp.p === "year" ? sp.p : "day";

  if (!latest) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-500">
        Aucune donnée. Synchronisez les publications depuis l&apos;onglet Publications.
      </p>
    );
  }

  let key = sp.k ?? defaultKey(period, latest);
  let range;
  try {
    range = periodRange(period, key);
  } catch {
    key = defaultKey(period, latest);
    range = periodRange(period, key);
  }
  const [report, candidates] = await Promise.all([store.getReport(reportId(period, key)).catch(() => null), reportCandidates(period, key)]);
  const prev = shiftKey(period, key, -1);
  const next = shiftKey(period, key, 1);
  const canNext = range.to < latest;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Synthèses</h1>
          <p className="text-sm text-stone-500">
            Les événements importants de la cote, chacun adossé aux documents déposés auprès de l&apos;AMF.
          </p>
        </div>
        <nav className="flex rounded-lg border border-stone-200 bg-white p-1" aria-label="Période">
          {PERIODS.map((p) => (
            <Link
              key={p.id}
              href={`/?p=${p.id}`}
              title={p.hint}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${period === p.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/?p=${period}&k=${prev}`} className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm hover:bg-stone-100" aria-label="Période précédente">
          ←
        </Link>
        <span className="text-lg font-medium capitalize">{range.label}</span>
        {canNext ? (
          <Link href={`/?p=${period}&k=${next}`} className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm hover:bg-stone-100" aria-label="Période suivante">
            →
          </Link>
        ) : (
          <span className="rounded-md border border-stone-100 px-2 py-1 text-sm text-stone-300">→</span>
        )}
        <form className="flex items-center gap-1">
          <input type="hidden" name="p" value={period} />
          <input
            name="k"
            type={period === "day" ? "date" : period === "month" ? "month" : "number"}
            defaultValue={key}
            min={period === "year" ? 2007 : undefined}
            max={period === "day" ? latest : period === "month" ? latest.slice(0, 7) : latest.slice(0, 4)}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
          />
          <button className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm hover:bg-stone-100">Aller</button>
        </form>
        <div className="ml-auto">
          <ReportButton period={period} periodKey={key} label={report ? "Régénérer la synthèse" : "Générer la synthèse"} pro={pro} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {report ? (
            <ReportView report={report} />
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
              <p className="font-medium text-stone-700">Pas encore de synthèse rédigée pour cette période.</p>
              <p className="mt-1 text-sm">
                {candidates.length
                  ? "Le classement automatique des publications marquantes est déjà disponible ci-contre."
                  : "Aucune publication marquante enregistrée sur cette période."}
              </p>
              {!pro && candidates.length > 0 && (
                <p className="mt-2 text-sm">
                  La rédaction par IA est incluse dans le <Link href="/abonnement" className="text-emerald-700 underline">plan Pro Recruteur</Link>.
                </p>
              )}
            </div>
          )}
        </div>
        <aside className="space-y-2">
          <h2 className="text-sm font-semibold">Publications les plus marquantes</h2>
          <p className="text-xs text-stone-500">Classement automatique (score éditorial), sans IA. Ce sont les sources proposées au rédacteur.</p>
          <ol className="space-y-2">
            {candidates.slice(0, 12).map((p) => (
              <li key={p.id} className="rounded-md border border-stone-200 bg-white p-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-stone-400">{p.score}</span>
                  <span className="font-medium">{p.company}</span>
                  <span className="ml-auto text-xs text-stone-400">{fmtDate(p.publishedAt).slice(0, 8)}</span>
                </div>
                <Link href={`/publications/${p.id}`} className="line-clamp-2 text-stone-600 hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
