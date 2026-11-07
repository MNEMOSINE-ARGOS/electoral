// Lectura (servidor) de data/censo2020/<id_estado>.json, que escribe scripts/censo_secciones.ts. Los cálculos viven en lib/censo.ts.
import { INDICADORES, valorTerritorio, type CampoCenso, type FilaCenso } from "./censo";

type Archivo = { fuente: string; campos: string[]; s: Record<string, (number | null)[]> };
export type SeccionCenso = { id: number; f: FilaCenso };

const cache = new Map<number, Promise<SeccionCenso[]>>();
/** Secciones de una entidad con sus conteos (seccion_id = estado*10000 + sección). */
export function seccionesCenso(e: number): Promise<SeccionCenso[]> {
  if (!cache.has(e)) cache.set(e, import(`@/data/censo2020/${e}.json`).then((m) => {
    const a = m.default as Archivo;
    return Object.entries(a.s).map(([sec, v]) => {
      const f: FilaCenso = {};
      a.campos.forEach((k, i) => { f[k as CampoCenso] = v[i]; });
      return { id: e * 10000 + Number(sec), f };
    });
  }));
  return cache.get(e)!;
}

export const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

/** Indicadores (en el orden de INDICADORES) de un conjunto de secciones, más los numeradores en personas, viviendas u hogares. */
export function resumenCenso(filas: FilaCenso[]) {
  const suma = (k: CampoCenso) => { let s = 0, alguno = false; for (const f of filas) { const v = f[k]; if (v != null) { s += v; alguno = true; } } return alguno ? s : null; };
  return {
    valores: INDICADORES.map((ind) => r1(valorTerritorio(ind, filas))),
    // cuántas personas (o viviendas u hogares) hay en el numerador; null en los promedios (escolaridad)
    absolutos: INDICADORES.map((ind) => (ind.prom ? null : ind.num.reduce<number | null>((a, k) => { const v = suma(k); return v === null ? a : (a ?? 0) + v; }, null))),
    poblacion: suma("POBTOT"), hogares: suma("TOTHOG"), viviendas: suma("TVIVPARHAB"), secciones: filas.length,
  };
}

let nacional: Promise<ReturnType<typeof resumenCenso>> | null = null;
export function resumenNacional() {
  nacional ??= (async () => {
    const todas: FilaCenso[] = [];
    for (let e = 1; e <= 32; e++) for (const s of await seccionesCenso(e)) todas.push(s.f);
    return resumenCenso(todas);
  })();
  return nacional;
}
