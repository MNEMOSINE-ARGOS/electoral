// Piso y techo histórico de cada partido en un territorio y cargo: últimas N elecciones (ordinarias) con datos.
// Funciones puras. Dos medidas:
//  - «candidatura»: votos de la candidatura en que participa el partido (sola o la coalición que lo contiene en esa boleta,
//    inferida con porCandidatura). Es lo que el partido logró con sus aliados; en 2024 PAN y PRI comparten el mismo número.
//  - «propios»: solo la fila del partido en la boleta (sin votos marcados a la coalición). Subestima a partidos en coalición.
// Los votos crudos no son comparables entre años (crece la lista nominal): por eso se da también el % sobre la lista nominal y su
// equivalente con la lista nominal más reciente («votos aspirables»). Un partido que no aparece en la boleta (o aparece con 0 votos) no cuenta como 0.
import { porCandidatura } from "@/lib/analisis";

export type Medida = "candidatura" | "propios";
export type Eleccion = { anio: number; partidos: Record<string, number>; lista_nominal: number | null; votos_totales: number | null };
export type Punto = { anio: number; votos: number; pct: number; pct_ln: number | null };
export type Fila = {
  partido: string; n: number; min: Punto; max: Punto; ultimo: Punto; prom_pct: number;
  min_ln: number | null; max_ln: number | null; ln_ref: number | null; aspirable_min: number | null; aspirable_max: number | null; ultimo_en_rango: number | null;
};

const alias = (p: string) => (p === "conve" ? "mc" : p === "panal" || p === "na" ? "pna" : p);
const EXCLUIR = /^(ind|independiente|nr|no_registrados|nulos|otros|cand)/;

function votosDe(partidos: Record<string, number>, partido: string, medida: Medida): number | null {
  if (medida === "propios") {
    let v = 0, hay = false;
    for (const [k, x] of Object.entries(partidos)) if (!k.includes("-") && alias(k) === partido) { v += x; hay = true; }
    return hay && v > 0 ? v : null; // una fila en 0 = el partido no compitió ahí (artefacto de la fuente), no un piso de 0%
  }
  const c = Object.entries(porCandidatura(partidos)).find(([k]) => k.split("-").some((t) => alias(t) === partido));
  return c && c[1] > 0 ? c[1] : null;
}

export function pisoTecho(serie: Eleccion[], medida: Medida, n = 10, minPct = 2): { filas: Fila[]; anios: number[] } {
  const els = serie.filter((e) => Object.keys(e.partidos).length).sort((a, b) => b.anio - a.anio).slice(0, n);
  const anios = els.map((e) => e.anio).sort((a, b) => a - b);
  const lnRef = els.find((e) => e.lista_nominal)?.lista_nominal ?? null; // la más reciente
  const tokens = new Set<string>();
  for (const e of els) for (const k of Object.keys(e.partidos)) for (const t of k.split("-")) if (!EXCLUIR.test(t)) tokens.add(alias(t));
  const filas: Fila[] = [];
  for (const p of tokens) {
    const pts: Punto[] = [];
    for (const e of els) {
      const v = votosDe(e.partidos, p, medida);
      if (v === null) continue;
      const base = Object.values(e.partidos).reduce((a, b) => a + b, 0);
      pts.push({ anio: e.anio, votos: v, pct: base ? (100 * v) / base : 0, pct_ln: e.lista_nominal ? (100 * v) / e.lista_nominal : null });
    }
    if (!pts.length || Math.max(...pts.map((x) => x.pct)) < minPct) continue;
    const porPct = [...pts].sort((a, b) => a.pct - b.pct);
    const ln = pts.filter((x) => x.pct_ln !== null).map((x) => x.pct_ln!);
    const minLn = ln.length ? Math.min(...ln) : null, maxLn = ln.length ? Math.max(...ln) : null;
    const ultimo = pts[0], min = porPct[0], max = porPct[porPct.length - 1];
    filas.push({
      partido: p, n: pts.length, min, max, ultimo, prom_pct: pts.reduce((a, x) => a + x.pct, 0) / pts.length,
      min_ln: minLn, max_ln: maxLn, ln_ref: lnRef,
      aspirable_min: lnRef && minLn !== null ? Math.round((minLn / 100) * lnRef) : null, aspirable_max: lnRef && maxLn !== null ? Math.round((maxLn / 100) * lnRef) : null,
      ultimo_en_rango: max.pct > min.pct ? (100 * (ultimo.pct - min.pct)) / (max.pct - min.pct) : null,
    });
  }
  return { filas: filas.sort((a, b) => b.ultimo.pct - a.ultimo.pct || b.max.pct - a.max.pct), anios };
}
