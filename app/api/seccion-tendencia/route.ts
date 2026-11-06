import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { analizar, pcts, type Eleccion } from "@/lib/tendencia";

const CARGOS = ["presidente", "senado", "diputados_federales", "gobernador", "diputados_locales_mr", "alcaldes"];

// Tendencia de una sección frente al país y a su estado: ?id=50338
// Para cada elección ordinaria de la sección se toma el reparto por bloque de la sección, del país (suma de las
// entidades con esa elección ese año) y de su estado, con la fuente recomendada de cada estado-año (agg_est_votos).
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const edo = Math.floor(id / 10000);
  const sv = await q<{ eleccion: string; anio: number; partido: string; votos: string }>(
    `SELECT r.eleccion, r.anio, c.partido, sum(v.votos) AS votos
     FROM sec_resumen r JOIN sec_votos v ON v.totales_id = r.totales_id JOIN app_partido_codigo c ON c.codigo = v.partido
     WHERE r.seccion_id = $1 AND r.extraordinaria = false AND r.eleccion = ANY($2::text[]) GROUP BY 1,2,3`, [id, CARGOS]);
  const sec = new Map<string, Record<string, number>>();
  for (const x of sv) { const k = `${x.eleccion}|${x.anio}`; if (!sec.has(k)) sec.set(k, {}); sec.get(k)![x.partido] = Number(x.votos); }
  if (!sec.size) return NextResponse.json({ seccion_id: id, filas: [], resumen: null, pares: [], concurrentes: [], arrastre: null });

  const claves = [...sec.keys()].map((k) => k.split("|"));
  const nv = await q<{ eleccion: string; anio: number; id_estado: number; partido: string; votos: string }>(
    `SELECT v.eleccion, v.anio, v.id_estado, v.partido, sum(v.votos) AS votos FROM agg_est_votos v
     JOIN unnest($1::text[], $2::int[]) AS k(e, a) ON k.e = v.eleccion AND k.a = v.anio
     WHERE v.extraordinaria = false GROUP BY 1,2,3,4`, [claves.map((c) => c[0]), claves.map((c) => Number(c[1]))]);
  const nac = new Map<string, Record<string, number>>(), est = new Map<string, Record<string, number>>(), nEdos = new Map<string, Set<number>>();
  for (const x of nv) {
    const k = `${x.eleccion}|${x.anio}`, v = Number(x.votos);
    if (!nac.has(k)) { nac.set(k, {}); nEdos.set(k, new Set()); }
    nac.get(k)![x.partido] = (nac.get(k)![x.partido] ?? 0) + v; nEdos.get(k)!.add(Number(x.id_estado));
    if (Number(x.id_estado) === edo) { if (!est.has(k)) est.set(k, {}); est.get(k)![x.partido] = (est.get(k)![x.partido] ?? 0) + v; }
  }
  const els: Eleccion[] = [];
  for (const [k, votos] of sec) {
    const [eleccion, a] = k.split("|");
    const t = Object.values(votos).reduce((x, y) => x + y, 0);
    if (!t || !nac.has(k)) continue;
    els.push({ eleccion, anio: Number(a), sec: pcts(votos, Number(a)), nac: pcts(nac.get(k)!, Number(a)), edo: pcts(est.get(k) ?? {}, Number(a)), votos: t });
  }
  const r = analizar(els);
  // Referencia: la misma medida en todas las secciones (tabla precalculada por scripts/db/preparar_app_tendencia.py)
  const [pos] = await q<{ pctl_r_nac: number | null; pctl_r_nac_estado: number | null; pctl_dist_nac: number | null; clave_inegi: number | null }>(
    "SELECT pctl_r_nac, pctl_r_nac_estado, pctl_dist_nac, clave_inegi FROM app_sec_tendencia WHERE seccion_id = $1", [id]).catch(() => []);
  const refs = await q<Record<string, number | string | null>>(
    `SELECT f.*, CASE f.nivel WHEN 'estado' THEN e.nombre WHEN 'municipio' THEN m.nombre ELSE 'País' END AS nombre FROM app_tendencia_ref f
     LEFT JOIN app_estado e ON f.nivel = 'estado' AND e.id_estado = f.clave LEFT JOIN app_municipio m ON f.nivel = 'municipio' AND m.clave_inegi = f.clave
     WHERE (f.nivel = 'pais') OR (f.nivel = 'estado' AND f.clave = $1) OR (f.nivel = 'municipio' AND f.clave = $2) ORDER BY CASE f.nivel WHEN 'pais' THEN 0 WHEN 'estado' THEN 1 ELSE 2 END`,
    [edo, pos?.clave_inegi ?? -1]).catch(() => []);
  return NextResponse.json({ seccion_id: id, seccion: id % 10000, id_estado: edo, ...r,
    entidades: Object.fromEntries([...nEdos].map(([k, s]) => [k, s.size])), posicion: pos ?? null, referencias: refs });
}
