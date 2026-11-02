import { NextResponse } from "next/server";
import { generateBrief } from "@/lib/brief";
import { missingKey } from "@/lib/llm";
import { getStore } from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST { publicationId } -> generate (or regenerate) the brief for one publication. */
export async function POST(req: Request) {
  const { publicationId } = (await req.json().catch(() => ({}))) as { publicationId?: string };
  if (!publicationId) return NextResponse.json({ error: "publicationId requis" }, { status: 400 });
  const store = getStore();
  const pub = await store.getPublication(publicationId);
  if (!pub) return NextResponse.json({ error: "publication inconnue" }, { status: 404 });
  const missing = missingKey();
  if (missing) return NextResponse.json({ error: `${missing} manquante` }, { status: 500 });
  try {
    const brief = await generateBrief(pub);
    await store.saveBrief(brief);
    return NextResponse.json(brief);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
