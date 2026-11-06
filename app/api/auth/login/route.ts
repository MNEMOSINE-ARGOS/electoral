import { NextResponse } from "next/server";
import { asegurarUsuarios, q } from "@/lib/db";
import { cookieSesion, firmarSesion } from "@/lib/auth";
import { hashFalso, verificarPassword } from "@/lib/password";
import { olvidarUsuario } from "@/lib/vigencia";

// Todos los usuarios (superusuarios y usuarios) están en app_usuario con contraseña bcrypt. Un usuario inactivo no entra.
export async function POST(req: Request) {
  const { usuario, password } = (await req.json().catch(() => ({}))) as { usuario?: string; password?: string };
  const u = (usuario || "").trim().toLowerCase();
  const p = password || "";
  if (!u || !p) return NextResponse.json({ error: "Escribe usuario y contraseña" }, { status: 400 });
  // Errores de configuración del servidor: se dicen tal cual (no son «usuario incorrecto» ni «sin base»). Diagnóstico: /api/salud
  if (!process.env.AUTH_SECRET) return NextResponse.json({ error: "Falta la variable AUTH_SECRET en el servidor. Revisa /api/salud." }, { status: 500 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Falta la variable DATABASE_URL en el servidor. Revisa /api/salud." }, { status: 500 });
  try {
    await asegurarUsuarios();
    const [fila] = await q<{ usuario: string; nombre: string; rol: "super" | "usuario"; password_hash: string; activo: boolean }>(
      "SELECT usuario, nombre, rol, password_hash, activo FROM app_usuario WHERE lower(usuario) = $1", [u]);
    // Siempre se compara contra un hash (aunque el usuario no exista): el tiempo de respuesta no revela qué usuarios existen
    const ok = await verificarPassword(p, fila?.password_hash ?? (await hashFalso()));
    if (!fila || !ok) return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    if (!fila.activo) return NextResponse.json({ error: "Tu usuario está desactivado. Pide a un superusuario que lo active." }, { status: 403 });
    await q("UPDATE app_usuario SET ultimo_acceso = now() WHERE usuario = $1", [fila.usuario]);
    olvidarUsuario(fila.usuario);
    const token = await firmarSesion({ usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol });
    const res = NextResponse.json({ ok: true, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol });
    res.headers.append("Set-Cookie", cookieSesion(token, false, req));
    return res;
  } catch {
    return NextResponse.json({ error: "No se pudo conectar con la base de datos. Revisa /api/salud para ver la causa." }, { status: 503 });
  }
}
