import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { familia, indicadores, porBloque, porCandidatura, claseUnidad, esEnfoque } from "@/lib/analisis";

// Lectura seccional de UNA elección (tipo + año) dentro de un municipio o un distrito.
// ?eleccion=diputados_federales&anio=2024&municipio=5035   |   ?eleccion=diputados_federales&anio=2024&distrito=503
// Cada sección se compara solo con la elección anterior DEL MISMO TIPO. La sección no es una unidad estable entre años
// (reseccionamiento): si no existe en la elección anterior, se marca sin comparación.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  const mun = Number(u.searchParams.get("municipio") || 0);
  const dis = Number(u.searchParams.get("distrito") || 0);
  const enfoqueP = u.searchParams.get("enfoque"); const enfoque = esEnfoque(enfoqueP) ? enfoqueP : "general";
  if (!anio || (!mun && !dis)) return NextResponse.json({ error: "Faltan anio y municipio o distrito" }, { status: 400 });
  const local = eleccion.startsWith("diputados_locales");
  const col = mun ? "clave_inegi" : local ? "id_distrito_local" : "id_distrito_federal";
  const base = await q<{ totales_id: string; seccion_id: string; id_estado: number; votos_totales: string | null; lista_nominal: string | null; confianza: string | null; seccion_confiable: boolean }>(
    `SELECT totales_id, seccion_id, id_estado, votos_totales, lista_nominal, confianza, seccion_confiable FROM sec_resumen
     WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND ${col} = $3 ORDER BY seccion_id LIMIT 2500`, [eleccion, anio, mun || dis]);
  if (!base.length) return NextResponse.json({ eleccion, anio, secciones: [], resumen: null });
  const tids = base.map((b) => b.totales_id);
  const votos = await q<{ totales_id: number | string; partido: string; votos: string }>(
    "SELECT v.totales_id, c.partido, v.votos FROM sec_votos v JOIN app_partido_codigo c ON c.codigo = v.partido WHERE v.totales_id = ANY($1::bigint[])", [tids]);
  const porT = new Map<string, Record<string, number>>();
  for (const v of votos) { const k = String(v.totales_id); if (!porT.has(k)) porT.set(k, {}); porT.get(k)![v.partido] = Number(v.votos); }

  // Las DOS elecciones anteriores del mismo cargo en ese estado (ganador por candidatura y su %)
  const est = base[0].id_estado;
  const previos = (await q<{ a: number }>(
    "SELECT DISTINCT anio AS a FROM sec_resumen WHERE eleccion = $1 AND id_estado = $2 AND anio < $3 AND extraordinaria = false ORDER BY anio DESC LIMIT 2", [eleccion, est, anio])).map((x) => x.a);
  const prevAnio = previos[0] ?? null;
  type Prev = { ganador: string | null; pct: number | null; segundo: string | null; pct2: number | null; vt: number | null; ln: number | null };
  const porAnio = new Map<number, Map<string, Prev>>();
  for (const pa of previos) {
    const m = new Map<string, Prev>();
    const pr = await q<{ totales_id: string; seccion_id: string; votos_totales: string | null; lista_nominal: string | null }>(
      "SELECT totales_id, seccion_id, votos_totales, lista_nominal FROM sec_resumen WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND seccion_id = ANY($3::bigint[])",
      [eleccion, pa, base.map((b) => b.seccion_id)]);
    const pv = pr.length ? await q<{ totales_id: number | string; partido: string; votos: string }>(
      "SELECT v.totales_id, c.partido, v.votos FROM sec_votos v JOIN app_partido_codigo c ON c.codigo = v.partido WHERE v.totales_id = ANY($1::bigint[])", [pr.map((x) => x.totales_id)]) : [];
    const porP = new Map<string, Record<string, number>>();
    for (const v of pv) { const k = String(v.totales_id); if (!porP.has(k)) porP.set(k, {}); porP.get(k)![v.partido] = Number(v.votos); }
    for (const x of pr) {
      const cand = porCandidatura(porP.get(String(x.totales_id)) ?? {});
      const t = Object.values(cand).reduce((a, y) => a + y, 0);
      const o = Object.entries(cand).sort((a, y) => y[1] - a[1]);
      m.set(x.seccion_id, { ganador: o[0]?.[0] ?? null, pct: o[0] && t ? (100 * o[0][1]) / t : null, segundo: o[1]?.[0] ?? null, pct2: o[1] && t ? (100 * o[1][1]) / t : null,
        vt: x.votos_totales ? Number(x.votos_totales) : null, ln: x.lista_nominal ? Number(x.lista_nominal) : null });
    }
    porAnio.set(pa, m);
  }
  const prev = porAnio.get(prevAnio ?? -1) ?? new Map<string, Prev>();
  // lista nominal por sexo: último corte anterior o igual al 1 de julio del año de la elección
  const [corte] = await q<{ f: string | null }>("SELECT to_char(max(fecha_corte),'YYYY-MM-DD') AS f FROM ln_corte WHERE fecha_corte <= make_date($1::int, 7, 1)", [anio]);
  const sexo = new Map<string, { h: number; m: number }>();
  if (corte?.f) {
    const r = await q<{ seccion_id: number; lista_hombres: number; lista_mujeres: number }>(
      "SELECT seccion_id, lista_hombres, lista_mujeres FROM ln_seccion WHERE fecha_corte = $1 AND seccion_id = ANY($2::int[])", [corte.f, base.map((b) => Number(b.seccion_id))]);
    for (const x of r) sexo.set(String(x.seccion_id), { h: x.lista_hombres, m: x.lista_mujeres });
  }
  // Edad: corte con edad más cercano anterior a la jornada; si la elección es anterior a 2021 (no hay edades), el primer corte disponible
  const [cEdad] = await q<{ f: string | null }>(
    `SELECT to_char(coalesce(max(fecha_corte) FILTER (WHERE fecha_corte <= make_date($1::int, 7, 1)), min(fecha_corte)),'YYYY-MM-DD') AS f FROM ln_corte WHERE tiene_edad`, [anio]);
  // Marca de clase de cada grupo (18, 19, 20-24 … 60-64, 65+); para 65+ se usa 72 años (aproximación)
  const MARCA = [18, 19, 22, 27, 32, 37, 42, 47, 52, 57, 62, 72];
  const edad = new Map<string, { media: number; jov: number; may: number; h: number; m: number }>();
  if (cEdad?.f) {
    const r = await q<{ seccion_id: number; h: number[]; m: number[] }>("SELECT seccion_id, h, m FROM ln_edad_seccion WHERE fecha_corte = $1 AND seccion_id = ANY($2::int[])", [cEdad.f, base.map((b) => Number(b.seccion_id))]);
    for (const x of r) {
      const g = x.h.map((v, i) => Number(v) + Number(x.m[i]));
      const t = g.reduce((a, b) => a + b, 0);
      if (!t) continue;
      edad.set(String(x.seccion_id), { media: g.reduce((a, v, i) => a + v * MARCA[i], 0) / t, jov: (100 * (g[0] + g[1] + g[2] + g[3])) / t, may: (100 * g[11]) / t,
        h: x.h.reduce((a, b) => a + Number(b), 0), m: x.m.reduce((a, b) => a + Number(b), 0) });
    }
  }

  // Tendencia frente al país (precalculada para todas las secciones por scripts/db/preparar_app_tendencia.py; no depende de la elección leída)
  const tend = new Map<string, { veredicto: string; r_nac: number | null; intensidad: string | null }>();
  for (const x of await q<{ seccion_id: string; veredicto: string; r_nac: number | null; intensidad: string | null }>(
    "SELECT seccion_id, veredicto, r_nac, intensidad FROM app_sec_tendencia WHERE seccion_id = ANY($1::bigint[])", [base.map((b) => Number(b.seccion_id))]))
    tend.set(String(x.seccion_id), x);
  const secciones = base.map((b) => {
    const p = porT.get(b.totales_id) ?? {};
    const ind = indicadores(porCandidatura(p)), pb = porBloque(p, anio), ib = indicadores(pb);
    const vt = b.votos_totales ? Number(b.votos_totales) : null, ln = b.lista_nominal ? Number(b.lista_nominal) : null;
    const pv = prev.get(b.seccion_id);
    const fPrev = familia(pv?.ganador ?? null), fAct = familia(ind.ganador);
    // Cambio = la candidatura ganadora no comparte ningún partido con la anterior (p. ej. PRI en 2021 → PAN·PRI·PRD en 2024 NO es cambio)
    const comp = (k: string | null | undefined) => new Set((k ?? "").split("-").filter(Boolean));
    const cA = comp(ind.ganador), cP = comp(pv?.ganador);
    const comparten = [...cA].some((t) => cP.has(t));
    const sx = sexo.get(b.seccion_id);
    return {
      seccion_id: Number(b.seccion_id), seccion: Number(b.seccion_id) % 10000, votos_totales: vt, lista_nominal: ln,
      participacion: vt && ln ? +((100 * vt) / ln).toFixed(1) : null,
      ganador: ind.ganador, p_ganador: ind.pGanador, margen: ind.margen, nep: ind.nep,
      ganador_bloque: ib.ganador, margen_bloque: ind.margen, ...claseUnidad(porCandidatura(p), ind.margen, enfoque), bloques: pb,
      prev: pv ? { anio: prevAnio, ganador: pv.ganador, familia: fPrev ?? fAct, participacion: pv.vt && pv.ln ? +((100 * pv.vt) / pv.ln).toFixed(1) : null } : null,
      cambio_ganador: cA.size && cP.size ? !comparten : null,
      anteriores: previos.map((pa) => { const x = porAnio.get(pa)?.get(b.seccion_id); return { anio: pa, ganador: x?.ganador ?? null, pct: x?.pct ?? null, segundo: x?.segundo ?? null, pct2: x?.pct2 ?? null }; }),
      mujeres_pct: sx && sx.h + sx.m ? +((100 * sx.m) / (sx.h + sx.m)).toFixed(1) : edad.get(b.seccion_id) ? +((100 * edad.get(b.seccion_id)!.m) / (edad.get(b.seccion_id)!.h + edad.get(b.seccion_id)!.m)).toFixed(1) : null,
      edad_media: edad.get(b.seccion_id) ? +edad.get(b.seccion_id)!.media.toFixed(1) : null,
      pct_18_29: edad.get(b.seccion_id) ? +edad.get(b.seccion_id)!.jov.toFixed(1) : null,
      pct_65: edad.get(b.seccion_id) ? +edad.get(b.seccion_id)!.may.toFixed(1) : null,
      confianza: b.confianza, confiable: b.seccion_confiable,
      tendencia: tend.get(String(b.seccion_id)) ?? null,
    };
  });

  const resumen = { total: secciones.length, clases: {} as Record<string, number>, ganadores: {} as Record<string, number>, bloques: {} as Record<string, number>, cambiaron: 0, comparables: 0, participacion: null as number | null, tendencia: {} as Record<string, number> };
  let vt = 0, ln = 0;
  for (const s of secciones) {
    if (s.clase) resumen.clases[s.clase] = (resumen.clases[s.clase] ?? 0) + 1;
    if (s.ganador_bloque) resumen.ganadores[s.ganador_bloque] = (resumen.ganadores[s.ganador_bloque] ?? 0) + 1;
    for (const [b, v] of Object.entries(s.bloques)) resumen.bloques[b] = (resumen.bloques[b] ?? 0) + v;
    if (s.cambio_ganador !== null) { resumen.comparables++; if (s.cambio_ganador) resumen.cambiaron++; }
    vt += s.votos_totales ?? 0; ln += s.lista_nominal ?? 0;
    if (s.tendencia) resumen.tendencia[s.tendencia.veredicto] = (resumen.tendencia[s.tendencia.veredicto] ?? 0) + 1;
  }
  resumen.participacion = ln ? +((100 * vt) / ln).toFixed(1) : null;
  return NextResponse.json({ eleccion, anio, anio_anterior: prevAnio, anios_anteriores: previos, corte_lista_nominal: corte?.f ?? null, corte_edad: cEdad?.f ?? null, secciones, resumen });
}
