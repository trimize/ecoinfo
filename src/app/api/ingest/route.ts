import { NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 5));
  try {
    return NextResponse.json(await ingest(days));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Vercel Cron calls GET with the CRON_SECRET bearer token.
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return POST(req);
}
