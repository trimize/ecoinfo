import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";

/**
 * Structured generation with Google Gemini (free tier, chosen for cost in this exercise).
 * Everything else in the app goes through generateStructured(), so moving to another
 * provider (Claude would be the choice for a production product) only touches this file.
 */
export function currentModel(): string {
  return process.env.LLM_MODEL || "gemini-3.8-flash";
}

export function missingKey(): string | null {
  return process.env.GEMINI_API_KEY ? null : "GEMINI_API_KEY";
}

/** Zod -> JSON Schema, without the "$schema" meta key some APIs reject. */
function jsonSchemaFor(schema: z.ZodType) {
  const { $schema: _meta, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _meta;
  return rest;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free tier quotas are per model and per day (e.g. 20 requests/day on gemini-3.8-flash).
 * When a model's daily quota is exhausted, fall through to the next one; short-lived
 * 429/503 (per-minute quota, overload) are retried on the same model.
 */
const GEMINI_FALLBACKS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

/** Seconds Google asks us to wait (RetryInfo), if any. */
function retryDelaySeconds(e: ApiError): number | null {
  const m = e.message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) : null;
}

async function geminiGenerate<T extends z.ZodType>(schema: T, system: string, user: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const chain = [...new Set([currentModel(), ...GEMINI_FALLBACKS])];
  const errors: string[] = [];
  for (const model of chain) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            temperature: 0.2,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchemaFor(schema),
          },
        });
        const text = res.text;
        if (!text) throw new Error(`Réponse vide (${res.candidates?.[0]?.finishReason ?? "raison inconnue"})`);
        const parsed = schema.safeParse(JSON.parse(text));
        if (!parsed.success) throw new Error(`Sortie structurée invalide : ${parsed.error.message}`);
        return { data: parsed.data as z.infer<T>, model };
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const delay = retryDelaySeconds(e);
        const dailyQuota = e.status === 429 && (delay === null || delay > 90 || /per ?day/i.test(e.message));
        // 404: model not offered to this key; daily quota: no point waiting -> next model.
        if (e.status === 404 || dailyQuota) {
          errors.push(`${model}: ${e.status === 404 ? "indisponible" : "quota du jour épuisé"}`);
          break;
        }
        if ((e.status !== 429 && e.status !== 503) || attempt === 2) {
          errors.push(`${model}: HTTP ${e.status}`);
          break;
        }
        await sleep(((delay ?? 10) + 2) * 1000 * (attempt + 1));
      }
    }
  }
  throw new Error(`Aucun modèle Gemini disponible (${errors.join(" ; ")}). Réessayez plus tard.`);
}

export function generateStructured<T extends z.ZodType>(schema: T, system: string, user: string) {
  return geminiGenerate(schema, system, user);
}
