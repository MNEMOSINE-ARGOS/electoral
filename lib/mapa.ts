// Colores y leyendas de los mapas (nacional por entidad y de una entidad por municipio, distrito o sección).
// Escalas en pasos fijos, no continuas: así la leyenda dice exactamente qué significa cada tono y dos mapas se comparan entre sí.
// Excepción: el bivariado corta por terciles del conjunto que se ve (lo dice su leyenda).
import { ETIQ_CLASE, clasesDe, nombreCandidatura, type Clase, type Enfoque } from "@/lib/analisis";
import { colorPartido } from "@/lib/partidos";

export type UnidadMapa = {
  id: number; votos_totales: number | null; lista_nominal: number | null; participacion: number | null;
  ganador: string | null; p_ganador: number | null; segundo: string | null; margen: number | null;
  clase: Clase | null; margen_enfoque: number | null; p_enfoque: number | null; alc: Record<string, number>;
  /** votos que le faltan a la candidatura del partido de enfoque para superar a la ganadora (solo si pierde) */ faltan?: number | null;
  /** nombres de las candidaturas por partido o coalición (solo cuando la fuente los trae, p. ej. el PREP por distrito) */ candidatos?: Record<string, string>;
};
export type Metrica = "ganador" | "competitividad" | "batalla" | "cambio" | "participacion" | "partido" | "bivariado";
/** usa: qué necesita además de la elección. enfoque = partido de enfoque (barra superior); partido = selector de partido; comparar = otra elección */
export const METRICAS: { id: Metrica; t: string; d: string; usa?: "enfoque" | "partido" | "comparar" }[] = [
  { id: "ganador", t: "Quién ganó", d: "Color de la candidatura ganadora; más intenso, más amplio el margen." },
  { id: "competitividad", t: "Qué tan reñido", d: "Bastión, ventaja, competitiva o reñida; con enfoque, desde ese partido." },
  { id: "batalla", t: "Campo de batalla", usa: "enfoque", d: "Desde el partido de enfoque: azul gana, rosa pierde, más intenso por más margen. Las unidades a menos de 5 puntos llevan borde." },
  { id: "cambio", t: "Cambio", usa: "comparar", d: "Cuántos puntos subió (azul) o bajó (rosa) el partido frente a otra elección. Las unidades que no existen en ambas van como «sin comparación»." },
  { id: "participacion", t: "Participación", d: "Qué parte de la lista nominal votó." },
  { id: "partido", t: "Fuerza de un partido", usa: "partido", d: "% de los votos que pasaron por el partido (solo o en coalición)." },
  { id: "bivariado", t: "Fuerza × participación", usa: "partido", d: "Cruza el % del partido con la participación (terciles). Fuerte y con baja participación = votos por movilizar." },
];
/** Cómo se dibuja: áreas coloreadas, círculos del tamaño de los votos, objetivos (votos que faltan) o historia (varias elecciones). */
export type Vista = "areas" | "circulos" | "objetivos" | "historia";
export const VISTAS: { id: Vista; t: string; d: string }[] = [
  { id: "areas", t: "Áreas", d: "Cada unidad pintada según «Colorear por»." },
  { id: "circulos", t: "Círculos", d: "Un círculo por unidad del tamaño de sus votos, con el color de «Colorear por»: las áreas grandes con pocos votos dejan de dominar." },
  { id: "objetivos", t: "Objetivos", d: "Desde el partido de enfoque: en azul tenue lo que gana; en rosa, círculos con los votos que le faltan donde pierde por 15 puntos o menos." },
  { id: "historia", t: "Historia", d: "El mismo territorio en las últimas cuatro elecciones del cargo, con la misma escala." },
];

export const SIN_DATOS = "color-mix(in srgb, var(--fg) 7%, var(--card-solid))";
export const mezcla = (c: string, p: number) => `color-mix(in srgb, ${c} ${Math.round(p)}%, var(--card-solid))`;

