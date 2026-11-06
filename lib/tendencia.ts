// Tendencia de una sección frente a lo nacional y lo estatal. Funciones puras.
// Se compara por BLOQUE (lib/analisis.ts → porBloque): dentro de un año, un partido cae en el mismo bloque vaya o no en
// coalición en esa boleta (p. ej. desde 2021 PAN, PRI y PRD = «oposicion»), así la sección, su estado y el país son comparables
// aunque las coaliciones locales difieran. Entre años solo se comparan bloques que existen en ambos (los bloques cambian en
// 2018 y 2021). Los bloques «otros» y «mixto» no entran en los cambios. Lectura analítica, no oficial.
import { porBloque } from "@/lib/analisis";

export type Reparto = Record<string, number>; // familia → % de votos a candidaturas
export const pcts = (votos: Record<string, number>, anio: number): Reparto => {
  const f = porBloque(votos, anio), t = Object.values(f).reduce((a, b) => a + b, 0);
  const o: Reparto = {};
  if (t) for (const [k, v] of Object.entries(f)) o[k] = (100 * v) / t;
  return o;
};
/** Índice de disimilitud (½ Σ |a−b|, 0–100): puntos de votos que habría que mover para que los dos repartos fueran iguales. */
export const distancia = (a: Reparto, b: Reparto) => {
  const k = new Set([...Object.keys(a), ...Object.keys(b)]);
  let s = 0; for (const x of k) s += Math.abs((a[x] ?? 0) - (b[x] ?? 0));
  return s / 2;
};
// Empate exacto: gana el nombre de bloque menor (mismo desempate que scripts/db/preparar_app_tendencia.py)
const top = (r: Reparto) => Object.entries(r).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ?? null;

export type Eleccion = { eleccion: string; anio: number; sec: Reparto; nac: Reparto; edo: Reparto; votos: number };
export type FilaEleccion = { eleccion: string; anio: number; primera_sec: string | null; primera_nac: string | null; primera_edo: string | null;
  sec: Reparto; nac: Reparto; edo: Reparto; dist_nac: number; dist_edo: number };
export type ParCambio = { eleccion: string; desde: number; hasta: number; familia: string; d_sec: number; d_nac: number; d_edo: number };
export type Concurrente = { anio: number; referencia: string; eleccion: string; split_sec: number; split_edo: number; misma_primera: boolean; lectura: "bloque" | "diferenciado" | "similar" };

const ORDEN_REF = ["presidente", "gobernador", "diputados_federales", "senado", "diputados_locales_mr", "alcaldes"];

function pearson(x: number[], y: number[]) {
  const n = x.length; if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? { r: sxy / Math.sqrt(sxx * syy), b: sxy / sxx } : null;
}

