import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { hashPassword, validarPassword } from "@/lib/password";
import { olvidarUsuario } from "@/lib/vigencia";
import { soloSuper } from "@/lib/superusuario";

type Ctx = { params: Promise<{ id: string }> };

async function validar(req: Request, ctx: Ctx) {
  const r = await soloSuper(req);
  if (r.error) return { error: r.error };
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return { error: NextResponse.json({ error: "Id inválido" }, { status: 400 }) };
  const [obj] = await q<{ usuario: string; rol: string; activo: boolean }>("SELECT usuario, rol, activo FROM app_usuario WHERE id = $1", [id]);
  if (!obj) return { error: NextResponse.json({ error: "No existe" }, { status: 404 }) };
  return { id, yo: r.s!.usuario, obj };
}
/** ¿Queda al menos otro superusuario activo además de este? */
async function quedaOtroSuper(id: number) {
  const [x] = await q<{ n: string }>("SELECT count(*) AS n FROM app_usuario WHERE rol = 'super' AND activo AND id <> $1", [id]);
  return Number(x.n) > 0;
}

// Activar/desactivar, cambiar nombre, rol o restablecer contraseña
export async function PATCH(req: Request, ctx: Ctx) {
  const v = await validar(req, ctx);
  if (v.error) return v.error;
  const b = (await req.json().catch(() => ({}))) as { activo?: boolean; nombre?: string; password?: string; rol?: string };
  const pierdeSuper = v.obj.rol === "super" && v.obj.activo && (b.activo === false || (b.rol !== undefined && b.rol !== "super"));
  if (pierdeSuper && v.obj.usuario === v.yo) return NextResponse.json({ error: "No puedes desactivarte ni quitarte el rol de superusuario a ti mismo" }, { status: 400 });
  if (pierdeSuper && !(await quedaOtroSuper(v.id))) return NextResponse.json({ error: "Debe quedar al menos un superusuario activo" }, { status: 400 });
  const sets: string[] = [], vals: unknown[] = [];
  if (typeof b.activo === "boolean") { vals.push(b.activo); sets.push(`activo = $${vals.length}`); }
  if (b.rol === "super" || b.rol === "usuario") { vals.push(b.rol); sets.push(`rol = $${vals.length}`); }
  if (b.nombre !== undefined) {
    if (b.nombre.trim().length < 2) return NextResponse.json({ error: "Escribe el nombre" }, { status: 400 });
    vals.push(b.nombre.trim()); sets.push(`nombre = $${vals.length}`);
  }
  if (b.password !== undefined) {
    const err = validarPassword(b.password);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    vals.push(await hashPassword(b.password)); sets.push(`password_hash = $${vals.length}`);
  }
  if (!sets.length) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
  vals.push(v.id);
  const filas = await q(`UPDATE app_usuario SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING id, usuario, nombre, rol, activo`, vals);
  olvidarUsuario(v.obj.usuario);
  return NextResponse.json({ usuario: filas[0] });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const v = await validar(req, ctx);
  if (v.error) return v.error;
  if (v.obj.usuario === v.yo) return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  if (v.obj.rol === "super" && v.obj.activo && !(await quedaOtroSuper(v.id))) return NextResponse.json({ error: "Debe quedar al menos un superusuario activo" }, { status: 400 });
  await q("DELETE FROM app_usuario WHERE id = $1", [v.id]);
  olvidarUsuario(v.obj.usuario);
  return NextResponse.json({ ok: true });
}
