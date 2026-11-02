/** Usage: npm run backfill -- 2026-01-01 [2026-11-02] — load history for month / year summaries. */
import { backfill } from "../src/lib/ingest";

const [from, to = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!from) throw new Error("Usage: backfill <from YYYY-MM-DD> [to]");
backfill(from, to, console.log).then((n) => console.log(`Total : ${n} publications`));