export const PASOS_MARGEN = [{ hasta: 5, t: "menos de 5 pts", p: 38 }, { hasta: 10, t: "5 a 10", p: 58 }, { hasta: 20, t: "10 a 20", p: 80 }, { hasta: Infinity, t: "20 o más", p: 100 }];
export const PASOS_PART = [{ hasta: 45, t: "< 45%" }, { hasta: 55, t: "45-55" }, { hasta: 65, t: "55-65" }, { hasta: 75, t: "65-75" }, { hasta: Infinity, t: "≥ 75%" }];
export const PASOS_PARTIDO = [{ hasta: 10, t: "< 10%" }, { hasta: 20, t: "10-20" }, { hasta: 35, t: "20-35" }, { hasta: 50, t: "35-50" }, { hasta: Infinity, t: "≥ 50%" }];
/** Margen del partido de enfoque: negativo pierde, positivo gana. Divergente rosa ↔ azul. */
export const PASOS_BATALLA = [
  { hasta: -20, t: "pierde por 20+", c: "var(--rose)", p: 100 }, { hasta: -10, t: "pierde 10-20", c: "var(--rose)", p: 70 },
  { hasta: -5, t: "pierde 5-10", c: "var(--rose)", p: 45 }, { hasta: 0, t: "pierde < 5", c: "var(--rose)", p: 22 },
  { hasta: 5, t: "gana < 5", c: "var(--azul)", p: 22 }, { hasta: 10, t: "gana 5-10", c: "var(--azul)", p: 45 },
  { hasta: 20, t: "gana 10-20", c: "var(--azul)", p: 70 }, { hasta: Infinity, t: "gana por 20+", c: "var(--azul)", p: 100 },
];
/** Cambio en puntos de % del partido entre dos elecciones. */
export const PASOS_CAMBIO = [
  { hasta: -10, t: "baja 10+", c: "var(--rose)", p: 100 }, { hasta: -5, t: "baja 5-10", c: "var(--rose)", p: 62 }, { hasta: -2, t: "baja 2-5", c: "var(--rose)", p: 30 },
  { hasta: 2, t: "igual (±2)", c: "var(--fg)", p: 10 },
  { hasta: 5, t: "sube 2-5", c: "var(--azul)", p: 30 }, { hasta: 10, t: "sube 5-10", c: "var(--azul)", p: 62 }, { hasta: Infinity, t: "sube 10+", c: "var(--azul)", p: 100 },
];
const TONOS5 = [16, 34, 55, 77, 100];
const paso = (pasos: { hasta: number }[], v: number) => pasos.findIndex((x) => v < x.hasta);
export const RAYADO = "url(#mapa-rayado)"; // «sin comparación»: patrón definido en MapaGeo

/** Terciles del % del partido y de la participación en el conjunto que se ve (para el bivariado). */
export type Cortes = { partido: [number, number]; part: [number, number] };
export function cortesBivariado(us: UnidadMapa[], partido: string): Cortes | null {
  const c = us.filter((u) => u.participacion !== null && u.ganador);
  if (c.length < 3) return null;
  const t = (xs: number[]): [number, number] => { const s = [...xs].sort((a, b) => a - b); return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]]; };
  return { partido: t(c.map((u) => u.alc[partido] ?? 0)), part: t(c.map((u) => u.participacion!)) };
}
const nivel3 = (v: number, t: [number, number]) => (v < t[0] ? 0 : v < t[1] ? 1 : 2);
/** a = fuerza del partido (0 débil … 2 fuerte), b = participación (0 baja … 2 alta). Rosa = partido, azul = participación. */
export const colorBivariado = (a: number, b: number) => `color-mix(in srgb, ${mezcla("var(--rose)", [8, 45, 85][a])} ${100 - [0, 40, 70][b]}%, var(--azul))`;
export function celdaBivariado(u: UnidadMapa, partido: string, c: Cortes): [number, number] | null {
  return u.participacion === null || !u.ganador ? null : [nivel3(u.alc[partido] ?? 0, c.partido), nivel3(u.participacion, c.part)];
}

/** Contexto que algunas métricas necesitan: la elección de comparación (cambio) y los cortes (bivariado). */
export type Contexto = { prev?: Map<number, UnidadMapa> | null; cortes?: Cortes | null };
/** Cambio del partido (puntos) frente a la elección de comparación; null = sin comparación. */
export function cambioDe(u: UnidadMapa, partido: string, prev: Map<number, UnidadMapa> | null | undefined): number | null {
  const a = prev?.get(u.id);
  return a && a.ganador && u.ganador ? (u.alc[partido] ?? 0) - (a.alc[partido] ?? 0) : null;
}

