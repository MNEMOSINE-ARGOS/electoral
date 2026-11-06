import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { sesionVigente } from "@/lib/vigencia";
import { hashPassword, validarPassword, verificarPassword } from "@/lib/password";

// Cambiar MI contraseña (cualquier usuario activo): pide la actual.
export async function POST(req: Request) {
  const s = await sesionVigente(req);
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { actual, nueva } = (await req.json().catch(() => ({}))) as { actual?: string; nueva?: string };
  const err = validarPassword(nueva);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const [f] = await q<{ password_hash: string }>("SELECT password_hash FROM app_usuario WHERE usuario = $1", [s.usuario]);
  if (!f || !(await verificarPassword(actual || "", f.password_hash))) return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  await q("UPDATE app_usuario SET password_hash = $1 WHERE usuario = $2", [await hashPassword(nueva!), s.usuario]);
  return NextResponse.json({ ok: true });
}
