// Piso y techo histórico en un territorio y cargo. Funciones puras.
//
//  - PERIODO: los últimos N años contados desde la ÚLTIMA elección con datos de ese cargo en ese territorio (no desde hoy):
//    diputaciones federales con 10 años = 2015, 2018, 2021 y 2024; un cargo cuya última elección fue 2021 cuenta desde 2012.
//    anios = 0 → todo el histórico.
//  - PISO y TECHO = el menor y el mayor número ABSOLUTO de votos en las elecciones del periodo en que compitió.
//  - COMPARACIÓN entre partidos y unidades: el % de la lista nominal (padrón con credencial) y, más fino, el % de los
//    votantes (votos emitidos) de cada elección.
//  - VOTOS POSIBLES: lista nominal más reciente × participación histórica del territorio (mínima, media y máxima) =
//    votantes esperados; × el % de los votantes que obtuvo (menor, medio y mayor) = votos posibles bajo, central y alto.
//  - PARTIDOS: solo sus votos propios (su recuadro). Nunca se les suman los de su coalición; si fue en coalición se marca el año.
//  - COALICIONES: filas aparte, una por combinación exacta de partidos, con los votos de toda la candidatura (porCandidatura),
//    solo en las elecciones en que compitió esa combinación.
// Ausente o con 0 votos no cuenta como piso 0.
import { porCandidatura } from "@/lib/analisis";

export type Eleccion = { anio: number; partidos: Record<string, number>; lista_nominal: number | null; votos_totales: number | null };
/** pct = % de los votos a candidaturas; pct_ln = % de la lista nominal; pct_vot = % de los votantes (votos emitidos). */
export type Punto = { anio: number; votos: number; pct: number; pct_ln: number | null; pct_vot: number | null };
export type Rango = { min: number; prom: number; max: number };
export type Participacion = Rango & { anios: number[]; min_anio: number; max_anio: number };
export type Posibles = { bajo: number; central: number; alto: number; cuota: Rango };
export type Fila = {
  tipo: "partido" | "coalicion"; clave: string; componentes: string[]; coalicion_anios: number[];
  n: number; min: Punto; max: Punto; ultimo: Punto; prom_votos: number;
  /** % de los votantes (o de los votos a candidaturas si falta el total) en cada elección: menor, medio y mayor */
  cuota: Rango | null; cuota_ln: Rango | null;
  posibles: Posibles | null;
};
export type ResultadoPisoTecho = {
  filas: Fila[]; coaliciones: Fila[]; anios: number[]; desde: number | null; hasta: number | null;
  participacion: Participacion | null; ln_ref: number | null; ln_ref_anio: number | null;
  votantes: Rango | null; // votantes esperados = ln_ref × participación
};

const alias = (p: string) => (p === "conve" ? "mc" : p === "panal" || p === "na" ? "pna" : p);
const EXCLUIR = /^(ind|independiente|nr|no_registrados|nulos|otros|cand)/;
/** Clave canónica de una coalición: componentes con alias, ordenados (la misma alianza se reconoce aunque cambie el orden). */
const claveCoalicion = (k: string) => [...new Set(k.split("-").map(alias))].sort().join("-");
const rango = (xs: number[]): Rango | null => (xs.length ? { min: Math.min(...xs), prom: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) } : null);

/** Primer año del periodo: N años contados hacia atrás desde la última elección con datos (inclusive). */
export const desdeAnio = (anios: number, hasta: number) => (anios > 0 ? hasta - anios + 1 : -Infinity);

function resumir(tipo: Fila["tipo"], clave: string, pts: Punto[], votantes: Rango | null, coalicionAnios: number[] = []): Fila {
  const porVotos = [...pts].sort((a, b) => a.votos - b.votos || a.anio - b.anio);
  const cuota = rango(pts.map((x) => x.pct_vot ?? x.pct));
  const cuota_ln = rango(pts.filter((x) => x.pct_ln !== null).map((x) => x.pct_ln!));
  const posibles = votantes && cuota ? {
    bajo: Math.round((cuota.min / 100) * votantes.min), central: Math.round((cuota.prom / 100) * votantes.prom),
    alto: Math.round((cuota.max / 100) * votantes.max), cuota,
  } : null;
  return {
    tipo, clave, componentes: clave.split("-"), coalicion_anios: coalicionAnios,
    n: pts.length, min: porVotos[0], max: porVotos[porVotos.length - 1], ultimo: pts[0],
    prom_votos: pts.reduce((a, x) => a + x.votos, 0) / pts.length, cuota, cuota_ln, posibles,
  };
}

export function pisoTecho(serie: Eleccion[], anios = 10, minPct = 2): ResultadoPisoTecho {
  const conDatos = serie.filter((e) => Object.keys(e.partidos).length);
  const hasta = conDatos.length ? Math.max(...conDatos.map((e) => e.anio)) : null;
  const desde = hasta === null ? null : desdeAnio(anios, hasta);
  const els = conDatos.filter((e) => desde === null || e.anio >= desde).sort((a, b) => b.anio - a.anio); // más reciente primero
  const usados = els.map((e) => e.anio).sort((a, b) => a - b);
  const refEl = els.find((e) => e.lista_nominal);
  const ln_ref = refEl?.lista_nominal ?? null, ln_ref_anio = refEl?.anio ?? null;

  // Participación histórica del territorio (todas las elecciones del periodo, compita o no cada partido)
  const parts = els.filter((e) => e.lista_nominal && e.votos_totales).map((e) => ({ anio: e.anio, p: (100 * e.votos_totales!) / e.lista_nominal! }));
  const pr = rango(parts.map((x) => x.p));
  const participacion: Participacion | null = pr ? {
    ...pr, anios: parts.map((x) => x.anio).sort((a, b) => a - b),
    min_anio: parts.find((x) => x.p === pr.min)!.anio, max_anio: parts.find((x) => x.p === pr.max)!.anio,
  } : null;
  const votantes = participacion && ln_ref ? { min: (participacion.min / 100) * ln_ref, prom: (participacion.prom / 100) * ln_ref, max: (participacion.max / 100) * ln_ref } : null;

  const ptsPartido = new Map<string, Punto[]>(), ptsCoal = new Map<string, Punto[]>(), enCoalicion = new Map<string, Set<number>>();
  const agregar = (m: Map<string, Punto[]>, k: string, p: Punto) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(p); };
  for (const e of els) {
    const base = Object.values(e.partidos).reduce((a, b) => a + b, 0);
    const punto = (v: number): Punto => ({
      anio: e.anio, votos: v, pct: base ? (100 * v) / base : 0,
      pct_ln: e.lista_nominal ? (100 * v) / e.lista_nominal : null, pct_vot: e.votos_totales ? (100 * v) / e.votos_totales : null,
    });
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
  const orden = (a: Fila, b: Fila) => b.ultimo.anio - a.ultimo.anio || b.ultimo.votos - a.ultimo.votos;
  const filas = [...ptsPartido].filter(([, pts]) => relevantes(pts))
    .map(([p, pts]) => resumir("partido", p, pts, votantes, [...(enCoalicion.get(p) ?? [])].sort((a, b) => a - b))).sort(orden);
  const coaliciones = [...ptsCoal].filter(([, pts]) => relevantes(pts)).map(([c, pts]) => resumir("coalicion", c, pts, votantes)).sort(orden);
  return { filas, coaliciones, anios: usados, desde: desde === null || !isFinite(desde) ? null : desde, hasta, participacion, ln_ref, ln_ref_anio, votantes };
}
