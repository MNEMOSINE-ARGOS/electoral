// Lecturas politológicas. Funciones puras (sirven en servidor y cliente).
// Los BLOQUES son una agrupación analítica (no oficial) para comparar entre años aunque cambien las coaliciones:
//  - 2021 y 2024 (federal; se aplica igual a locales como aproximación): Morena+PT+PVEM (+PES) | PAN+PRI+PRD | MC | otros
//  - 2018: Juntos haremos historia (Morena, PT, PES) | Por México al Frente (PAN, PRD, MC) | Todos por México (PRI, PVEM, PNA)
//  - hasta 2015: PRI+PVEM+PNA | PAN | izquierda (PRD, PT, MC/Convergencia, Morena) | otros
// Una coalición cuyos componentes caen en bloques distintos va a «mixto»; los partidos locales o independientes no cuentan
// para decidir el bloque de una coalición (si no queda ningún componente conocido, va a «otros»).

export type Bloque = { id: string; nombre: string; color: string };
export const BLOQUES: Record<string, Bloque> = {
  morena_aliados: { id: "morena_aliados", nombre: "Morena y aliados", color: "#8b1d3b" },
  oposicion: { id: "oposicion", nombre: "PAN · PRI · PRD", color: "#1d5fbf" },
  frente: { id: "frente", nombre: "Por México al Frente (PAN·PRD·MC)", color: "#2a7de1" },
  pri_aliados: { id: "pri_aliados", nombre: "PRI y aliados", color: "#d62828" },
  pan: { id: "pan", nombre: "PAN", color: "#1d5fbf" },
  izquierda: { id: "izquierda", nombre: "Izquierda (PRD·PT·MC)", color: "#e8b800" },
  mc: { id: "mc", nombre: "Movimiento Ciudadano", color: "#f28a1a" },
  mixto: { id: "mixto", nombre: "Coalición entre bloques", color: "#8a8f98" },
  otros: { id: "otros", nombre: "Otros / locales / independientes", color: "#9aa0a6" },
};

function reglas(anio: number): Record<string, string> {
  if (anio >= 2021) return { morena: "morena_aliados", pt: "morena_aliados", pvem: "morena_aliados", pes: "morena_aliados", pan: "oposicion", pri: "oposicion", prd: "oposicion", mc: "mc" };
  if (anio === 2018) return { morena: "morena_aliados", pt: "morena_aliados", pes: "morena_aliados", pan: "frente", prd: "frente", mc: "frente", pri: "pri_aliados", pvem: "pri_aliados", pna: "pri_aliados" };
  return { pri: "pri_aliados", pvem: "pri_aliados", pna: "pri_aliados", pan: "pan", prd: "izquierda", pt: "izquierda", mc: "izquierda", conve: "izquierda", morena: "izquierda" };
}

export function bloqueDe(partido: string, anio: number): string {
  const r = reglas(anio);
  const bs = new Set<string>();
  for (const t of partido.split("-")) if (r[t]) bs.add(r[t]);
  if (bs.size === 1) return [...bs][0];
  if (bs.size > 1) return "mixto";
  return "otros";
}

export function porBloque(partidos: Record<string, number>, anio: number): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [p, v] of Object.entries(partidos)) { const b = bloqueDe(p, anio); o[b] = (o[b] ?? 0) + v; }
  return o;
}

const suma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export type Indicadores = { nep: number | null; ganador: string | null; pGanador: number | null; segundo: string | null; margen: number | null; hhi: number | null };
/** Indicadores sobre votos a partidos de UNA elección. nep = número efectivo de partidos (Laakso-Taagepera). margen en puntos. */
export function indicadores(partidos: Record<string, number>): Indicadores {
  const t = suma(partidos);
  if (!t) return { nep: null, ganador: null, pGanador: null, segundo: null, margen: null, hhi: null };
  const o = Object.entries(partidos).sort((a, b) => b[1] - a[1]);
  const sh = o.map(([, v]) => v / t);
  const hhi = sh.reduce((a, s) => a + s * s, 0);
  return { nep: 1 / hhi, ganador: o[0][0], pGanador: 100 * sh[0], segundo: o[1]?.[0] ?? null, margen: 100 * (sh[0] - (sh[1] ?? 0)), hhi };
}

