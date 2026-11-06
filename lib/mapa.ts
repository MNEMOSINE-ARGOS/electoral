// Colores y leyendas de los mapas (nacional por entidad y de una entidad por municipio, distrito o sección).
// Escalas en pasos fijos, no continuas: así la leyenda dice exactamente qué significa cada tono y dos mapas se comparan entre sí.
import { ETIQ_CLASE, clasesDe, nombreCandidatura, type Clase, type Enfoque } from "@/lib/analisis";
import { colorPartido } from "@/lib/partidos";

export type UnidadMapa = {
  id: number; votos_totales: number | null; lista_nominal: number | null; participacion: number | null;
  ganador: string | null; p_ganador: number | null; segundo: string | null; margen: number | null;
  clase: Clase | null; margen_enfoque: number | null; p_enfoque: number | null; alc: Record<string, number>;
};
export type Metrica = "ganador" | "competitividad" | "participacion" | "partido";
export const METRICAS: { id: Metrica; t: string; d: string }[] = [
  { id: "ganador", t: "Quién ganó", d: "Color de la candidatura ganadora; más intenso, más amplio el margen." },
  { id: "competitividad", t: "Qué tan reñido", d: "Bastión, ventaja, competitiva o reñida; con enfoque, desde ese partido." },
  { id: "participacion", t: "Participación", d: "Qué parte de la lista nominal votó." },
  { id: "partido", t: "Fuerza de un partido", d: "% de los votos que pasaron por el partido (solo o en coalición)." },
];

export const SIN_DATOS = "color-mix(in srgb, var(--fg) 7%, var(--card-solid))";
const mezcla = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, var(--card-solid))`;

export const PASOS_MARGEN = [{ hasta: 5, t: "menos de 5 pts", p: 38 }, { hasta: 10, t: "5 a 10", p: 58 }, { hasta: 20, t: "10 a 20", p: 80 }, { hasta: Infinity, t: "20 o más", p: 100 }];
export const PASOS_PART = [{ hasta: 45, t: "< 45%" }, { hasta: 55, t: "45-55" }, { hasta: 65, t: "55-65" }, { hasta: 75, t: "65-75" }, { hasta: Infinity, t: "≥ 75%" }];
export const PASOS_PARTIDO = [{ hasta: 10, t: "< 10%" }, { hasta: 20, t: "10-20" }, { hasta: 35, t: "20-35" }, { hasta: 50, t: "35-50" }, { hasta: Infinity, t: "≥ 50%" }];
const TONOS5 = [16, 34, 55, 77, 100];
const paso = (pasos: { hasta: number }[], v: number) => pasos.findIndex((x) => v < x.hasta);

export function colorUnidad(u: UnidadMapa | undefined, metrica: Metrica, partido: string): string {
  if (!u) return SIN_DATOS;
  if (metrica === "ganador") return u.ganador && u.margen !== null ? mezcla(colorPartido(u.ganador), PASOS_MARGEN[paso(PASOS_MARGEN, u.margen)].p) : SIN_DATOS;
  if (metrica === "competitividad") return u.clase ? ETIQ_CLASE[u.clase].color : SIN_DATOS;
  if (metrica === "participacion") return u.participacion === null ? SIN_DATOS : mezcla("var(--azul)", TONOS5[paso(PASOS_PART, u.participacion)]);
  const v = u.alc[partido];
  return v === undefined ? (u.ganador ? mezcla(colorPartido(partido), 6) : SIN_DATOS) : mezcla(colorPartido(partido), TONOS5[paso(PASOS_PARTIDO, v)]);
}

export type ItemLeyenda = { k: string; color: string; t: string; n: number; d?: string };

/** Leyenda con cuántas unidades caen en cada categoría (las vacías también se muestran en las escalas, para que se lea la escala completa). */
export function leyenda(us: UnidadMapa[], metrica: Metrica, partido: string, enfoque: Enfoque): { items: ItemLeyenda[]; escala?: { color: string; t: string; n: number }[] } {
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
  const [pasos, color, valor] = metrica === "participacion"
    ? [PASOS_PART, "var(--azul)", (u: UnidadMapa) => u.participacion] as const
    : [PASOS_PARTIDO, colorPartido(partido), (u: UnidadMapa) => u.alc[partido] ?? (u.ganador ? 0 : null)] as const;
  return { items: pasos.map((s, i) => ({ k: s.t, color: mezcla(color, TONOS5[i]), t: s.t, n: us.filter((u) => { const v = valor(u); return v !== null && paso(pasos, v) === i; }).length })) };
}

/** Partidos con presencia, ordenados por su peso total (para el selector de «Fuerza de un partido»). Sin coaliciones: solo siglas. */
export function partidosPresentes(us: UnidadMapa[]): string[] {
  const s = new Map<string, number>();
  for (const u of us) for (const [p, v] of Object.entries(u.alc)) if (!p.includes("-")) s.set(p, (s.get(p) ?? 0) + v * (u.votos_totales ?? 1));
  return [...s].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 14);
}

/** Vigencia de la cartografía detallada de una entidad (la escribe scripts/geo_entidad.ts en public/geo/entidades.json). */
export type EntidadGeo = { id: number; nombre: string; secciones: number; df_desde: number | null; dl_desde: number | null };
