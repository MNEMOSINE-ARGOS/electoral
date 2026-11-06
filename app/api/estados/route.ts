import { NextResponse } from "next/server";
import { porEstado } from "@/lib/consultas";

// Pantalla 2. ?eleccion=presidente&anio=2018[&extra=1] → los 32 estados de UNA elección (tipo + año).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  if (!anio) return NextResponse.json({ error: "Falta anio" }, { status: 400 });
  const estados = await porEstado(eleccion, anio, u.searchParams.get("extra") === "1");
  return NextResponse.json({ eleccion, anio, estados });
}
