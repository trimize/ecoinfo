import Link from "next/link";
import { GenerateButton, SyncButton } from "@/components/Actions";
import { isPro } from "@/lib/auth";
import { fmtDate, shortSubtype } from "@/lib/format";
import { getStore } from "@/lib/store";
import type { PublicationFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function PublicationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: PublicationFilters = {
    company: sp.company || undefined,
    type: sp.type || undefined,
    subtype: sp.subtype || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    selectedOnly: sp.selected === "1",
    hideDuplicates: sp.dups !== "1",
  };
  const store = getStore();
  const [pubs, facets, briefs, selected, pro] = await Promise.all([
    store.listPublications(filters),
    store.facets(),
    store.listBriefs(),
    store.listPublications({ selectedOnly: true }),
    isPro(),
  ]);
  const briefed = new Set(briefs.map((b) => b.publicationId));
  const toGenerate = selected.filter((p) => !briefed.has(p.id)).map((p) => p.id);

  const select = (name: string, label: string, options: string[]) => (
    <label className="flex flex-col gap-1 text-xs text-stone-500">
      {label}
      <select name={name} defaultValue={sp[name] ?? ""} className="max-w-64 rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900">
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Publications réglementées</h1>
          <p className="text-sm text-stone-500">
            Flux AMF « flux-amf-new-prod » · {pubs.length} résultat(s) · ★ = retenue pour une brève
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncButton pro={pro} />
          <GenerateButton ids={toGenerate} label={`Générer les brèves (${toGenerate.length})`} pro={pro} />
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3">
        {select("company", "Société", facets.companies)}
        {select("type", "Type d'information", facets.types)}
        {select("subtype", "Sous-type", facets.subtypes)}
        <label className="flex flex-col gap-1 text-xs text-stone-500">
          Du
          <input type="date" name="from" defaultValue={sp.from} className="rounded border border-stone-300 px-2 py-1 text-sm text-stone-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500">
          Au
          <input type="date" name="to" defaultValue={sp.to} className="rounded border border-stone-300 px-2 py-1 text-sm text-stone-900" />
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="selected" value="1" defaultChecked={sp.selected === "1"} /> Retenues seulement
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="dups" value="1" defaultChecked={sp.dups === "1"} /> Afficher les doublons EN
        </label>
        <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white">Filtrer</button>
        <Link href="/publications" className="text-sm text-stone-500 hover:underline">
          Réinitialiser
        </Link>
      </form>

      {pubs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-500">
          Aucune publication. Cliquez sur « Synchroniser » pour récupérer les derniers jours.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Société</th>
                <th className="px-3 py-2">Titre</th>
                <th className="px-3 py-2">Sous-type</th>
                <th className="px-3 py-2">Langue</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {pubs.map((p) => (
                <tr key={p.id} className={`border-t border-stone-100 align-top ${p.selected ? "bg-emerald-50/60" : ""} ${p.duplicateOf ? "text-stone-400" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{fmtDate(p.publishedAt)}</td>
                  <td className="px-3 py-2 font-medium">
                    {p.company}
                    {p.cac40 && <span className="ml-1 rounded bg-stone-100 px-1 text-[10px] text-stone-600">CAC 40</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/publications/${p.id}`} className="hover:underline">
                      {p.selected && "★ "}
                      {p.title}
                    </Link>
                    {briefed.has(p.id) && <span className="ml-2 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">brève</span>}
                    {p.duplicateOf && <span className="ml-2 text-[10px]">(doublon EN)</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-600">{shortSubtype(p.subtype)}</td>
                  <td className="px-3 py-2 text-xs">{p.language === "Anglais" ? "EN" : p.language === "Français" ? "FR" : "?"}</td>
                  <td className="px-3 py-2 text-right font-mono" title={p.scoreReasons.join("\n")}>
                    {p.score}
                  </td>
                  <td className="px-3 py-2">
                    {p.pdfUrl && (
                      <a href={p.pdfUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                        ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