/** Volatilidad de Pedersen entre dos elecciones (porcentajes por bloque): ½ Σ |p_t − p_t-1| (0–100). */
export function pedersen(a: Record<string, number>, b: Record<string, number>): number | null {
  const ta = suma(a), tb = suma(b);
  if (!ta || !tb) return null;
  const k = new Set([...Object.keys(a), ...Object.keys(b)]);
  let s = 0;
  for (const x of k) s += Math.abs((100 * (a[x] ?? 0)) / ta - (100 * (b[x] ?? 0)) / tb);
  return s / 2;
}

export type Competitividad = "bastion" | "ventaja" | "competitiva" | "reñida";
export function competitividad(margenPts: number | null): Competitividad | null {
  if (margenPts === null) return null;
  return margenPts >= 20 ? "bastion" : margenPts >= 10 ? "ventaja" : margenPts >= 5 ? "competitiva" : "reñida";
}
export const ETIQ_COMP: Record<Competitividad, { t: string; color: string; d: string }> = {
  bastion: { t: "Bastión", color: "#1e3a5f", d: "margen ≥ 20 puntos" },
  ventaja: { t: "Ventaja", color: "#0e71af", d: "margen de 10 a 20 puntos" },
  competitiva: { t: "Competitiva", color: "#d97706", d: "margen de 5 a 10 puntos" },
  reñida: { t: "Muy reñida", color: "#d81b60", d: "margen menor a 5 puntos" },
};

// ---- Enfoque partidista (selector global de la app) ------------------------------------------------------------------------
// Con enfoque, la competitividad se mide DESDE el partido elegido: la candidatura en la que participa (la coalición que lo contiene en
// esa boleta, inferida por porCandidatura) contra la mejor rival. Si gana: margen sobre la segunda; si pierde: distancia a la ganadora.
export type Enfoque = "general" | "morena" | "pan" | "pri" | "mc";
export const ENFOQUES: { id: Enfoque; t: string; color: string }[] = [
  { id: "general", t: "General", color: "#64748b" },
  { id: "morena", t: "Morena", color: "#8b1d3b" },
  { id: "pan", t: "PAN", color: "#1d5fbf" },
  { id: "pri", t: "PRI", color: "#d62828" },
  { id: "mc", t: "MC", color: "#f28a1a" },
];
const TOKENS: Record<Exclude<Enfoque, "general">, string[]> = { morena: ["morena"], pan: ["pan"], pri: ["pri"], mc: ["mc", "conve"] }; // MC antes fue Convergencia
export const esEnfoque = (x: string | null | undefined): x is Enfoque => ENFOQUES.some((e) => e.id === x);

export type ClaseEnf = "bastion" | "ventaja" | "competitiva" | "reñida_gana" | "reñida_pierde" | "alcance" | "desventaja" | "adversa" | "sin_candidatura";
export type Clase = Competitividad | ClaseEnf;
/** Candidatura del partido de enfoque en una boleta (votos por candidatura) y su posición. margen > 0 si gana (sobre la 2ª), < 0 si pierde (contra la 1ª). */
export function claseEnfoque(cand: Record<string, number>, enfoque: Enfoque): { clase: ClaseEnf | null; margen: number | null; pct: number | null; candidatura: string | null } {
  if (enfoque === "general") return { clase: null, margen: null, pct: null, candidatura: null };
  const t = suma(cand);
  if (!t) return { clase: null, margen: null, pct: null, candidatura: null };
  const toks = TOKENS[enfoque];
  const o = Object.entries(cand).sort((a, b) => b[1] - a[1]);
  const mia = o.find(([k]) => k.split("-").some((x) => toks.includes(x)));
  if (!mia) return { clase: "sin_candidatura", margen: null, pct: null, candidatura: null };
  const p = (100 * mia[1]) / t;
  const rival = o.find(([k]) => k !== mia[0]);
  const pr = rival ? (100 * rival[1]) / t : 0;
  const m = p - pr; // la mejor rival: si gano es la 2ª; si pierdo es la 1ª
  const clase: ClaseEnf = m >= 0 ? (m >= 20 ? "bastion" : m >= 10 ? "ventaja" : m >= 5 ? "competitiva" : "reñida_gana")
    : (-m < 5 ? "reñida_pierde" : -m < 10 ? "alcance" : -m < 20 ? "desventaja" : "adversa");
  return { clase, margen: m, pct: p, candidatura: mia[0] };
}
/** Clase de una unidad: la general (entre las dos primeras) o la del partido de enfoque. */
export function claseUnidad(cand: Record<string, number>, margenGeneral: number | null, enfoque: Enfoque) {
  if (enfoque === "general") return { clase: competitividad(margenGeneral) as Clase | null, margen_enfoque: null as number | null, p_enfoque: null as number | null };
  const c = claseEnfoque(cand, enfoque);
  return { clase: c.clase as Clase | null, margen_enfoque: c.margen, p_enfoque: c.pct };
}
export const ETIQ_CLASE: Record<Clase, { t: string; color: string; d: string }> = {
  ...ETIQ_COMP,
  "reñida_gana": { t: "Reñida, gana", color: "#d97706", d: "gana por menos de 5 puntos" },
  "reñida_pierde": { t: "Reñida, pierde", color: "#e0557f", d: "pierde por menos de 5 puntos" },
  alcance: { t: "Al alcance", color: "#c2185b", d: "pierde por 5 a 10 puntos" },
  desventaja: { t: "Desventaja", color: "#9c1450", d: "pierde por 10 a 20 puntos" },
  adversa: { t: "Adversa", color: "#5b0f2e", d: "pierde por 20 puntos o más" },
  sin_candidatura: { t: "Sin candidatura", color: "#9aa0a6", d: "el partido no aparece en la boleta de esta unidad" },
};
/** Clases a mostrar (en orden) y su descripción según el enfoque. */
export function clasesDe(enfoque: Enfoque): { k: Clase; t: string; color: string; d: string }[] {
  if (enfoque === "general") return (["bastion", "ventaja", "competitiva", "reñida"] as Clase[]).map((k) => ({ k, ...ETIQ_CLASE[k] }));
  const g = { bastion: "gana por 20 puntos o más", ventaja: "gana por 10 a 20 puntos", competitiva: "gana por 5 a 10 puntos" } as Record<string, string>;
  return (["bastion", "ventaja", "competitiva", "reñida_gana", "reñida_pierde", "alcance", "desventaja", "adversa", "sin_candidatura"] as Clase[])
    .map((k) => ({ k, ...ETIQ_CLASE[k], d: g[k] ?? ETIQ_CLASE[k].d }));
}

