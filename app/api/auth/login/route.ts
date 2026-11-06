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
    res.headers.append("Set-Cookie", cookieSesion(token));
    return res;
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la base de usuarios" }, { status: 503 });
  }
}
