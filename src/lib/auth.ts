import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * "Paid plan" = a shared password (ACCESS_PASSWORD). Visitors can read everything;
 * actions that call the AMF API or the LLM (sync, briefs, reports) need the Pro plan.
 * The cookie stores an HMAC of the password, never the password itself.
 * Without ACCESS_PASSWORD: unlocked in local dev, but locked in production (fail closed).
 */
export const PLAN_COOKIE = "ecoinfo_plan";

function token(password: string) {
  return createHmac("sha256", password).update("ecoinfo-pro-plan-v1").digest("hex");
}

export const authEnabled = () => !!process.env.ACCESS_PASSWORD;

const devOpen = () => !authEnabled() && process.env.NODE_ENV !== "production";

export function checkPassword(candidate: string) {
  const expected = process.env.ACCESS_PASSWORD;
  if (!expected) return devOpen();
  const a = Buffer.from(token(candidate));
  const b = Buffer.from(token(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const planToken = () => token(process.env.ACCESS_PASSWORD ?? "");

export async function isPro(): Promise<boolean> {
  if (!authEnabled()) return devOpen();
  const c = (await cookies()).get(PLAN_COOKIE)?.value;
  if (!c) return false;
  const a = Buffer.from(c);
  const b = Buffer.from(planToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** For API routes: null if allowed, otherwise the 402 response body. */
export async function requirePro() {
  return (await isPro())
    ? null
    : { error: "Fonctionnalité réservée au plan Pro Recruteur. Rendez-vous sur /abonnement." };
}
