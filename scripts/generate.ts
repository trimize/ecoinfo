/** Generate summaries for the currently selected publications (or the ids passed as arguments). */
import { generateSummary } from "../src/lib/summary";
import { getStore } from "../src/lib/store";

async function main() {
const store = getStore();
const ids = process.argv.slice(2);
const pubs = ids.length
  ? (await Promise.all(ids.map((id) => store.getPublication(id)))).filter((p) => p !== null)
  : await store.listPublications({ selectedOnly: true });
for (const p of pubs) {
  try {
    const b = await generateSummary(p);
    await store.saveSummary(b);
    console.log(`\n[${b.status}] ${p.company} (${b.model}, ${b.wordCount} mots) — ${b.statusReason}\n# ${b.title}\n${b.body}`);
    for (const f of b.figures) console.log(`  ${f.status.padEnd(9)} ${f.raw.padEnd(14)} ${f.matchedAs ?? ""}`);
  } catch (e) {
    console.log(`\n[ERROR] ${p.company}: ${(e as Error).message}`);
  }
}
}
main();
