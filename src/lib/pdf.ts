import { extractText, getDocumentProxy } from "unpdf";

export interface SourceText {
  text: string;
  pages: number;
  truncated: boolean;
}

/** Max characters sent to the LLM (~40k tokens). Press releases fit easily; long reports are cut. */
export const MAX_SOURCE_CHARS = 150_000;

export async function fetchPdfText(url: string): Promise<SourceText> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Téléchargement PDF impossible (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const clean = text.replace(/[ \t]+\n/g, "\n").trim();
  return {
    text: clean.slice(0, MAX_SOURCE_CHARS),
    pages: totalPages,
    truncated: clean.length > MAX_SOURCE_CHARS,
  };
}
