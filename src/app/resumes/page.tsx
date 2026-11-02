import { SummaryCard } from "@/components/SummaryCard";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SummariesPage() {
  const store = getStore();
  const summaries = await store.listSummaries();
  const pubs = await Promise.all(summaries.map((b) => store.getPublication(b.publicationId)));
  const counts = {
    verified: summaries.filter((b) => b.status === "verified").length,
    review: summaries.filter((b) => b.status !== "verified").length,
  };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Résumés</h1>
        <p className="text-sm text-stone-500">
          {summaries.length} résumé(s) · {counts.verified} entièrement vérifié(s) · {counts.review} à relire.{" "}
          <span className="rounded bg-emerald-100 px-1 text-emerald-900">trouvé</span>{" "}
          <span className="rounded bg-sky-100 px-1 text-sky-900">arrondi / converti</span>{" "}
          <span className="rounded bg-red-100 px-1 text-red-900">introuvable</span>
        </p>
      </div>
      {summaries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-500">
          Aucun résumé. Depuis la liste des publications (onglet Publications), cliquez sur « Générer les résumés ».
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {summaries.map((b, i) => (
            <SummaryCard key={b.id} summary={b} pub={pubs[i]} />
          ))}
        </div>
      )}
    </div>
  );
}
