import { NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { missingKey } from "@/lib/llm";
import { generateReport, reportCandidates } from "@/lib/reports";
import { MAX_GENERATIONS_PER_RUN, planReports } from "@/lib/schedule";
import { getStore } from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Nightly job (Vercel Cron, just after midnight UTC, Authorization: Bearer CRON_SECRET):
 * 1. sync the last days of AMF filings, so the day that just ended is complete;
 * 2. generate the reports that are due: the day that ended, the month / year when they end,
 *    and any missed or provisional report of recent completed periods (see lib/schedule.ts).
 * Periods without any notable publication (weekends, holidays) are skipped without an LLM call.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const log: Record<string, string> = {};
  try {
    const sync = await ingest(5);
    log.sync = `${sync.stored} publications, ${sync.selected.length} retenues`;
  } catch (e) {
    log.sync = `échec : ${(e as Error).message}`;
  }

  if (missingKey()) return NextResponse.json({ ...log, reports: `${missingKey()} manquante` }, { status: 500 });

  const store = getStore();
  const plan = planReports(new Date(), await store.listReports(), 50);
  let generated = 0;
  for (const t of plan) {
    const id = `${t.period}:${t.key}`;
    if (generated >= MAX_GENERATIONS_PER_RUN) {
      log[id] = "reporté (quota de la nuit atteint)";
      continue;
    }
    if (Date.now() - started > 220_000) {
      log[id] = "reporté (temps d'exécution)";
      continue;
    }
    if ((await reportCandidates(t.period, t.key)).length === 0) {
      log[id] = "ignoré : aucune publication marquante";
      continue;
    }
    try {
      generated++;
      const r = await generateReport(t.period, t.key);
      await store.saveReport(r);
      log[id] = `${t.reason} : ${r.status}, ${r.events.length} événements`;
    } catch (e) {
      log[id] = `${t.reason} : échec (${(e as Error).message}), réessayé la nuit prochaine`;
    }
  }
  console.log("[cron]", JSON.stringify(log));
  return NextResponse.json(log);
}
