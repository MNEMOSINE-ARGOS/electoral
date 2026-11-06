// Consultas a los agregados (agg_*, sec_*, ln_*). REGLA: cada (eleccion, anio, extraordinaria) es una elección distinta;
// nunca se suman votos entre años ni entre tipos de elección. Solo se suman territorios DENTRO de una misma elección.
import { q } from "./db";

export type Territorio = { nivel: "nacional" | "estado" | "municipio"; id: number };

export const ELECCIONES_FEDERALES = ["presidente", "senado", "diputados_federales"] as const;

type FilaVotos = { anio: number; extraordinaria: boolean; partido: string; votos: string };
type FilaTot = {
  anio: number; extraordinaria: boolean; votos_totales: string | null; nulos: string | null; no_registrados: string | null; lista_nominal: string | null;
  secciones: string | null; confianza: string | null; fuentes: string[];
};

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

function fuenteSql(t: Territorio) {
  if (t.nivel === "municipio") return { votos: "agg_mun_votos", tot: "agg_mun_totales", filtro: "clave_inegi = $2", param: t.id };
  if (t.nivel === "estado") return { votos: "agg_est_votos", tot: "agg_est_totales", filtro: "id_estado = $2", param: t.id };
  return { votos: "agg_est_votos", tot: "agg_est_totales", filtro: "$2::int = $2::int", param: 0 };
}

export type Eleccion = {
  anio: number; extraordinaria: boolean; fuentes: string[]; confianza: string | null;
  votos_totales: number | null; nulos: number | null; no_registrados: number | null; lista_nominal: number | null; secciones: number | null;
  partidos: Record<string, number>;
};

/** Resultado de UNA elección (tipo + año) o de todos los años de un tipo, para un territorio. Cada año sale por separado. */
export async function resultados(eleccion: string, t: Territorio, anio?: number): Promise<Eleccion[]> {
  const f = fuenteSql(t);
  const filtroAnio = anio ? " AND anio = $3" : "";
  const params: unknown[] = [eleccion, f.param, ...(anio ? [anio] : [])];
  const votos = await q<FilaVotos>(
    `SELECT anio, extraordinaria, partido, sum(votos) AS votos FROM ${f.votos} WHERE eleccion = $1 AND ${f.filtro}${filtroAnio} GROUP BY anio, extraordinaria, partido`,
    params,
  );
  const tots = await q<FilaTot>(
    `SELECT anio, extraordinaria, sum(votos_totales) AS votos_totales, sum(nulos) AS nulos, sum(no_registrados) AS no_registrados, sum(lista_nominal) AS lista_nominal,
            sum(secciones) AS secciones, min(confianza) AS confianza, array_agg(DISTINCT fuente) AS fuentes
     FROM ${f.tot} WHERE eleccion = $1 AND ${f.filtro}${filtroAnio} GROUP BY anio, extraordinaria`,
    params,
  );
  const mapa = new Map<string, Eleccion>();
  const clave = (a: number, e: boolean) => `${a}|${e}`;
  for (const t of tots) {
    mapa.set(clave(t.anio, t.extraordinaria), {
      anio: t.anio, extraordinaria: t.extraordinaria, fuentes: t.fuentes, confianza: t.confianza,
      votos_totales: num(t.votos_totales), nulos: num(t.nulos), no_registrados: num(t.no_registrados), lista_nominal: num(t.lista_nominal), secciones: num(t.secciones),
      partidos: {},
    });
  }
  for (const v of votos) {
    const k = clave(v.anio, v.extraordinaria);
    if (!mapa.has(k)) mapa.set(k, { anio: v.anio, extraordinaria: v.extraordinaria, fuentes: [], confianza: null, votos_totales: null, nulos: null, no_registrados: null, lista_nominal: null, secciones: null, partidos: {} });
    mapa.get(k)!.partidos[v.partido] = Number(v.votos);
  }
  return [...mapa.values()].sort((a, b) => a.anio - b.anio || Number(a.extraordinaria) - Number(b.extraordinaria));
}

/** Estados con resultados de una elección concreta (tipo + año), cada estado por separado. */
export async function porEstado(eleccion: string, anio: number, extraordinaria = false) {
  const votos = await q<{ id_estado: number; partido: string; votos: string }>(
    `SELECT id_estado, partido, sum(votos) AS votos FROM agg_est_votos WHERE eleccion = $1 AND anio = $2 AND extraordinaria = $3 GROUP BY id_estado, partido`,
    [eleccion, anio, extraordinaria],
  );
  const tots = await q<{ id_estado: number; votos_totales: string | null; nulos: string | null; lista_nominal: string | null; confianza: string | null; fuente: string }>(
    `SELECT id_estado, sum(votos_totales) AS votos_totales, sum(nulos) AS nulos, sum(lista_nominal) AS lista_nominal, min(confianza) AS confianza, min(fuente) AS fuente
     FROM agg_est_totales WHERE eleccion = $1 AND anio = $2 AND extraordinaria = $3 GROUP BY id_estado`,
    [eleccion, anio, extraordinaria],
  );
  const est = new Map<number, { id_estado: number; votos_totales: number | null; nulos: number | null; lista_nominal: number | null; confianza: string | null; fuente: string; partidos: Record<string, number> }>();
  for (const t of tots) est.set(t.id_estado, { id_estado: t.id_estado, votos_totales: num(t.votos_totales), nulos: num(t.nulos), lista_nominal: num(t.lista_nominal), confianza: t.confianza, fuente: t.fuente, partidos: {} });
  for (const v of votos) {
    if (!est.has(v.id_estado)) est.set(v.id_estado, { id_estado: v.id_estado, votos_totales: null, nulos: null, lista_nominal: null, confianza: null, fuente: "", partidos: {} });
    est.get(v.id_estado)!.partidos[v.partido] = Number(v.votos);
  }
  return [...est.values()].sort((a, b) => a.id_estado - b.id_estado);
}

/** Pirámide de lista nominal: arreglos de 12 grupos de edad (18, 19, 20-24 … 65+). */
export const GRUPOS_EDAD = ["18", "19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65+"];
