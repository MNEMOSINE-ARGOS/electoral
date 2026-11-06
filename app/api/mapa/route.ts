import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { alcance } from "@/lib/partidos";
import { indicadores, porCandidatura, claseUnidad, esEnfoque } from "@/lib/analisis";
import { prepDe, unidadesPrep, metaPrep } from "@/lib/prep";

// Datos para pintar el mapa de UNA entidad en UNA elección (tipo + año), al nivel pedido.
// ?eleccion=presidente&anio=2024&estado=5&nivel=municipio|distrito|distrito_local|seccion[&enfoque=morena]
//   con nivel=seccion, opcional &municipio=<clave_inegi> | &distrito=<id_distrito> | &distrito_local=<id_distrito>: solo las secciones de esa unidad
// Cada unidad: ganador por candidatura, margen, clase (general o desde el enfoque), participación y % de alcance por partido.
// Los distritos se leen tal cual vienen en la base: la pantalla decide si la cartografía vale para ese año (public/geo/entidades.json).
type Tot = { id: string; votos_totales: string | null; lista_nominal: string | null };
type Vot = { id: string; partido: string; votos: string };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  const estado = Number(u.searchParams.get("estado"));
  const nivel = u.searchParams.get("nivel") || "municipio";
  const enfoqueP = u.searchParams.get("enfoque"); const enfoque = esEnfoque(enfoqueP) ? enfoqueP : "general";
  if (!anio || !estado) return NextResponse.json({ error: "Faltan anio y estado" }, { status: 400 });
  const p = [eleccion, anio, estado];
  let tots: Tot[], votos: Vot[];
  if (nivel === "municipio") {
    tots = await q<Tot>("SELECT clave_inegi::text id, sum(votos_totales) votos_totales, sum(lista_nominal) lista_nominal FROM agg_mun_totales WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_estado=$3 GROUP BY 1", p);
    votos = await q<Vot>("SELECT clave_inegi::text id, partido, sum(votos) votos FROM agg_mun_votos WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_estado=$3 GROUP BY 1,2", p);
  } else if (nivel === "distrito" || nivel === "distrito_local") {
    const tipo = nivel === "distrito" ? "federal" : "local";
    tots = await q<Tot>(`SELECT id_distrito::text id, votos_totales, lista_nominal FROM agg_dis_totales WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_estado=$3 AND tipo='${tipo}'`, p);
    votos = tots.length ? await q<Vot>("SELECT id_distrito::text id, partido, votos FROM agg_dis_votos WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_distrito = ANY($3::int[])",
      [eleccion, anio, tots.map((t) => Number(t.id))]) : [];
  } else if (nivel === "seccion") {
    // Opcional: solo las secciones de un municipio o distrito (&municipio=5035 | &distrito=503 | &distrito_local=507)
    const filtros: [string, string][] = [["municipio", "clave_inegi"], ["distrito", "id_distrito_federal"], ["distrito_local", "id_distrito_local"]];
    const f = filtros.find(([k]) => Number(u.searchParams.get(k)));
    const extra = f ? ` AND ${f[1]} = $4` : "";
    const base = await q<Tot & { totales_id: string }>(
      `SELECT totales_id, seccion_id::text id, votos_totales, lista_nominal FROM sec_resumen WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_estado=$3 AND seccion_confiable${extra}`,
      f ? [...p, Number(u.searchParams.get(f[0]))] : p);
    const porT = new Map(base.map((b) => [String(b.totales_id), b.id]));
    tots = base;
    votos = base.length ? (await q<{ totales_id: string; partido: string; votos: string }>(
      "SELECT v.totales_id, c.partido, v.votos FROM sec_votos v JOIN app_partido_codigo c ON c.codigo = v.partido WHERE v.totales_id = ANY($1::bigint[])", [base.map((b) => b.totales_id)]))
      .map((v) => ({ id: porT.get(String(v.totales_id))!, partido: v.partido, votos: v.votos })) : [];
  } else return NextResponse.json({ error: "Nivel no válido" }, { status: 400 });

  // Sin datos en la base pero con PREP registrado (lib/prep.ts): resultados preliminares, marcados como tales en la respuesta
  const prep = prepDe(eleccion, anio, estado)[0];
  if (!tots.length && prep) {
    const campo = (["municipio", "distrito", "distrito_local"] as const).find((k) => Number(u.searchParams.get(k)));
    const unidades = unidadesPrep(prep, nivel, enfoque, campo ? { campo, valor: Number(u.searchParams.get(campo)) } : undefined);
    return NextResponse.json({ eleccion, anio, estado, nivel, prep: metaPrep(prep), unidades });
  }
  const porId = new Map<string, Record<string, number>>();
  for (const v of votos) { if (!porId.has(v.id)) porId.set(v.id, {}); const r = porId.get(v.id)!; r[v.partido] = (r[v.partido] ?? 0) + Number(v.votos); }
  const unidades = tots.map((t) => {
    const pt = porId.get(t.id) ?? {};
    const base = Object.values(pt).reduce((a, b) => a + b, 0);
    const cand = porCandidatura(pt), ind = indicadores(cand);
    const vt = t.votos_totales ? Number(t.votos_totales) : null, ln = t.lista_nominal ? Number(t.lista_nominal) : null;
    const alc = Object.fromEntries(Object.entries(alcance(pt)).filter(([, v]) => base && v / base >= 0.005).map(([k, v]) => [k, +((100 * v) / base).toFixed(1)]));
    return {
      id: Number(t.id), votos_totales: vt, lista_nominal: ln, participacion: vt && ln ? +((100 * vt) / ln).toFixed(1) : null,
      ganador: ind.ganador, p_ganador: ind.pGanador === null ? null : +ind.pGanador.toFixed(1), segundo: ind.segundo,
      margen: ind.margen === null ? null : +ind.margen.toFixed(1), ...claseUnidad(cand, ind.margen, enfoque), alc,
    };
  });
  // Datos de la base que son un PREP cargado (fuente «prep_…», scripts/cargar_prep.ts): siguen marcados como preliminares
  const esPrep = prep && (await q<{ fuente: string }>("SELECT fuente FROM agg_est_totales WHERE eleccion=$1 AND anio=$2 AND extraordinaria=false AND id_estado=$3 LIMIT 1", p))[0]?.fuente.startsWith("prep");
  return NextResponse.json({ eleccion, anio, estado, nivel, unidades, ...(esPrep ? { prep: metaPrep(prep) } : {}) });
}
