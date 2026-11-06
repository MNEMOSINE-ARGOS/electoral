import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verificarSesion, cookieSesion } from "./lib/auth";
import { sesionVigenteDeToken } from "./lib/vigencia";
import { COOKIE_SESION } from "./lib/config";

// Todo requiere sesión salvo el login. La cookie firmada se confirma contra la base: el usuario debe existir y estar ACTIVO
// (caché de 30 s). La administración de usuarios solo es para superusuarios (cada API lo vuelve a comprobar).
// Proxy corre en Node (Next 16), así que puede consultar PostgreSQL.
const PUBLICAS = ["/login", "/api/auth/login", "/api/salud"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p)) return NextResponse.next();
  const token = req.cookies.get(COOKIE_SESION)?.value;
  let s;
  try {
    s = await sesionVigenteDeToken(token);
  } catch {
    // La base no responde: no se puede confirmar si sigue activo; se acepta la cookie firmada (los datos fallarán de todos modos)
    s = await verificarSesion(token);
  }
  if (s) {
    if (pathname.startsWith("/usuarios") && s.rol !== "super") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  const res = pathname.startsWith("/api/")
    ? NextResponse.json({ error: "No autenticado" }, { status: 401 })
    : (() => { const url = new URL("/login", req.url); if (pathname !== "/") url.searchParams.set("next", pathname); return NextResponse.redirect(url); })();
  if (token) res.headers.append("Set-Cookie", cookieSesion("", true, req)); // sesión de un usuario desactivado o eliminado: se borra
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|geo/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
