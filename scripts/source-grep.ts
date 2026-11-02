/** Usage: npx tsx scripts/source-grep.ts <pdfUrl> <regex> — print source passages matching a pattern. */
import { normalizeText } from "../src/lib/numbers";
import { fetchPdfText } from "../src/lib/pdf";

const [url, pattern] = process.argv.slice(2);
fetchPdfText(url).then(({ text }) => {
  const t = normalizeText(text).replace(/\s+/g, " ");
  for (const m of t.matchAll(new RegExp(pattern, "gi"))) console.log("…" + t.slice(Math.max(0, m.index! - 120), m.index! + 160) + "…\n");
});
