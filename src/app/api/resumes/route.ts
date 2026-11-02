import { NextResponse } from "next/server";
import { requirePro } from "@/lib/auth";
import { generateSummary } from "@/lib/summary";
import { missingKey } from "@/lib/llm";
import { getStore } from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST { publicationId } -> generate (or regenerate) the summary for one publication. */
export async function POST(req: Request) {
  const denied = await requirePro();
  if (denied) return NextResponse.json(denied, { status: 402 });
  const { publicationId } = (await req.json().catch(() => ({}))) as { publicationId?: string };
  if (!publicationId) return NextResponse.json({ error: "publicationId requis" }, { status: 400 });
  const store = getStore();
  const pub = await store.getPublication(publicationId);
  if (!pub) return NextResponse.json({ error: "publication inconnue" }, { status: 404 });
  const missing = missingKey();
  if (missing) return NextResponse.json({ error: `${missing} manquante` }, { status: 500 });
  try {
    const summary = await generateSummary(pub);
    await store.saveSummary(summary);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
