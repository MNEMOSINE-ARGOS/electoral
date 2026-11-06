import { NextResponse, connection } from "next/server";
import { q } from "@/lib/db";

// Estadísticas de la portada: qué cubre la base. Cambian solo al recargar el pipeline: caché en memoria de 1 hora por instancia.
type Stats = {
  anios: { min: number; max: number; n: number };
  por_anio: { anio: number; federal: number; local: number }[];
  por_cargo: { eleccion: string; elecciones: number; min: number; max: number }[];
  participacion_presidente: { anio: number; votos: number | null; lista: number | null }[];
  lista_nominal: { fecha: string; lista: number }[];
  secciones: number; resultados_seccion: number; municipios: number; distritos_federales: number;
  judicial: { cargos: number; candidaturas: number };
};
const FEDERALES = new Set(["presidente", "senado", "diputados_federales"]);
let cache: { t: number; d: Stats } | null = null;

export async function GET() {
  await connection();
  if (cache && Date.now() - cache.t < 3_600_000) return NextResponse.json(cache.d);
  const [els, rango, part, ln, secc, mun, dis, jud] = await Promise.all([
    q<{ eleccion: string; anio: number }>("SELECT DISTINCT eleccion, anio FROM app_eleccion WHERE NOT extraordinaria"),
    q<{ min: number; max: number; n: string }>("SELECT min(anio) min, max(anio) max, count(DISTINCT anio) n FROM app_eleccion WHERE NOT extraordinaria"),
    q<{ anio: number; votos: string | null; lista: string | null }>(
      "SELECT anio, sum(votos_totales) votos, sum(lista_nominal) FILTER (WHERE lista_nominal > 0) lista FROM agg_est_totales WHERE eleccion='presidente' AND NOT extraordinaria GROUP BY 1 ORDER BY 1"),
    q<{ fecha_corte: Date; lista_total: string }>("SELECT fecha_corte, lista_total FROM ln_corte ORDER BY fecha_corte"),
    q<{ secc: string; filas: string }>("SELECT count(DISTINCT seccion_id) secc, count(*) filas FROM sec_resumen WHERE seccion_confiable"),
    q<{ n: string }>("SELECT count(*) n FROM app_municipio"),
    q<{ n: string }>("SELECT count(*) n FROM agg_dis_totales WHERE eleccion='diputados_federales' AND tipo='federal' AND anio=(SELECT max(anio) FROM agg_dis_totales WHERE eleccion='diputados_federales' AND tipo='federal') AND NOT extraordinaria"),
    q<{ cargos: string; cand: string }>("SELECT count(DISTINCT eleccion) cargos, count(*) cand FROM jud_candidatura"),
  ]);
  const porAnio = new Map<number, { federal: number; local: number }>();
  const porCargo = new Map<string, number[]>();
  for (const e of els) {
    const a = porAnio.get(e.anio) ?? { federal: 0, local: 0 };
    a[FEDERALES.has(e.eleccion) ? "federal" : "local"]++;
    porAnio.set(e.anio, a);
    porCargo.set(e.eleccion, [...(porCargo.get(e.eleccion) ?? []), e.anio]);
  }
  const d: Stats = {
    anios: { min: rango[0].min, max: rango[0].max, n: Number(rango[0].n) },
    por_anio: [...porAnio].map(([anio, v]) => ({ anio, ...v })).sort((a, b) => a.anio - b.anio),
    por_cargo: [...porCargo].map(([eleccion, a]) => ({ eleccion, elecciones: a.length, min: Math.min(...a), max: Math.max(...a) })).sort((a, b) => b.elecciones - a.elecciones),
    participacion_presidente: part.map((p) => ({ anio: p.anio, votos: p.votos ? Number(p.votos) : null, lista: p.lista ? Number(p.lista) : null })),
    lista_nominal: ln.map((x) => ({ fecha: new Date(x.fecha_corte).toISOString().slice(0, 10), lista: Number(x.lista_total) })),
    secciones: Number(secc[0].secc), resultados_seccion: Number(secc[0].filas), municipios: Number(mun[0].n), distritos_federales: Number(dis[0].n),
    judicial: { cargos: Number(jud[0].cargos), candidaturas: Number(jud[0].cand) },
  };
  cache = { t: Date.now(), d };
  return NextResponse.json(d);
}
