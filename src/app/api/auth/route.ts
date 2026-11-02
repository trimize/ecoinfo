import { NextResponse } from "next/server";
import { checkPassword, PLAN_COOKIE, planToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  // Small constant delay: makes online guessing slower.
  await new Promise((r) => setTimeout(r, 400));
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Code invalide. Le service commercial a été prévenu (non)." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLAN_COOKIE, planToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PLAN_COOKIE);
  return res;
}
