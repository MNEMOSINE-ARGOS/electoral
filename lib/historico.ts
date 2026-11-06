// Genealogía oficial de las secciones (INE, histórico PEF 1994-2024, corte dic 2025), generada por scripts/historico_secciones.ts.
// Dice a dónde fue el territorio de una sección que ya no existe: divisiones (reseccionamiento) y fusiones (integración seccional).
// Los movimientos parciales (un pedazo pasa a otra sección y la original sigue) no se usan para reasignar votos.
import datos from "@/data/historico_secciones.json";

type Arista = [number, number[], "division" | "fusion" | "parcial", number | null];
const H = datos as unknown as Record<string, Arista[]>;

// origen → destinos (solo división y fusión), por estado, con seccion_id completo
const hijos = new Map<number, number[]>();
const padres = new Map<number, { o: number; t: Arista[2]; a: number | null }[]>();
for (const [e, as] of Object.entries(H)) {
  const p = Number(e) * 10000;
  for (const [o, d, t, a] of as) {
    if (t !== "parcial") hijos.set(p + o, [...(hijos.get(p + o) ?? []), ...d.map((x) => p + x)]);
    for (const x of d) padres.set(p + x, [...(padres.get(p + x) ?? []), { o: p + o, t, a }]);
  }
}

/** Secciones de `existe` a las que pasó el territorio de `seccionId` (siguiendo divisiones y fusiones, varias generaciones).
 *  Vacío si no hay registro. Si la sección existe, es ella misma. */
export function destinos(seccionId: number, existe: (s: number) => boolean): number[] {
  const out = new Set<number>(), vistos = new Set<number>();
  const pila = [seccionId];
  while (pila.length) {
    const s = pila.pop()!;
    if (vistos.has(s)) continue; vistos.add(s);
    if (existe(s)) { out.add(s); continue; }
    for (const h of hijos.get(s) ?? []) pila.push(h);
  }
  return [...out];
}

/** De qué sección(es) viene una sección: [{origen, tipo, año}] (un nivel). */
export function origenes(seccionId: number) { return padres.get(seccionId) ?? []; }
/** A qué secciones pasó una sección (un nivel; sin parciales). */
export function hijasDe(seccionId: number) { return hijos.get(seccionId) ?? []; }
