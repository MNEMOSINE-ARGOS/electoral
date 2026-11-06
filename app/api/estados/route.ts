import { NextResponse } from "next/server";
import { porEstado } from "@/lib/consultas";
import { prepDe, estadoPrep, metaPrep } from "@/lib/prep";

// Pantalla 2. ?eleccion=presidente&anio=2018[&extra=1] → los 32 estados de UNA elección (tipo + año).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  if (!anio) return NextResponse.json({ error: "Falta anio" }, { status: 400 });
  const extra = u.searchParams.get("extra") === "1";
  const estados = await porEstado(eleccion, anio, extra);
  // Entidades sin datos en la base pero con PREP registrado (lib/prep.ts): se agregan, marcadas como preliminares en «prep»
  const prep = extra ? [] : prepDe(eleccion, anio).filter((p) => !estados.some((e) => e.id_estado === p.estado));
  const todos = [...estados, ...prep.map(estadoPrep)].sort((a, b) => a.id_estado - b.id_estado);
  return NextResponse.json({ eleccion, anio, estados: todos, prep: Object.fromEntries(prep.map((p) => [p.estado, metaPrep(p)])) });
}
