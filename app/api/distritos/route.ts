import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { indicadores, porBloque, porCandidatura, claseUnidad, esEnfoque } from "@/lib/analisis";

// Distritos de UNA elección (tipo + año). Diputados federales/presidente/senado → distrito federal; diputados locales → distrito local.
// ?eleccion=diputados_federales&anio=2024[&estado=5]
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "diputados_federales";
  const anio = Number(u.searchParams.get("anio"));
  const estado = Number(u.searchParams.get("estado") || 0);
  const enfoqueP = u.searchParams.get("enfoque"); const enfoque = esEnfoque(enfoqueP) ? enfoqueP : "general";
  if (!anio) return NextResponse.json({ error: "Falta anio" }, { status: 400 });
  const params: unknown[] = [eleccion, anio];
  const fe = estado ? " AND id_estado = $3" : "";
  if (estado) params.push(estado);
  const tot = await q<{ id_distrito: number; id_estado: number; secciones: string; votos_totales: string | null; lista_nominal: string | null; confianza: string | null; tipo: string; fuente: string }>(
    `SELECT id_distrito, id_estado, secciones, votos_totales, lista_nominal, confianza, tipo, fuente FROM agg_dis_totales WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false${fe} ORDER BY id_distrito`, params);
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