export function analizar(els: Eleccion[]) {
  const filas: FilaEleccion[] = els.map((e) => ({ eleccion: e.eleccion, anio: e.anio, primera_sec: top(e.sec), primera_nac: top(e.nac), primera_edo: top(e.edo),
    sec: e.sec, nac: e.nac, edo: e.edo, dist_nac: distancia(e.sec, e.nac), dist_edo: distancia(e.sec, e.edo) }));

  // 1) Cambios entre elecciones consecutivas del MISMO cargo: ¿la sección se mueve como el país?
  const pares: ParCambio[] = [];
  const porCargo = new Map<string, Eleccion[]>();
  for (const e of els) { if (!porCargo.has(e.eleccion)) porCargo.set(e.eleccion, []); porCargo.get(e.eleccion)!.push(e); }
  for (const [c, xs] of porCargo) {
    xs.sort((a, b) => a.anio - b.anio);
    for (let i = 1; i < xs.length; i++) {
      const a = xs[i - 1], b = xs[i];
      const fams = new Set([...Object.keys(a.sec), ...Object.keys(b.sec), ...Object.keys(a.nac), ...Object.keys(b.nac)]);
      for (const f of fams) {
        if (f === "otros" || f === "mixto") continue;
        if (!(f in a.nac) && !(f in a.sec) || !(f in b.nac) && !(f in b.sec)) continue; // el bloque no existe en uno de los dos años
        if (Math.max(a.sec[f] ?? 0, b.sec[f] ?? 0, a.nac[f] ?? 0, b.nac[f] ?? 0) < 3) continue; // fuerzas marginales: ruido
        pares.push({ eleccion: c, desde: a.anio, hasta: b.anio, familia: f, d_sec: (b.sec[f] ?? 0) - (a.sec[f] ?? 0), d_nac: (b.nac[f] ?? 0) - (a.nac[f] ?? 0), d_edo: (b.edo[f] ?? 0) - (a.edo[f] ?? 0) });
      }
    }
  }
  const relNac = pearson(pares.map((p) => p.d_nac), pares.map((p) => p.d_sec));
  const relEdo = pearson(pares.map((p) => p.d_edo), pares.map((p) => p.d_sec));
  const claros = pares.filter((p) => Math.abs(p.d_nac) >= 2);
  const mismaDir = claros.length ? (100 * claros.filter((p) => Math.sign(p.d_sec) === Math.sign(p.d_nac)).length) / claros.length : null;
  const desvMedia = pares.length ? pares.reduce((a, p) => a + Math.abs(p.d_sec - p.d_nac), 0) / pares.length : null;
  let veredicto: "sigue" | "parcial" | "independiente" | "sin_datos" = "sin_datos";
  if (relNac && pares.length >= 6) veredicto = relNac.r >= 0.7 && (mismaDir ?? 0) >= 75 ? "sigue" : relNac.r >= 0.4 ? "parcial" : "independiente";
  const intensidad = relNac && veredicto !== "independiente" && veredicto !== "sin_datos" ? (relNac.b > 1.2 ? "amplifica" : relNac.b < 0.8 ? "amortigua" : "igual") : null;

  // 2) Elecciones concurrentes (mismo año): ¿vota igual en todos los cargos (arrastre) o diferencia? Se compara contra el ESTADO,
  //    que tuvo esas mismas boletas: si la sección diferencia menos que su estado, vota más en bloque que el promedio.
  const conc: Concurrente[] = [];
  const porAnio = new Map<number, Eleccion[]>();
  for (const e of els) { if (!porAnio.has(e.anio)) porAnio.set(e.anio, []); porAnio.get(e.anio)!.push(e); }
  for (const [anio, xs] of porAnio) {
    if (xs.length < 2) continue;
    const ref = [...xs].sort((a, b) => ORDEN_REF.indexOf(a.eleccion) - ORDEN_REF.indexOf(b.eleccion))[0];
    for (const o of xs) {
      if (o === ref) continue;
      const ss = distancia(ref.sec, o.sec), se = distancia(ref.edo, o.edo);
      conc.push({ anio, referencia: ref.eleccion, eleccion: o.eleccion, split_sec: ss, split_edo: se, misma_primera: top(ref.sec) === top(o.sec),
        lectura: ss <= se - 2 ? "bloque" : ss >= se + 2 ? "diferenciado" : "similar" });
    }
  }
  const nConc = conc.length;
  const bloque = conc.filter((c) => c.lectura === "bloque").length, dif = conc.filter((c) => c.lectura === "diferenciado").length;
  const arrastre = nConc ? { n: nConc, bloque, diferenciado: dif, similar: nConc - bloque - dif, misma_primera_pct: (100 * conc.filter((c) => c.misma_primera).length) / nConc,
    split_sec_medio: conc.reduce((a, c) => a + c.split_sec, 0) / nConc, split_edo_medio: conc.reduce((a, c) => a + c.split_edo, 0) / nConc } : null;

  return {
    filas: filas.sort((a, b) => b.anio - a.anio || ORDEN_REF.indexOf(a.eleccion) - ORDEN_REF.indexOf(b.eleccion)),
    resumen: {
      elecciones: filas.length,
      dist_nac_media: filas.length ? filas.reduce((a, f) => a + f.dist_nac, 0) / filas.length : null,
      dist_edo_media: filas.length ? filas.reduce((a, f) => a + f.dist_edo, 0) / filas.length : null,
      coincide_primera_nac_pct: filas.length ? (100 * filas.filter((f) => f.primera_sec === f.primera_nac).length) / filas.length : null,
      pares: pares.length, r_nac: relNac?.r ?? null, b_nac: relNac?.b ?? null, r_edo: relEdo?.r ?? null, b_edo: relEdo?.b ?? null,
      misma_direccion_pct: mismaDir, pares_claros: claros.length, desviacion_media: desvMedia, veredicto, intensidad,
    },
    pares, concurrentes: conc.sort((a, b) => b.anio - a.anio), arrastre,
  };
}
