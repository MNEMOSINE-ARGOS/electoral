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
  // PREP registrado (lib/prep.ts): si la entidad no está en la base se agrega desde el archivo; si ya se cargó a la base
  // (scripts/cargar_prep.ts, fuente «prep_…») se usa la base. En ambos casos va marcado como preliminar en «prep».
  const registrados = extra ? [] : prepDe(eleccion, anio);
  const faltan = registrados.filter((p) => !estados.some((e) => e.id_estado === p.estado));
  const marcar = registrados.filter((p) => faltan.includes(p) || estados.some((e) => e.id_estado === p.estado && e.fuente.startsWith("prep")));
  const todos = [...estados, ...faltan.map(estadoPrep)].sort((a, b) => a.id_estado - b.id_estado);
  return NextResponse.json({ eleccion, anio, estados: todos, prep: Object.fromEntries(marcar.map((p) => [p.estado, metaPrep(p)])) });
}
