import { LogoutButton, UnlockForm } from "@/components/Actions";
import { authEnabled, isPro } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Check = ({ children, off }: { children: React.ReactNode; off?: boolean }) => (
  <li className={`flex gap-2 ${off ? "text-stone-400 line-through" : ""}`}>
    <span className={off ? "" : "text-emerald-700"}>{off ? "✕" : "✓"}</span>
    <span>{children}</span>
  </li>
);

export default async function AbonnementPage() {
  const pro = await isPro();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Choisissez votre plan</h1>
        <p className="mt-2 text-stone-500">Des résumés vérifiés, des synthèses sourcées. Et une grille tarifaire très compétitive.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className={`flex flex-col rounded-xl border bg-white p-6 ${!pro ? "border-stone-400" : "border-stone-200"}`}>
          <h2 className="font-semibold">Découverte</h2>
          <p className="mt-2 text-3xl font-semibold">0 €</p>
          <p className="text-xs text-stone-500">pour toujours, promis</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm">
            <Check>Synthèses du jour, du mois et de l&apos;année</Check>
            <Check>Résumés vérifiés et leurs sources</Check>
            <Check>Liste filtrable des publications AMF</Check>
            <Check off>Synchronisation et génération IA</Check>
          </ul>
          <p className="mt-4 text-center text-sm text-stone-500">{!pro ? "Votre plan actuel" : " "}</p>
        </section>

        <section className={`relative flex flex-col rounded-xl border-2 bg-white p-6 shadow-sm ${pro ? "border-emerald-600" : "border-emerald-600/60"}`}>
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-700 px-3 py-0.5 text-xs font-medium text-white">
            Recommandé par le candidat
          </span>
          <h2 className="font-semibold">✦ Pro Recruteur</h2>
          <p className="mt-2 text-3xl font-semibold">
            0 € <span className="text-base font-normal text-stone-400 line-through">49 €</span>
            <span className="text-base font-normal text-stone-500"> / mois</span>
          </p>
          <p className="text-xs text-stone-500">facturé en une seule fois : une offre d&apos;emploi, payable à la signature</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm">
            <Check>Tout le plan Découverte</Check>
            <Check>Synchronisation du flux AMF à la demande</Check>
            <Check>Génération des résumés et des synthèses par IA</Check>
            <Check>Support prioritaire (le candidat répond très vite en ce moment)</Check>
          </ul>
          <div className="mt-4">
            {pro ? (
              <div className="space-y-2 text-center">
                <p className="rounded-md bg-emerald-50 py-2 text-sm font-medium text-emerald-800">Plan actif. Merci pour votre confiance (et votre temps).</p>
                {authEnabled() && <LogoutButton />}
              </div>
            ) : (
              <UnlockForm />
            )}
          </div>
        </section>

        <section className="flex flex-col rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold">Entreprise</h2>
          <p className="mt-2 text-3xl font-semibold">Sur devis</p>
          <p className="text-xs text-stone-500">disponible dès mon premier jour dans vos équipes</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm">
            <Check>Tout le plan Pro</Check>
            <Check>Vérification sémantique des chiffres</Check>
            <Check>Alertes temps réel sur vos valeurs suivies</Check>
            <Check>Un développeur dédié (celui-ci)</Check>
          </ul>
          <p className="mt-4 text-center text-sm text-stone-500">Contact : voir le CV joint</p>
        </section>
      </div>

      <p className="mx-auto max-w-2xl rounded-lg border border-dashed border-stone-300 p-4 text-center text-xs text-stone-500">
        Ceci est un projet d&apos;entretien : aucune carte bancaire n&apos;a été sollicitée pendant son développement. Le
        « plan Pro » est un simple code d&apos;accès partagé. Il protège les actions qui consomment le quota gratuit de
        l&apos;API Gemini et l&apos;API de l&apos;AMF, pour qu&apos;un visiteur de passage ne les épuise pas avant le jury.
      </p>
    </div>
  );
}
