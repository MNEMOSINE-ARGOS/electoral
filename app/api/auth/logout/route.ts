import { NextResponse } from "next/server";
import { cookieSesion } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", cookieSesion("", true, req));
  return res;
}
