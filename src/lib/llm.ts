import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";

/**
 * Provider-agnostic structured generation.
 * LLM_PROVIDER=gemini (default, free tier) | anthropic.
 * Both return JSON validated by the same Zod schema, so the rest of the pipeline is identical.
 */
export type Provider = "gemini" | "anthropic";

export function currentProvider(): Provider {
  const p = process.env.LLM_PROVIDER?.toLowerCase();
  if (p === "anthropic" || p === "gemini") return p;
  return process.env.GEMINI_API_KEY || !process.env.ANTHROPIC_API_KEY ? "gemini" : "anthropic";
}

export function currentModel(): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return currentProvider() === "gemini" ? "gemini-3.8-flash" : "claude-opus-5-5";
}

export function missingKey(): string | null {
  if (currentProvider() === "gemini") return process.env.GEMINI_API_KEY ? null : "GEMINI_API_KEY";
  return process.env.ANTHROPIC_API_KEY ? null : "ANTHROPIC_API_KEY";
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

// Server-side refusal fallback is only offered on some Claude models.
const SUPPORTS_FALLBACK = /^claude-(opus-5|fable-5|sonnet-5-5)/;

async function anthropicGenerate<T extends z.ZodType>(schema: T, system: string, user: string) {
  const client = new Anthropic();
  const model = currentModel();
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    ...(SUPPORTS_FALLBACK.test(model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("Le modèle a refusé la requête");
  if (response.stop_reason === "max_tokens") throw new Error("Réponse tronquée (max_tokens)");
  if (!response.parsed_output) throw new Error("Sortie structurée invalide");
  return { data: response.parsed_output as z.infer<T>, model: response.model };
}

export function generateStructured<T extends z.ZodType>(schema: T, system: string, user: string) {
  return currentProvider() === "gemini" ? geminiGenerate(schema, system, user) : anthropicGenerate(schema, system, user);
}
