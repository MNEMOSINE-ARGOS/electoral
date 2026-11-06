import { NextResponse } from "next/server";
import { cookieSesion } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", cookieSesion("", true));
  return res;
}
