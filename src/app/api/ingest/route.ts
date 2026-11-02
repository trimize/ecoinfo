import { NextResponse } from "next/server";
import { requirePro } from "@/lib/auth";
import { ingest } from "@/lib/ingest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const daysParam = (req: Request) => Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 5));

/** Manual sync from the UI (Pro plan). */
export async function POST(req: Request) {
  const denied = await requirePro();
  if (denied) return NextResponse.json(denied, { status: 402 });
  try {
    return NextResponse.json(await ingest(daysParam(req)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
