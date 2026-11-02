import { notFound } from "next/navigation";
import { GenerateButton } from "@/components/Actions";
import { BriefCard } from "@/components/BriefCard";
import { fmtDate, shortSubtype } from "@/lib/format";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const [pub, brief] = await Promise.all([store.getPublication(id), store.getBriefByPublication(id)]);
  if (!pub) notFound();

  const rows: [string, React.ReactNode][] = [
    ["Société", pub.company],
    ["ISIN", pub.isin ?? "— (placeholder 999999999999 dans la source)"],
    ["LEI", pub.lei ?? "—"],
    ["Date de dépôt AMF", fmtDate(pub.publishedAt)],
    ["Type", pub.type ?? "—"],
    ["Sous-type", shortSubtype(pub.subtype)],
    ["Codes LOV", pub.typeCodes.join(", ") || "—"],
    ["Langue", pub.language ?? "—"],
    ["CAC 40", pub.cac40 ? "oui" : "non"],
    ["Canaux de diffusion", pub.distributionCount],
    ["Identifiant", <span key="id" className="font-mono">{pub.id}</span>],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold leading-snug">{pub.title}</h1>
        {pub.duplicateOf && (
          <p className="text-sm text-stone-500">
            Version anglaise d&apos;une publication française : <a className="underline" href={`/publications/${pub.duplicateOf}`}>voir la version FR</a>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {pub.pdfUrl && (
            <a href={pub.pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-emerald-700 hover:underline">
              Ouvrir le PDF ↗
            </a>
          )}
          <GenerateButton ids={[pub.id]} label={brief ? "Régénérer la brève" : "Générer une brève"} />
        </div>
        {brief ? <BriefCard brief={brief} pub={pub} /> : <p className="text-sm text-stone-500">Pas encore de brève pour cette publication.</p>}
      </div>
      <aside className="space-y-4">
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">
            Score éditorial : {pub.score} {pub.selected && <span className="text-emerald-700">★ retenue</span>}
          </h2>
          <ul className="space-y-1 text-sm text-stone-700">
            {pub.scoreReasons.map((r) => (
              <li key={r} className={r.startsWith("-") ? "text-red-700" : ""}>{r}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-stone-500">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>
    </div>
  );
}
