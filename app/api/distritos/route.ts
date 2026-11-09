import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { claves } from "@/lib/params";
import { indicadores, porBloque, porCandidatura, claseUnidad, esEnfoque } from "@/lib/analisis";

// Distritos de UNA elección (tipo + año). Diputados federales/presidente/senado → distrito federal; diputados locales → distrito local.
// ?eleccion=diputados_federales&anio=2024[&estado=5[,19…]][&municipio=5035[,…]]
// Con municipio: solo los distritos que tienen secciones en él (cada distrito se lee completo, con todos sus municipios).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "diputados_federales";
  const anio = Number(u.searchParams.get("anio"));
  const estados = claves(u.searchParams.get("estado"));
  const enfoqueP = u.searchParams.get("enfoque"); const enfoque = esEnfoque(enfoqueP) ? enfoqueP : "general";
  if (!anio) return NextResponse.json({ error: "Falta anio" }, { status: 400 });
  const params: unknown[] = [eleccion, anio];
  const fe = estados.length ? " AND id_estado = ANY($3::int[])" : "";
  if (estados.length) params.push(estados);
  const municipios = claves(u.searchParams.get("municipio"));
  let fm = "";
  if (municipios.length) {
    params.push(municipios);
    const col = eleccion.startsWith("diputados_locales") ? "id_distrito_local" : "id_distrito_federal";
    fm = ` AND id_distrito IN (SELECT ${col} FROM sec_resumen WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND clave_inegi = ANY($${params.length}::int[]))`;
  }
  const tot = await q<{ id_distrito: number; id_estado: number; secciones: string; votos_totales: string | null; lista_nominal: string | null; confianza: string | null; tipo: string; fuente: string }>(
    `SELECT id_distrito, id_estado, secciones, votos_totales, lista_nominal, confianza, tipo, fuente FROM agg_dis_totales WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false${fe}${fm} ORDER BY id_distrito`, params);
  const ids = tot.map((t) => t.id_distrito);
  const votos = ids.length ? await q<{ id_distrito: number; partido: string; votos: string }>(
    "SELECT id_distrito, partido, votos FROM agg_dis_votos WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND id_distrito = ANY($3::int[])", [eleccion, anio, ids]) : [];
  const por = new Map<number, Record<string, number>>();
  for (const v of votos) { if (!por.has(v.id_distrito)) por.set(v.id_distrito, {}); por.get(v.id_distrito)![v.partido] = Number(v.votos); }
  const distritos = tot.map((t) => {
    const p = por.get(t.id_distrito) ?? {};
    const ind = indicadores(porCandidatura(p)), ib = indicadores(porBloque(p, anio));
    const vt = t.votos_totales ? Number(t.votos_totales) : null, ln = t.lista_nominal ? Number(t.lista_nominal) : null;
    return {
      id_distrito: t.id_distrito, n: t.id_distrito % 100, id_estado: t.id_estado, secciones: Number(t.secciones), votos_totales: vt, lista_nominal: ln,
      participacion: vt && ln ? +((100 * vt) / ln).toFixed(1) : null, confianza: t.confianza,
      ganador: ind.ganador, p_ganador: ind.pGanador, segundo: ind.segundo, margen: ind.margen, nep: ind.nep,
      ganador_bloque: ib.ganador, margen_bloque: ind.margen, ...claseUnidad(porCandidatura(p), ind.margen, enfoque), partidos: p,
    };
  });
  return NextResponse.json({ eleccion, anio, tipo: tot[0]?.tipo ?? null, fuente: tot[0]?.fuente ?? null, distritos });
}
