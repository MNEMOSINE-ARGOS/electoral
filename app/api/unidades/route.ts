import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { indicadores, porBloque, porCandidatura, claseUnidad, esEnfoque } from "@/lib/analisis";

// Unidades de elección de UN cargo en UN año, según la demarcación propia del cargo:
//   presidente           nacional → estados; con estado → distritos federales (lectura territorial)
//   senado               entidades (la unidad de elección); con estado → municipios (lectura)
//   diputados_federales  300 distritos; con estado → sus distritos
//   gobernador           entidades con elección ese año; con estado → municipios (lectura)
//   diputados_locales_mr con estado → distritos locales; sin estado → entidades con elección ese año
//   alcaldes             municipios (la unidad de elección); con estado → los del estado
// ?cargo=diputados_federales&anio=2024[&estado=5]
type Tot = { id: number; id_estado: number; votos_totales: string | null; lista_nominal: string | null; confianza: string | null };
type Vot = { id: number; partido: string; votos: string };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const cargo = u.searchParams.get("cargo") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  const estado = Number(u.searchParams.get("estado") || 0);
  const enfoqueP = u.searchParams.get("enfoque"); const enfoque = esEnfoque(enfoqueP) ? enfoqueP : "general";
  if (!anio) return NextResponse.json({ error: "Falta anio" }, { status: 400 });

  let nivel: "estado" | "distrito" | "distrito_local" | "municipio";
  if (cargo === "diputados_federales") nivel = "distrito";
  else if (cargo === "alcaldes") nivel = "municipio";
  else if (cargo === "diputados_locales_mr" || cargo === "diputados_locales_rp") nivel = estado ? "distrito_local" : "estado";
  else if (cargo === "presidente") nivel = estado ? "distrito" : "estado";
  else nivel = estado ? "municipio" : "estado"; // senado, gobernador

  const p: unknown[] = [cargo, anio];
  const fe = estado ? " AND id_estado = $3" : "";
  if (estado) p.push(estado);
  let tots: Tot[], votos: Vot[];
  if (nivel === "estado") {
    tots = await q<Tot>(`SELECT id_estado AS id, id_estado, sum(votos_totales) votos_totales, sum(lista_nominal) lista_nominal, min(confianza) confianza FROM agg_est_totales WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false${fe} GROUP BY id_estado`, p);
    votos = await q<Vot>(`SELECT id_estado AS id, partido, sum(votos) votos FROM agg_est_votos WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false${fe} GROUP BY 1,2`, p);
  } else if (nivel === "municipio") {
    tots = await q<Tot>(`SELECT clave_inegi AS id, min(id_estado) id_estado, sum(votos_totales) votos_totales, sum(lista_nominal) lista_nominal, min(confianza) confianza FROM agg_mun_totales WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false${fe} GROUP BY clave_inegi`, p);
    votos = await q<Vot>(`SELECT clave_inegi AS id, partido, sum(votos) votos FROM agg_mun_votos WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false${fe} GROUP BY 1,2`, p);
  } else {
    const tipo = nivel === "distrito" ? "federal" : "local";
    tots = await q<Tot>(`SELECT id_distrito AS id, id_estado, votos_totales, lista_nominal, confianza FROM agg_dis_totales WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND tipo='${tipo}'${fe}`, p);
    const ids = tots.map((t) => t.id);
    votos = ids.length ? await q<Vot>(`SELECT id_distrito AS id, partido, votos FROM agg_dis_votos WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_distrito = ANY($3::int[])`, [cargo, anio, ids]) : [];
  }
  const nombres = new Map<number, string>();
  if (nivel === "estado" || nivel === "distrito" || nivel === "distrito_local") {
    for (const e of await q<{ id_estado: number; nombre_corto: string; abreviatura: string }>("SELECT id_estado, nombre_corto, abreviatura FROM app_estado"))
      nombres.set(e.id_estado, nivel === "estado" ? e.nombre_corto : e.abreviatura);
  } else {
    for (const m of await q<{ clave_inegi: number; nombre: string }>("SELECT clave_inegi, nombre FROM app_municipio WHERE clave_inegi = ANY($1::int[])", [tots.map((t) => t.id)])) nombres.set(m.clave_inegi, m.nombre);
  }
  const porId = new Map<number, Record<string, number>>();
  for (const v of votos) { if (!porId.has(v.id)) porId.set(v.id, {}); porId.get(v.id)![v.partido] = Number(v.votos); }

  const unidades = tots.map((t) => {
    const pt = porId.get(t.id) ?? {};
    const cand = porCandidatura(pt), ind = indicadores(cand), ib = indicadores(porBloque(pt, anio));
    const base = Object.values(pt).reduce((a, b) => a + b, 0);
    const vt = t.votos_totales ? Number(t.votos_totales) : null, ln = t.lista_nominal ? Number(t.lista_nominal) : null;
    const top = Object.entries(cand).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const nombre = nivel === "estado" ? nombres.get(t.id) : nivel === "municipio" ? nombres.get(t.id) : `${nombres.get(t.id_estado)}-${t.id % 100}`;
    return {
      id: t.id, id_estado: t.id_estado, nombre: nombre ?? String(t.id), votos_totales: vt, lista_nominal: ln, participacion: vt && ln ? +((100 * vt) / ln).toFixed(1) : null,
      ganador: ind.ganador, p_ganador: ind.pGanador, segundo: ind.segundo, p_segundo: ind.segundo && base ? (100 * cand[ind.segundo]) / base : null,
      margen: ind.margen, nep: ind.nep, ganador_bloque: ib.ganador, margen_bloque: ib.margen, ...claseUnidad(cand, ind.margen, enfoque), confianza: t.confianza,
      top: Object.fromEntries(top), votos_partidos: base,
    };
  }).sort((a, b) => a.id - b.id);
  return NextResponse.json({ cargo, anio, estado, nivel, unidades });
}
