/** Usage: npx tsx scripts/check-figures.ts <pdfUrl> "<brief text>" */
import { checkFigures } from "../src/lib/numbers";
import { fetchPdfText } from "../src/lib/pdf";

const [url, text] = process.argv.slice(2);
fetchPdfText(url).then((src) => {
  console.log(`pages=${src.pages} chars=${src.text.length} truncated=${src.truncated}`);
  if (!text) return console.log(src.text.slice(0, 3000));
  for (const f of checkFigures(text, src.text)) console.log(f.status.padEnd(9), f.raw.padEnd(14), "<-", f.matchedAs ?? "", "|", (f.evidence ?? "").slice(0, 110));
});
