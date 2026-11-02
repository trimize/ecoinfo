/** Usage: npm run report -- day 2026-11-02 | month 2026-10 | year 2026 */
import { generateReport } from "../src/lib/reports";
import { getStore } from "../src/lib/store";
import type { Period } from "../src/lib/types";

async function main() {
  const [period, key] = process.argv.slice(2) as [Period, string];
  const r = await generateReport(period, key);
  await getStore().saveReport(r);
  console.log(`[${r.status}] ${r.id} (${r.model}) — ${r.statusReason}\n# ${r.headline}\n${r.overview}\n`);
  for (const e of r.events) {
    console.log(`- [${e.status}/${e.tone}] ${e.title} (${e.sourceIds.join(", ")})\n  ${e.summary}\n  → ${e.whyItMatters}`);
    for (const f of e.figures.filter((f) => f.status !== "verified")) console.log(`    ${f.status}: ${f.raw}`);
  }
}
main();
