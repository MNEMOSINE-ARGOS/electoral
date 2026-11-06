import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { eraDistrital } from "@/lib/analisis";

// Un distrito: su historia en elecciones del MISMO tipo y la MISMA era distrital, y los municipios que lo integran.
// ?eleccion=diputados_federales&anio=2024&id=503
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "diputados_federales";
  const anio = Number(u.searchParams.get("anio"));
  const id = Number(u.searchParams.get("id"));
  if (!anio || !id) return NextResponse.json({ error: "Faltan anio e id" }, { status: 400 });
  const federal = !eleccion.startsWith("diputados_locales");
  const filas = await q<{ anio: number; partido: string; votos: string }>(
    "SELECT anio, partido, votos FROM agg_dis_votos WHERE eleccion = $1 AND id_distrito = $2 AND extraordinaria = false ORDER BY anio", [eleccion, id]);
  const tots = await q<{ anio: number; votos_totales: string | null; lista_nominal: string | null; secciones: string; confianza: string | null }>(
    "SELECT anio, votos_totales, lista_nominal, secciones, confianza FROM agg_dis_totales WHERE eleccion = $1 AND id_distrito = $2 AND extraordinaria = false ORDER BY anio", [eleccion, id]);
  const era = eraDistrital(anio);
  const historia = tots.filter((t) => (federal ? eraDistrital(t.anio) === era : true)).map((t) => {
    const partidos: Record<string, number> = {};
    for (const f of filas) if (f.anio === t.anio) partidos[f.partido] = Number(f.votos);
    return { anio: t.anio, votos_totales: t.votos_totales ? Number(t.votos_totales) : null, lista_nominal: t.lista_nominal ? Number(t.lista_nominal) : null, secciones: Number(t.secciones), confianza: t.confianza, partidos };
  });
  const col = federal ? "s.id_distrito_federal" : "s.id_distrito_local";
  const municipios = await q(
    `SELECT s.clave_inegi, m.nombre, count(*) AS secciones, sum(s.votos_totales) AS votos_totales
     FROM sec_resumen s LEFT JOIN app_municipio m USING (clave_inegi)
     WHERE s.eleccion = $1 AND s.anio = $2 AND s.extraordinaria = false AND ${col} = $3 GROUP BY 1,2 ORDER BY 4 DESC NULLS LAST`,
    [eleccion, anio, id]);
  return NextResponse.json({
    eleccion, anio, id_distrito: id, era: federal ? era : null, historia, municipios,
    aviso: federal ? `Historia limitada a elecciones con el mismo mapa distrital (era ${era}); el distrito ${id} de otra era es otra geografía.` : "Los distritos locales se redibujan por estado en fechas distintas: la historia no se verificó como comparable.",
  });
}