export function colorUnidad(u: UnidadMapa | undefined, metrica: Metrica, partido: string, ctx: Contexto = {}): string {
  if (!u) return SIN_DATOS;
  if (metrica === "ganador") return u.ganador && u.margen !== null ? mezcla(colorPartido(u.ganador), PASOS_MARGEN[paso(PASOS_MARGEN, u.margen)].p) : SIN_DATOS;
  if (metrica === "competitividad") return u.clase ? ETIQ_CLASE[u.clase].color : SIN_DATOS;
  if (metrica === "batalla") { if (u.margen_enfoque === null) return SIN_DATOS; const s = PASOS_BATALLA[paso(PASOS_BATALLA, u.margen_enfoque)]; return mezcla(s.c, s.p); }
  if (metrica === "cambio") { if (!ctx.prev) return SIN_DATOS; const c = cambioDe(u, partido, ctx.prev); if (c === null) return RAYADO; const s = PASOS_CAMBIO[paso(PASOS_CAMBIO, c)]; return mezcla(s.c, s.p); }
  if (metrica === "bivariado") { const c = ctx.cortes && celdaBivariado(u, partido, ctx.cortes); return c ? colorBivariado(c[0], c[1]) : SIN_DATOS; }
  if (metrica === "participacion") return u.participacion === null ? SIN_DATOS : mezcla("var(--azul)", TONOS5[paso(PASOS_PART, u.participacion)]);
  const v = u.alc[partido];
  return v === undefined ? (u.ganador ? mezcla(colorPartido(partido), 6) : SIN_DATOS) : mezcla(colorPartido(partido), TONOS5[paso(PASOS_PARTIDO, v)]);
}
/** ¿Lleva borde de «reñida»? (campo de batalla: a menos de 5 puntos, gane o pierda) */
export const esReñidaEnfoque = (u: UnidadMapa | undefined) => u?.margen_enfoque != null && Math.abs(u.margen_enfoque) < 5;

export type ItemLeyenda = { k: string; color: string; t: string; n: number; d?: string };
export type Leyenda = { items: ItemLeyenda[]; escala?: { color: string; t: string; n: number }[];
  /** bivariado: conteos [fuerza][participación] y sus cortes */ matriz?: { n: number[][]; cortes: Cortes; partido: string }; nota?: string };

/** Leyenda con cuántas unidades caen en cada categoría (las vacías también se muestran en las escalas, para que se lea la escala completa). */
export function leyenda(us: UnidadMapa[], metrica: Metrica, partido: string, enfoque: Enfoque, ctx: Contexto = {}): Leyenda {
  if (metrica === "ganador") {
    const n = new Map<string, number>();
    for (const u of us) if (u.ganador) n.set(u.ganador, (n.get(u.ganador) ?? 0) + 1);
    const items = [...n].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ k, color: colorPartido(k), t: nombreCandidatura(k), n: c }));
    const escala = PASOS_MARGEN.map((s, i) => ({ color: mezcla("var(--fg)", s.p * 0.7), t: s.t, n: us.filter((u) => u.margen !== null && paso(PASOS_MARGEN, u.margen) === i).length }));
    return { items, escala };
  }
  if (metrica === "competitividad") {
    return { items: clasesDe(enfoque).map((c) => ({ k: c.k, color: c.color, t: c.t, d: c.d, n: us.filter((u) => u.clase === c.k).length }))
      .filter((c) => enfoque === "general" || c.n > 0) };
  }
  if (metrica === "batalla") {
    const items = PASOS_BATALLA.map((s, i) => ({ k: s.t, color: mezcla(s.c, s.p), t: s.t, n: us.filter((u) => u.margen_enfoque !== null && paso(PASOS_BATALLA, u.margen_enfoque) === i).length }));
    const sin = us.filter((u) => u.ganador && u.margen_enfoque === null).length;
    const reñidas = us.filter(esReñidaEnfoque).length;
    return { items: sin ? [...items, { k: "sin", color: SIN_DATOS, t: "sin candidatura", n: sin }] : items, nota: `${reñidas} a menos de 5 puntos (con borde)` };
  }
  if (metrica === "cambio") {
    const cs = us.map((u) => cambioDe(u, partido, ctx.prev));
    const items: ItemLeyenda[] = PASOS_CAMBIO.map((s, i) => ({ k: s.t, color: mezcla(s.c, s.p), t: s.t, n: cs.filter((c) => c !== null && paso(PASOS_CAMBIO, c) === i).length }));
    const sin = cs.filter((c) => c === null).length;
    const v = cs.filter((c): c is number => c !== null).sort((a, b) => a - b);
    const med = v.length ? v[Math.floor(v.length / 2)] : null;
    return { items: sin ? [...items, { k: "sin", color: RAYADO, t: "sin comparación", n: sin, d: "no existe en ambas elecciones (reseccionamiento, otra distritación o sin elección)" }] : items,
      nota: med === null ? undefined : `Cambio mediano ${med > 0 ? "+" : ""}${med.toFixed(1)} pts · sube en ${v.filter((c) => c > 0).length} de ${v.length}` };
  }
  if (metrica === "bivariado") {
    const c = ctx.cortes; if (!c) return { items: [] };
    const n = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const items: ItemLeyenda[] = [];
    for (const u of us) { const x = celdaBivariado(u, partido, c); if (x) n[x[0]][x[1]]++; }
    for (let a = 2; a >= 0; a--) for (let b = 0; b < 3; b++) items.push({ k: `${a}-${b}`, color: colorBivariado(a, b), t: `${["débil", "media", "fuerte"][a]} · participación ${["baja", "media", "alta"][b]}`, n: n[a][b] });
    return { items, matriz: { n, cortes: c, partido } };
  }
  const [pasos, color, valor] = metrica === "participacion"
    ? [PASOS_PART, "var(--azul)", (u: UnidadMapa) => u.participacion] as const
    : [PASOS_PARTIDO, colorPartido(partido), (u: UnidadMapa) => u.alc[partido] ?? (u.ganador ? 0 : null)] as const;
  return { items: pasos.map((s, i) => ({ k: s.t, color: mezcla(color, TONOS5[i]), t: s.t, n: us.filter((u) => { const v = valor(u); return v !== null && paso(pasos, v) === i; }).length })) };
}

