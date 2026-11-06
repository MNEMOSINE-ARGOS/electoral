// Sesión = cookie firmada (HMAC-SHA256, Web Crypto: funciona en el proxy y en los route handlers).
import { COOKIE_SESION, DURACION_SESION_S } from "./config";

export type Sesion = { usuario: string; nombre: string; rol: "super" | "usuario"; exp: number };

const enc = new TextEncoder();

function secreto(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET en .env.local");
  return s;
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deb64url(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function clave(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secreto()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function firmarSesion(s: Omit<Sesion, "exp">): Promise<string> {
  const carga: Sesion = { ...s, exp: Math.floor(Date.now() / 1000) + DURACION_SESION_S };
  const cuerpo = b64url(enc.encode(JSON.stringify(carga)));
  const firma = await crypto.subtle.sign("HMAC", await clave(), enc.encode(cuerpo));
  return `${cuerpo}.${b64url(firma)}`;
}

export async function verificarSesion(token: string | undefined | null): Promise<Sesion | null> {
  if (!token) return null;
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await clave(), deb64url(firma) as BufferSource, enc.encode(cuerpo));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(deb64url(cuerpo))) as Sesion;
    return s.exp > Math.floor(Date.now() / 1000) ? s : null;
  } catch {
    return null;
  }
}

export function leerCookie(req: Request, nombre = COOKIE_SESION): string | undefined {
  const c = req.headers.get("cookie") || "";
  for (const parte of c.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export async function sesionDe(req: Request): Promise<Sesion | null> {
  return verificarSesion(leerCookie(req));
}

/** ¿La petición llegó por HTTPS? Detrás de un proxy (Coolify/Traefik, Nginx) se lee x-forwarded-proto. */
export function esHttps(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === "production";
  const fwd = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return (fwd ?? new URL(req.url).protocol.replace(":", "")) === "https";
}

/** Cookie de sesión. «Secure» solo si la petición llegó por HTTPS: con Secure sobre http el navegador la descarta y el login no entra. */
export function cookieSesion(token: string, borrar = false, req?: Request): string {
  const seguro = esHttps(req) ? "; Secure" : "";
  return `${COOKIE_SESION}=${borrar ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${borrar ? 0 : DURACION_SESION_S}${seguro}`;
}
