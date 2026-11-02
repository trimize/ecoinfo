/** Dry run of the nightly job: what would be generated at a given time (no LLM call). Usage: npm run cron-plan -- [ISO date] */
import { reportCandidates } from "../src/lib/reports";
import { MAX_GENERATIONS_PER_RUN, planReports } from "../src/lib/schedule";
import { getStore } from "../src/lib/store";

async function main() {
  const now = new Date(process.argv[2] ?? Date.now());
  const reports = await getStore().listReports();
  console.log(`Run at ${now.toISOString()} — existing reports: ${reports.map((r) => `${r.id} (${r.createdAt.slice(0, 16)})`).join(", ")}`);
  let llm = 0;
  for (const t of planReports(now, reports, 50)) {
    const n = (await reportCandidates(t.period, t.key)).length;
    const action = n === 0 ? "skip (no notable publication)" : llm < MAX_GENERATIONS_PER_RUN ? (llm++, "GENERATE") : "deferred (cap)";
    console.log(`  ${`${t.period}:${t.key}`.padEnd(16)} ${t.reason.padEnd(15)} candidates=${String(n).padEnd(3)} → ${action}`);
  }
}
main();