/** ¿La unidad cae en la categoría de la leyenda k? (para resaltar al pasar el cursor por la leyenda) */
export function enCategoria(u: UnidadMapa, k: string, metrica: Metrica, partido: string, ctx: Contexto, items: ItemLeyenda[]): boolean {
  if (metrica === "ganador") return u.ganador === k;
  if (metrica === "competitividad") return u.clase === k;
  if (metrica === "bivariado") { const c = ctx.cortes && celdaBivariado(u, partido, ctx.cortes); return !!c && `${c[0]}-${c[1]}` === k; }
  const it = items.find((x) => x.k === k);
  return !!it && colorUnidad(u, metrica, partido, ctx) === it.color;
}

/** Círculos proporcionales: radio (en px del mapa) ∝ √valor, para que el ÁREA sea proporcional. */
export function radios(us: UnidadMapa[], valor: (u: UnidadMapa) => number | null | undefined, rMax = 14, rMin = 1.2): Record<number, number> {
  const max = Math.max(1, ...us.map((u) => valor(u) ?? 0));
  return Object.fromEntries(us.filter((u) => (valor(u) ?? 0) > 0).map((u) => [u.id, rMin + (rMax - rMin) * Math.sqrt((valor(u) ?? 0) / max)]));
}
/** Qué parte del territorio (por número de unidades) concentra la mitad de los votos. */
export function mitadDeLosVotos(us: UnidadMapa[]): { unidades: number; de: number } | null {
  const v = us.map((u) => u.votos_totales ?? 0).filter((x) => x > 0).sort((a, b) => b - a);
  const t = v.reduce((a, b) => a + b, 0); if (!t) return null;
  let s = 0, i = 0; while (s < t / 2) s += v[i++];
  return { unidades: i, de: v.length };
}

/** Partidos con presencia, ordenados por su peso total (para el selector de «Fuerza de un partido»). Sin coaliciones: solo siglas. */
export function partidosPresentes(us: UnidadMapa[]): string[] {
  const s = new Map<string, number>();
  for (const u of us) for (const [p, v] of Object.entries(u.alc)) if (!p.includes("-")) s.set(p, (s.get(p) ?? 0) + v * (u.votos_totales ?? 1));
  return [...s].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 14);
}

/** Vigencia de la cartografía detallada de una entidad (la escribe scripts/geo_entidad.ts en public/geo/entidades.json). */
export type EntidadGeo = { id: number; nombre: string; secciones: number; df_desde: number | null; dl_desde: number | null };
