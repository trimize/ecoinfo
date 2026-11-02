import { MAX_SELECTED, SELECTION_THRESHOLD } from "@/lib/scoring";

export default function MethodePage() {
  return (
    <article className="prose-sm max-w-3xl space-y-4 text-stone-800 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-semibold tracking-tight">Méthode</h1>

      <h2>1. Source</h2>
      <p>
        API Opendatasoft d&apos;info-financiere.gouv.fr (jeu <code>flux-amf-new-prod</code>), filtrée sur la date de
        réception AMF (<code>uin_dat_amf</code>). Chaque enregistrement = un document déposé, avec un lien PDF.
      </p>

      <h2>2. Sélection des publications</h2>
      <p>Score additif, chaque point est affiché sur la fiche de la publication :</p>
      <ul>
        <li>Catégorie réglementaire : information privilégiée +40, offre publique +45, trimestriel +30, annuel +20, semestriel +15 ; rachats d&apos;actions, droits de vote, avis de mise à disposition : négatif.</li>
        <li>Société du CAC 40 : +25 (audience).</li>
        <li>Diffusé à 5 canaux ou plus (AFP, Reuters…) : +10, c&apos;est un communiqué de presse et non un simple dépôt.</li>
        <li>Mots du titre : résultats, révision des perspectives, M&amp;A, dépréciation, financement, contrat.</li>
        <li>Doublons FR/EN fusionnés (version française gardée), une seule publication par société.</li>
      </ul>
      <p>
        Sont retenues les {MAX_SELECTED} meilleures publications avec un score ≥ {SELECTION_THRESHOLD}.
      </p>

      <h2>3. Rédaction</h2>
      <p>
        Le texte du PDF est extrait côté serveur, puis envoyé au LLM avec une consigne stricte : n&apos;utiliser que le
        document, recopier les chiffres sans calcul ni conversion. Sortie structurée (titre, corps, faits clés).
      </p>

      <h2>4. Synthèses jour / mois / année</h2>
      <ul>
        <li>Le LLM reçoit une liste fermée : les publications les plus marquantes de la période (même score), avec leur titre et leur résumé vérifié s&apos;il existe.</li>
        <li>Chaque événement doit citer les identifiants de ses sources ; un événement sans source valide est écarté par le code.</li>
        <li>Les chiffres de chaque événement sont vérifiés uniquement contre les sources qu&apos;il cite.</li>
        <li>Aucune recommandation d&apos;achat ou de vente : la synthèse informe, la décision vous appartient.</li>
      </ul>

      <h2>5. Vérification des chiffres (sans LLM)</h2>
      <ul>
        <li>Tous les nombres du titre, du corps et des faits clés sont extraits par expression régulière, avec leur unité (%, milliers, millions, milliards).</li>
        <li>Les nombres du PDF sont lus en notation française et anglaise ; un jeton ambigu (« 1,234 ») donne deux valeurs candidates.</li>
        <li><b>Trouvé</b> : même valeur et même unité, conversion exacte (1 milliard = 1 000 millions), ou cellule de tableau sans unité écrite avec la même précision.</li>
        <li><b>Arrondi</b> : le document contient une valeur plus précise qui s&apos;arrondit au chiffre du résumé.</li>
        <li><b>Introuvable</b> : le résumé est marqué « à relire » et le chiffre surligné en rouge.</li>
        <li>PDF sans texte extractible (scanné) : aucun résumé n&apos;est généré, statut « non vérifiable ».</li>
      </ul>
      <p>
        Limites : la présence d&apos;un nombre ne prouve pas qu&apos;il est attribué à la bonne métrique ou à la bonne période
        (« 5 % » peut exister ailleurs dans le document) ; les nombres écrits en lettres ne sont pas contrôlés.
      </p>
    </article>
  );
}
