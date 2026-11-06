import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Agrupa los resultados por ENTIDAD en las 5 circunscripciones plurinominales (CPEUM art. 53). Para presidente, senado y
// diputados federales (la circunscripción reparte los diputados de RP; no tiene boleta propia). ?eleccion=diputados_federales&anio=2024
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "diputados_federales";
  const anio = Number(u.searchParams.get("anio"));
  if (!anio) return NextResponse.json({ error: "Falta anio" }, { status: 400 });
  const era = anio >= 2024 ? 2024 : 2021;
  const votos = await q<{ circunscripcion: number; cabecera: string; partido: string; votos: string }>(
    `SELECT c.circunscripcion, c.cabecera, v.partido, sum(v.votos) AS votos FROM agg_est_votos v JOIN app_circunscripcion c ON c.id_estado = v.id_estado AND c.era = $3
     WHERE v.eleccion = $1 AND v.anio = $2 AND v.extraordinaria = false GROUP BY 1,2,3`, [eleccion, anio, era]);
  const tots = await q<{ circunscripcion: number; votos_totales: string | null; lista_nominal: string | null; estados: string }>(
    `SELECT c.circunscripcion, sum(t.votos_totales) AS votos_totales, sum(t.lista_nominal) AS lista_nominal, string_agg(e.abreviatura, ' · ' ORDER BY e.id_estado) AS estados
     FROM agg_est_totales t JOIN app_circunscripcion c ON c.id_estado = t.id_estado AND c.era = $3 JOIN app_estado e ON e.id_estado = t.id_estado
     WHERE t.eleccion = $1 AND t.anio = $2 AND t.extraordinaria = false GROUP BY 1 ORDER BY 1`, [eleccion, anio, era]);
  const out = tots.map((t) => {
    const partidos: Record<string, number> = {};
    let cabecera = "";
    for (const v of votos) if (v.circunscripcion === t.circunscripcion) { partidos[v.partido] = Number(v.votos); cabecera = v.cabecera; }
    return { circunscripcion: t.circunscripcion, cabecera, estados: t.estados, votos_totales: t.votos_totales ? Number(t.votos_totales) : null, lista_nominal: t.lista_nominal ? Number(t.lista_nominal) : null, partidos };
  });
  return NextResponse.json({
    eleccion, anio, era, circunscripciones: out,
    aviso: era === 2021
      ? "Composición anterior a 2024 (Querétaro en la 2ª, Hidalgo en la 5ª), tomada de fuentes de 2017-2021: no verificada contra el acuerdo original."
      : "Composición vigente desde 2024 (INE/CG130/2023), confirmada con el archivo de la sala regional del TEPJF 2025.",
  });
}
