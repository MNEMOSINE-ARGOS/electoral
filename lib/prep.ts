// Resultados PREP (preliminares). Los genera scripts/prep_csv.ts en data/prep/ y se registran aquí. Este registro dice qué
// elecciones son PREP para marcarlas en toda la app; para que las lean todos los módulos se cargan a la base con
// scripts/cargar_prep.ts (fuente «prep_…»). Sin cargar, los mapas las leen de aquí como respaldo; si la base ya tiene esa
// elección y entidad, la base manda. Cuando el pipeline cargue los cómputos: cargar_prep.ts --revertir y quitar la línea de aquí.
// En la interfaz siempre se presentan como PREP, preliminar, con su corte y su % de actas: nunca como cómputo oficial.
import coah2026 from "@/data/prep/5_diputados_locales_mr_2026.json";
import { alcance } from "@/lib/partidos";
import { indicadores, porCandidatura, claseUnidad, type Enfoque } from "@/lib/analisis";

type Fila = { id: number; vt: number; ln: number; actas: number; p: Record<string, number> };
export type Prep = {
  fuente: "prep"; eleccion: string; anio: number; estado: number; titulo: string; corte: string;
  resumen: { actas_esperadas: number; actas_contabilizadas: number; pct_actas: number; votos_mr: number; lista_nominal: number; participacion: number; actas_sin_seccion: number; no_contabilizadas: [string, number][] };
  candidaturas: Record<string, Record<string, string>>;
  distritos: Fila[]; municipios: Fila[]; secciones: (Fila & { dl: number; m: number | null; df: number | null })[];
};
const TODOS = [coah2026 as unknown as Prep];

/** Meta que ve la interfaz (sin las filas). */
export type PrepMeta = { fuente: "prep"; corte: string; pct_actas: number; actas_contabilizadas: number; actas_esperadas: number; titulo: string };
export const metaPrep = (p: Prep): PrepMeta => ({ fuente: "prep", corte: p.corte, pct_actas: p.resumen.pct_actas, actas_contabilizadas: p.resumen.actas_contabilizadas, actas_esperadas: p.resumen.actas_esperadas, titulo: p.titulo });

export const prepDe = (eleccion: string, anio: number, estado?: number) => TODOS.filter((p) => p.eleccion === eleccion && p.anio === anio && (estado === undefined || p.estado === estado));
export const catalogoPrep = () => TODOS.map((p) => ({ eleccion: p.eleccion, anio: p.anio, estado: p.estado, ...metaPrep(p) }));

/** Totales de la entidad (suma de sus distritos: incluye las actas sin sección) en el formato de /api/estados. */
export function estadoPrep(p: Prep) {
  const partidos: Record<string, number> = {};
  let vt = 0, ln = 0;
  for (const d of p.distritos) { vt += d.vt; ln += d.ln; for (const [k, v] of Object.entries(d.p)) partidos[k] = (partidos[k] ?? 0) + v; }
  return { id_estado: p.estado, votos_totales: vt, nulos: null, lista_nominal: ln, confianza: null, fuente: "prep", partidos };
}

/** Unidades del mapa (mismo formato que /api/mapa con la base). */
export function unidadesPrep(p: Prep, nivel: string, enfoque: Enfoque, filtro?: { campo: "municipio" | "distrito" | "distrito_local"; valor: number }) {
  let filas: (Fila & { candidatos?: Record<string, string> })[];
  if (nivel === "municipio") filas = p.municipios;
  else if (nivel === "distrito_local") filas = p.distritos.map((d) => ({ ...d, candidatos: p.candidaturas[String(d.id)] }));
  else if (nivel === "seccion") filas = !filtro ? p.secciones : p.secciones.filter((s) =>
    filtro.campo === "municipio" ? s.m === filtro.valor : filtro.campo === "distrito" ? s.df === filtro.valor : s.dl === filtro.valor);
  else filas = [];
  return filas.map((f) => {
    const base = Object.values(f.p).reduce((a, b) => a + b, 0);
    const cand = porCandidatura(f.p), ind = indicadores(cand);
    const alc = Object.fromEntries(Object.entries(alcance(f.p)).filter(([, v]) => base && v / base >= 0.005).map(([k, v]) => [k, +((100 * v) / base).toFixed(1)]));
    return {
      id: f.id, votos_totales: f.vt, lista_nominal: f.ln || null, participacion: f.vt && f.ln ? +((100 * f.vt) / f.ln).toFixed(1) : null,
      ganador: ind.ganador, p_ganador: ind.pGanador === null ? null : +ind.pGanador.toFixed(1), segundo: ind.segundo,
      margen: ind.margen === null ? null : +ind.margen.toFixed(1), ...claseUnidad(cand, ind.margen, enfoque), alc,
      ...(f.candidatos ? { candidatos: f.candidatos } : {}),
    };
  });
}
