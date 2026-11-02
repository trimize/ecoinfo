import { BriefCard } from "@/components/BriefCard";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const store = getStore();
  const briefs = await store.listBriefs();
  const pubs = await Promise.all(briefs.map((b) => store.getPublication(b.publicationId)));
  const counts = {
    verified: briefs.filter((b) => b.status === "verified").length,
    review: briefs.filter((b) => b.status !== "verified").length,
  };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brèves</h1>
        <p className="text-sm text-stone-500">
          {briefs.length} brève(s) · {counts.verified} entièrement vérifiée(s) · {counts.review} à relire.{" "}
          <span className="rounded bg-emerald-100 px-1 text-emerald-900">trouvé</span>{" "}
          <span className="rounded bg-sky-100 px-1 text-sky-900">arrondi / converti</span>{" "}
          <span className="rounded bg-red-100 px-1 text-red-900">introuvable</span>
        </p>
      </div>
      {briefs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-500">
          Aucune brève. Depuis la liste des publications, cliquez sur « Générer les brèves ».
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {briefs.map((b, i) => (
            <BriefCard key={b.id} brief={b} pub={pubs[i]} />
          ))}
        </div>
      )}
    </div>
  );
}
