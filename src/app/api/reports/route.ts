import { NextResponse } from "next/server";
import { requirePro } from "@/lib/auth";
import { missingKey } from "@/lib/llm";
import { generateReport } from "@/lib/reports";
import { getStore } from "@/lib/store";
import type { Period } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST { period, key } -> generate (or regenerate) the summary of that period. */
export async function POST(req: Request) {
  const denied = await requirePro();
  if (denied) return NextResponse.json(denied, { status: 402 });
  const { period, key } = (await req.json().catch(() => ({}))) as { period?: Period; key?: string };
  if (!period || !["day", "month", "year"].includes(period) || !key) {
    return NextResponse.json({ error: "period (day|month|year) et key requis" }, { status: 400 });
  }
  const missing = missingKey();
  if (missing) return NextResponse.json({ error: `${missing} manquante` }, { status: 500 });
  try {
    const report = await generateReport(period, key);
    await getStore().saveReport(report);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
