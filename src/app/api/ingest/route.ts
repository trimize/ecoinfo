import { NextResponse } from "next/server";
import { requirePro } from "@/lib/auth";
import { ingest } from "@/lib/ingest";
import { missingKey } from "@/lib/llm";
import { generateReport } from "@/lib/reports";
import { getStore } from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const daysParam = (req: Request) => Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 5));

/** Manual sync from the UI (Pro plan). */
export async function POST(req: Request) {
  const denied = await requirePro();
  if (denied) return NextResponse.json(denied, { status: 402 });
  try {
    return NextResponse.json(await ingest(daysParam(req)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Daily Vercel Cron (Authorization: Bearer CRON_SECRET): sync, then refresh the summaries of the
 * latest day and the current month so that visitors always land on an up-to-date report.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await ingest(daysParam(req));
    const reports: Record<string, string> = {};
    if (!missingKey()) {
      const store = getStore();
      const day = await store.latestDay();
      for (const [period, key] of [["day", day], ["month", day?.slice(0, 7)]] as const) {
        if (!key) continue;
        try {
          await store.saveReport(await generateReport(period, key));
          reports[`${period}:${key}`] = "ok";
        } catch (e) {
          reports[`${period}:${key}`] = (e as Error).message;
        }
      }
    }
    return NextResponse.json({ ...result, reports });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
