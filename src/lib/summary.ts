import { z } from "zod";
import { currentModel, generateStructured } from "./llm";
import { checkFigures } from "./numbers";
import { fetchPdfText } from "./pdf";
import type { Summary, Publication } from "./types";

const SummarySchema = z.object({
  title: z.string().describe("Titre factuel, 12 mots maximum"),
  body: z.string().describe("Résumé de 100 à 150 mots, en français"),
  key_facts: z.array(z.string()).describe("3 à 5 faits clés, une phrase courte chacun"),
});

export const SYSTEM_PROMPT = `Tu es journaliste financier. Tu rédiges des résumés d'actualité boursière à partir d'un communiqué réglementé déposé auprès de l'AMF.

Règles impératives :
- Uniquement des informations présentes dans le document fourni. Aucune connaissance extérieure, aucun cours de bourse, aucune comparaison non citée dans le document.
- Chaque chiffre doit être recopié tel qu'il apparaît dans le document (même valeur, même unité, même période). Ne calcule rien, n'arrondis pas, ne convertis pas les unités ni les devises.
- Écris les nombres en notation française : espace pour les milliers, virgule pour les décimales (ex. 1 234,5 M€ ; 3,2 %).
- Les montants négatifs notés entre parenthèses dans les tableaux comptables, comme « (4) % » ou « (1 248) M€ », s'écrivent en toutes lettres pour le lecteur : « une marge négative d'environ 4 % », « un cash-flow libre négatif de 1 248 millions d'euros ». N'utilise jamais de parenthèses autour d'un chiffre.
- Mentionne la période concernée (ex. troisième trimestre 2026) quand le document la précise.
- Si le document est en anglais, rédige en français mais garde les chiffres identiques.
- Ton neutre et factuel : pas d'adjectifs promotionnels repris du communiqué sans les attribuer à la société (« selon le groupe »).
- Corps de texte : 100 à 150 mots, un ou deux paragraphes, sans titre ni liste.`;

export function buildUserPrompt(p: Publication, sourceText: string) {
  return `<metadata>
Société : ${p.company}
Titre du dépôt : ${p.title}
Catégorie AMF : ${p.type ?? "?"} > ${p.subtype ?? "?"}
Date de dépôt : ${p.publishedAt}
</metadata>

<document>
${sourceText}
</document>

Rédige le résumé (titre, corps de 100 à 150 mots, 3 à 5 faits clés chiffrés quand c'est possible).`;
}

const countWords = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;

export async function generateSummary(p: Publication): Promise<Summary> {
  if (!p.pdfUrl) throw new Error("Pas de document source");
  const src = await fetchPdfText(p.pdfUrl);
  const base = {
    id: `${p.id}-${Date.now()}`,
    publicationId: p.id,
    sourceUrl: p.pdfUrl,
    model: currentModel(),
    sourceChars: src.text.length,
    sourceTruncated: src.truncated,
    createdAt: new Date().toISOString(),
  };

  // Scanned PDF / image-only document: nothing to ground the summary on -> do not generate.
  if (src.text.replace(/\s/g, "").length < 300) {
    return {
      ...base,
      title: p.title,
      body: "",
      keyFacts: [],
      wordCount: 0,
      figures: [],
      status: "unverifiable",
      statusReason: "Texte du PDF non extractible (document scanné ?) : résumé non généré, vérification impossible.",
    };
  }

  const { data: out, model } = await generateStructured(SummarySchema, SYSTEM_PROMPT, buildUserPrompt(p, src.text));

  // Verify every number of title + body + key facts against the source text.
  const figures = checkFigures([out.title, out.body, ...out.key_facts].join("\n"), src.text);
  const wordCount = countWords(out.body);
  const missing = figures.filter((f) => f.status === "not_found");
  const problems: string[] = [];
  if (missing.length) problems.push(`${missing.length} chiffre(s) introuvable(s) dans la source : ${missing.map((m) => m.raw).join(", ")}`);
  if (wordCount < 100 || wordCount > 150) problems.push(`longueur hors cible (${wordCount} mots)`);
  if (src.truncated) problems.push("document source tronqué pour le modèle");

  return {
    ...base,
    model,
    title: out.title,
    body: out.body,
    keyFacts: out.key_facts,
    wordCount,
    figures,
    status: problems.length ? "needs_review" : "verified",
    statusReason: problems.length
      ? `À relire : ${problems.join(" ; ")}.`
      : `${figures.length} chiffre(s) retrouvé(s) dans le document source.`,
  };
}
