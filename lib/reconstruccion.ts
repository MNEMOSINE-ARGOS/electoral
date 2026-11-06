// Serie de un distrito FEDERAL con la geografía de UNA distritación (la del año de referencia), aunque las elecciones sean de otras.
// Método (lectura analítica, no oficial): las secciones del distrito en la elección de referencia definen su territorio; los votos de
// cada elección de otra distritación se suman por sección:
//   1. exacta: la sección (mismo seccion_id) existe en la referencia → va al distrito que tenía en la referencia;
//   2. por municipio: la sección ya no existe (reseccionamiento) pero su municipio cae entero en un solo distrito → va a ese distrito;
//   3. no asignable: la sección ya no existe y su municipio se reparte entre varios distritos → no se suma; se reporta como «dudosos»
//      (votos de municipios que comparte el distrito, que podrían ser suyos).
// Nunca se reparten votos por proporción ni se rellenan huecos.
import { q } from "./db";
import { eraDistrital } from "./analisis";

export type Reconstruida = {
  anio: number; fuente: string; votos_totales: number | null; lista_nominal: number | null; secciones: number;
  partidos: Record<string, number>;
  /** votos de secciones idénticas / asignados por municipio / de secciones que ya no existen en municipios compartidos */
  cobertura: { exactos: number; por_municipio: number; dudosos: number };
};

// Una fuente por año: la de los agregados del estado (la recomendada); si no está entre las de sección, la primera.
const BASE = `
  WITH ref AS (
    SELECT seccion_id, clave_inegi, id_distrito_federal AS d FROM sec_resumen
    WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND id_estado = $3 AND seccion_confiable AND id_distrito_federal IS NOT NULL),
  mun AS (SELECT clave_inegi, min(d) AS d, count(DISTINCT d) AS n, bool_or(d = $4) AS toca FROM ref GROUP BY clave_inegi),
  fte AS (
    SELECT DISTINCT ON (r.anio) r.anio, r.fuente FROM (SELECT DISTINCT anio, fuente FROM sec_resumen WHERE eleccion = $1 AND id_estado = $3 AND extraordinaria = false) r
    LEFT JOIN agg_est_totales a ON a.eleccion = $1 AND a.id_estado = $3 AND a.extraordinaria = false AND a.anio = r.anio AND a.fuente = r.fuente
    ORDER BY r.anio, (a.fuente IS NULL), r.fuente),
  s AS (
    SELECT r.totales_id, r.anio, r.fuente, r.votos_totales, r.lista_nominal,
      CASE WHEN ref.seccion_id IS NOT NULL THEN 'exacta' WHEN mun.n = 1 THEN 'municipio' ELSE 'no' END AS como,
      COALESCE(ref.d, CASE WHEN mun.n = 1 THEN mun.d END) AS d, COALESCE(mun.toca, false) AS toca
    FROM sec_resumen r JOIN fte ON fte.anio = r.anio AND fte.fuente = r.fuente
    LEFT JOIN ref ON ref.seccion_id = r.seccion_id LEFT JOIN mun ON mun.clave_inegi = r.clave_inegi
    WHERE r.eleccion = $1 AND r.id_estado = $3 AND r.extraordinaria = false AND r.seccion_confiable AND r.anio = ANY($5::int[]))`;

/** Elecciones del cargo en un distrito federal, de otras distritaciones, reconstruidas con la geografía del año `ref`. */
export async function serieReconstruida(eleccion: string, distrito: number, ref: number, anios: number[]): Promise<Reconstruida[]> {
  const otros = anios.filter((a) => eraDistrital(a) !== eraDistrital(ref));
  if (!otros.length) return [];
  const estado = Math.floor(distrito / 100);
  const p = [eleccion, ref, estado, distrito, otros];
  const [tots, vs] = await Promise.all([
    q<{ anio: number; fuente: string; votos: string | null; ln: string | null; secciones: string; exactos: string | null; por_municipio: string | null; dudosos: string | null }>(
      `${BASE} SELECT anio, min(fuente) AS fuente,
         sum(votos_totales) FILTER (WHERE d = $4) AS votos, sum(lista_nominal) FILTER (WHERE d = $4) AS ln, count(*) FILTER (WHERE d = $4) AS secciones,
         sum(votos_totales) FILTER (WHERE d = $4 AND como = 'exacta') AS exactos, sum(votos_totales) FILTER (WHERE d = $4 AND como = 'municipio') AS por_municipio,
         sum(votos_totales) FILTER (WHERE como = 'no' AND toca) AS dudosos
       FROM s GROUP BY anio ORDER BY anio`, p),
    q<{ anio: number; partido: string; votos: string }>(
      `${BASE} SELECT s.anio, c.partido, sum(v.votos) AS votos FROM s JOIN sec_votos v ON v.totales_id = s.totales_id JOIN app_partido_codigo c ON c.codigo = v.partido
       WHERE s.d = $4 GROUP BY s.anio, c.partido`, p),
  ]);
  const n = (x: string | null) => (x === null ? null : Number(x));
  return tots.filter((t) => Number(t.secciones) > 0).map((t) => ({
    anio: t.anio, fuente: t.fuente, votos_totales: n(t.votos), lista_nominal: n(t.ln), secciones: Number(t.secciones),
    partidos: Object.fromEntries(vs.filter((v) => v.anio === t.anio).map((v) => [v.partido, Number(v.votos)])),
    cobertura: { exactos: n(t.exactos) ?? 0, por_municipio: n(t.por_municipio) ?? 0, dudosos: n(t.dudosos) ?? 0 },
  }));
}
