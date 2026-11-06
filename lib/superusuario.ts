import { NextResponse } from "next/server";
import { sesionVigente } from "./vigencia";

/** Exige sesión vigente de un superusuario activo. */
export async function soloSuper(req: Request) {
  const s = await sesionVigente(req);
  if (!s) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (s.rol !== "super") return { error: NextResponse.json({ error: "Solo un superusuario administra usuarios" }, { status: 403 }) };
  return { s };
}