/** Era del mapa distrital federal (los id_distrito de eras distintas NO son la misma geografía). */
export function eraDistrital(anio: number): number { return anio >= 2024 ? 2024 : anio >= 2018 ? 2018 : anio >= 2006 ? 2006 : anio >= 1997 ? 1997 : 1979; }

/** Familia partidista de un ganador, comparable ENTRE años (a diferencia de los bloques, que cambian con las coaliciones de cada elección).
 *  Una coalición se resuelve por su primer componente conocido en este orden: morena, pan, pri, prd, mc, pt, pvem. Morena, PT y PES → «morena». */
export function familia(partido: string | null): string | null {
  if (!partido) return null;
  const t = new Set(partido.split("-"));
  for (const [k, f] of [["morena", "morena"], ["pan", "pan"], ["pri", "pri"], ["prd", "prd"], ["mc", "mc"], ["conve", "mc"], ["pt", "morena"], ["pvem", "pvem"], ["pes", "morena"]] as const) if (t.has(k)) return f;
  return "otros";
}

/** Votos por CANDIDATURA inferida de la boleta: cada partido o subcoalición se suma a la coalición más amplia que lo contiene
 *  (p. ej. 2024: morena, pt, pvem, pt-morena… → «pvem-pt-morena»). Los partidos que no aparecen en ninguna coalición son su propia candidatura.
 *  Es una inferencia: si dos partidos fueron juntos pero la fuente no trae ninguna fila de coalición, quedan separados. */
export function porCandidatura(partidos: Record<string, number>): Record<string, number> {
  const coal = Object.keys(partidos).filter((k) => k.includes("-")).map((k) => ({ k, s: new Set(k.split("-")) }))
    .sort((a, b) => b.s.size - a.s.size || (partidos[b.k] ?? 0) - (partidos[a.k] ?? 0));
  const max: { k: string; s: Set<string> }[] = [];
  for (const c of coal) if (!max.some((m) => [...c.s].every((t) => m.s.has(t)))) max.push(c);
  const out: Record<string, number> = {};
  for (const [p, v] of Object.entries(partidos)) {
    const comp = p.split("-");
    const dest = max.find((m) => comp.every((t) => m.s.has(t)));
    const k = dest ? dest.k : p;
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
/** Votos agrupados por el partido que encabeza cada candidatura (comparable entre años). */
export function porFamilia(partidos: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(porCandidatura(partidos))) { const f = familia(k) ?? "otros"; o[f] = (o[f] ?? 0) + v; }
  return o;
}
export const nombreCandidatura = (k: string) => k.split("-").map((t) => t.toUpperCase()).join(" · ");
