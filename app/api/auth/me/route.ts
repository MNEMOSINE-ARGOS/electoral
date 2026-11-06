import { NextResponse } from "next/server";
import { sesionVigente } from "@/lib/vigencia";

export async function GET(req: Request) {
  const s = await sesionVigente(req);
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ usuario: s.usuario, nombre: s.nombre, rol: s.rol });
}
