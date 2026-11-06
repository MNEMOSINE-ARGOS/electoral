// Piso y techo histórico en un territorio y cargo: elecciones ordinarias con datos de los últimos N AÑOS (contados desde el año
// en curso; p. ej. en 2026 con 10 años = elecciones de 2016 en adelante). anios = 0 → todo el histórico. Funciones puras.
//
//  - PARTIDOS: cada partido con SUS PROPIOS votos (solo su recuadro en la boleta). Un partido nunca se lleva los votos de su
//    coalición: si fue en coalición, se marca en qué años (`coalicion_anios`) porque sus votos propios subestiman su peso.
//  - COALICIONES: filas aparte, una por combinación exacta de partidos (p. ej. «pri-prd-udc»), con los votos de toda la
//    candidatura (partidos + combinaciones marcadas en la boleta, agrupados con porCandidatura). Solo cuentan las elecciones en
//    que compitió ESA misma combinación.
//
// Los votos crudos no son comparables entre años (crece la lista nominal): también se da el % sobre la lista nominal y su
// equivalente con la lista nominal más reciente («votos posibles hoy»). Ausente o con 0 votos no cuenta como 0.
import { porCandidatura } from "@/lib/analisis";

export type Eleccion = { anio: number; partidos: Record<string, number>; lista_nominal: number | null; votos_totales: number | null };
export type Punto = { anio: number; votos: number; pct: number; pct_ln: number | null };
export type Fila = {
  tipo: "partido" | "coalicion"; clave: string; componentes: string[]; coalicion_anios: number[];
  n: number; min: Punto; max: Punto; ultimo: Punto; prom_pct: number;
  min_ln: number | null; max_ln: number | null; min_ln_anio: number | null; max_ln_anio: number | null; ln_ref: number | null; ln_ref_anio: number | null;
  aspirable_min: number | null; aspirable_max: number | null;
};

const alias = (p: string) => (p === "conve" ? "mc" : p === "panal" || p === "na" ? "pna" : p);
const EXCLUIR = /^(ind|independiente|nr|no_registrados|nulos|otros|cand)/;
/** Clave canónica de una coalición: componentes con alias, ordenados (la misma alianza se reconoce aunque cambie el orden). */
const claveCoalicion = (k: string) => [...new Set(k.split("-").map(alias))].sort().join("-");

export const desdeAnio = (anios: number, hoy = new Date().getFullYear()) => (anios > 0 ? hoy - anios : -Infinity);

function resumir(tipo: Fila["tipo"], clave: string, pts: Punto[], ref: { ln: number | null; anio: number | null }, coalicionAnios: number[] = []): Fila {
  const porPct = [...pts].sort((a, b) => a.pct - b.pct);
  const conLn = pts.filter((x) => x.pct_ln !== null).sort((a, b) => a.pct_ln! - b.pct_ln!);
  const minLn = conLn.length ? conLn[0].pct_ln! : null, maxLn = conLn.length ? conLn[conLn.length - 1].pct_ln! : null;
  return {
    tipo, clave, componentes: clave.split("-"), coalicion_anios: coalicionAnios,
    n: pts.length, min: porPct[0], max: porPct[porPct.length - 1], ultimo: pts[0], prom_pct: pts.reduce((a, x) => a + x.pct, 0) / pts.length,
    min_ln: minLn, max_ln: maxLn, min_ln_anio: conLn[0]?.anio ?? null, max_ln_anio: conLn.at(-1)?.anio ?? null, ln_ref: ref.ln, ln_ref_anio: ref.anio,
    aspirable_min: ref.ln && minLn !== null ? Math.round((minLn / 100) * ref.ln) : null, aspirable_max: ref.ln && maxLn !== null ? Math.round((maxLn / 100) * ref.ln) : null,
  };
}

export function pisoTecho(serie: Eleccion[], anios = 10, minPct = 2): { filas: Fila[]; coaliciones: Fila[]; anios: number[] } {
  const desde = desdeAnio(anios);
  const els = serie.filter((e) => Object.keys(e.partidos).length && e.anio >= desde).sort((a, b) => b.anio - a.anio); // más reciente primero
  const usados = els.map((e) => e.anio).sort((a, b) => a - b);
  const refEl = els.find((e) => e.lista_nominal);
  const ref = { ln: refEl?.lista_nominal ?? null, anio: refEl?.anio ?? null };

  const ptsPartido = new Map<string, Punto[]>(), ptsCoal = new Map<string, Punto[]>(), enCoalicion = new Map<string, Set<number>>();
  const agregar = (m: Map<string, Punto[]>, k: string, p: Punto) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(p); };
  for (const e of els) {
    const base = Object.values(e.partidos).reduce((a, b) => a + b, 0);
    const punto = (v: number): Punto => ({ anio: e.anio, votos: v, pct: base ? (100 * v) / base : 0, pct_ln: e.lista_nominal ? (100 * v) / e.lista_nominal : null });
    // Partidos: solo su recuadro
    const propios = new Map<string, number>();
    for (const [k, v] of Object.entries(e.partidos)) if (!k.includes("-") && !EXCLUIR.test(k)) propios.set(alias(k), (propios.get(alias(k)) ?? 0) + v);
    for (const [p, v] of propios) if (v > 0) agregar(ptsPartido, p, punto(v));
    // Coaliciones: la candidatura completa, por combinación exacta
    const vistas = new Map<string, number>();
    for (const [k, v] of Object.entries(porCandidatura(e.partidos))) {
      if (!k.includes("-")) continue;
      const c = claveCoalicion(k);
      if (c.split("-").every((t) => EXCLUIR.test(t))) continue;
      vistas.set(c, (vistas.get(c) ?? 0) + v);
    }
    for (const [c, v] of vistas) {
      if (v > 0) agregar(ptsCoal, c, punto(v));
      for (const t of c.split("-")) { if (!enCoalicion.has(t)) enCoalicion.set(t, new Set()); enCoalicion.get(t)!.add(e.anio); }
    }
  }
  const relevantes = (pts: Punto[]) => Math.max(...pts.map((x) => x.pct)) >= minPct;
  const filas = [...ptsPartido].filter(([, pts]) => relevantes(pts))
    .map(([p, pts]) => resumir("partido", p, pts, ref, [...(enCoalicion.get(p) ?? [])].sort((a, b) => a - b)))
    .sort((a, b) => b.ultimo.anio - a.ultimo.anio || b.ultimo.pct - a.ultimo.pct);
  const coaliciones = [...ptsCoal].filter(([, pts]) => relevantes(pts)).map(([c, pts]) => resumir("coalicion", c, pts, ref))
    .sort((a, b) => b.ultimo.anio - a.ultimo.anio || b.ultimo.pct - a.ultimo.pct);
  return { filas, coaliciones, anios: usados };
}
