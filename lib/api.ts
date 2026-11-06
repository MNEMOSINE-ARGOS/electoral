export async function api<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (r.status === 401) { location.href = "/login"; throw new Error("sesión"); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Error ${r.status}`);
  return r.json();
}
export type Estado = { id_estado: number; nombre: string; nombre_corto: string; abreviatura: string };
export type EleccionCat = { eleccion: string; anio: number; extraordinaria: boolean; fuente: string; estados: number; confianza: string | null; tiene_municipio: boolean };
export type Corte = { fecha_corte: string; tipo_corte: string; tiene_edad: boolean };
export type Catalogo = { estados: Estado[]; elecciones: EleccionCat[]; cortes: Corte[];
  /** elecciones con resultados PREP (preliminares, lib/prep.ts), estén o no cargadas en la base: toda pantalla las marca (components/Prep) */
  prep?: { eleccion: string; anio: number; estado: number; corte: string; pct_actas: number; actas_contabilizadas: number; actas_esperadas: number; titulo?: string }[] };
export type Resultado = {
  anio: number; extraordinaria: boolean; fuentes: string[]; confianza: string | null; votos_totales: number | null; nulos: number | null;
  no_registrados: number | null; lista_nominal: number | null; secciones: number | null; partidos: Record<string, number>;
  /** Solo en distritos federales: elección de otra distritación, reconstruida sumando las secciones del distrito vigente (lib/reconstruccion.ts).
   *  Votos asignados por sección idéntica, por la genealogía de secciones del INE, por municipio entero, y votos de secciones que ya no existen que podrían ser del distrito. */
  reconstruida?: { exactos: number; por_historico: number; por_municipio: number; dudosos: number };
};
export type Municipio = { clave_inegi: number; id_estado: number; nombre: string; abreviatura?: string };
