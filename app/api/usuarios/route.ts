import { NextResponse } from "next/server";
import { asegurarUsuarios, q } from "@/lib/db";
import { soloSuper } from "@/lib/superusuario";
import { hashPassword, validarPassword } from "@/lib/password";
import { RE_USUARIO } from "@/lib/config";

export async function GET(req: Request) {
  const r = await soloSuper(req);
  if (r.error) return r.error;
  await asegurarUsuarios();
  const filas = await q("SELECT id, usuario, nombre, rol, activo, creado_en, creado_por, ultimo_acceso FROM app_usuario ORDER BY rol = 'usuario', id");
  return NextResponse.json({ yo: r.s!.usuario, usuarios: filas });
}

export async function POST(req: Request) {
  const r = await soloSuper(req);
  if (r.error) return r.error;
  const b = (await req.json().catch(() => ({}))) as { usuario?: string; nombre?: string; password?: string; rol?: string; activo?: boolean };
  const u = (b.usuario || "").trim().toLowerCase();
  if (!RE_USUARIO.test(u)) return NextResponse.json({ error: "Usuario: un correo electrónico o de 3 a 32 caracteres (letras, números, . _ -)" }, { status: 400 });
  if (!b.nombre || b.nombre.trim().length < 2) return NextResponse.json({ error: "Escribe el nombre" }, { status: 400 });
  const err = validarPassword(b.password);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const rol = b.rol === "super" ? "super" : "usuario";
  const activo = b.activo !== false;
  await asegurarUsuarios();
  try {
    const [fila] = await q(
      "INSERT INTO app_usuario (usuario, nombre, rol, password_hash, activo, creado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, usuario, nombre, rol, activo, creado_en",
      [u, b.nombre.trim(), rol, await hashPassword(b.password!), activo, r.s!.usuario]);
    return NextResponse.json({ usuario: fila }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return NextResponse.json({ error: "Ese usuario ya existe" }, { status: 409 });
    return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 });
  }
}
