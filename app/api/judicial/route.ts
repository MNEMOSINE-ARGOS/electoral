import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Elección del Poder Judicial 2025 (federal y local). Se vota por PERSONAS y cada elector marca varias candidaturas:
// la participación es personas_votaron / lista_nominal; los votos no se comparan con elecciones de partidos ni entre cargos.
// vista=resumen | estados&eleccion | ambitos&eleccion[&estado] | candidatos&eleccion&ambito[&estado] | candidato&id | municipios&eleccion&estado
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function GET(req: Request) {
  const u = new URL(req.url);
  const vista = u.searchParams.get("vista") || "resumen";
  const eleccion = u.searchParams.get("eleccion") || "judicial_scjn";
  const estado = Number(u.searchParams.get("estado") || 0);

  if (vista === "resumen") {
    const tot = await q<Record<string, string>>(
      `SELECT eleccion, count(DISTINCT id_estado) AS estados, count(DISTINCT oficina) AS oficinas, sum(personas_votaron) AS personas_votaron, sum(lista_nominal) AS lista_nominal,
              sum(votos_totales) AS votos_totales, sum(nulos) AS nulos, sum(recuadros_no_utilizados) AS recuadros
       FROM jud_estado GROUP BY eleccion`);
    const cand = await q<{ eleccion: string; candidaturas: string; ambitos: string; mujeres: string; hombres: string }>(
      `SELECT eleccion, count(*) AS candidaturas, count(DISTINCT (ambito, id_estado)) AS ambitos, count(*) FILTER (WHERE genero = 'M') AS mujeres, count(*) FILTER (WHERE genero = 'H') AS hombres FROM jud_candidatura GROUP BY eleccion`);
    const locales = await q<{ id_estado: number; eleccion: string; oficinas: string }>(
      "SELECT id_estado, eleccion, count(DISTINCT oficina) AS oficinas FROM jud_estado WHERE eleccion LIKE 'judicial_local%' GROUP BY 1, 2 ORDER BY 1, 2");
    return NextResponse.json({
      cargos: tot.map((t) => ({ ...t, ...cand.find((c) => c.eleccion === t.eleccion) }) as Record<string, string>).map((t) => ({
        eleccion: t.eleccion, estados: n(t.estados), oficinas: n(t.oficinas), personas_votaron: n(t.personas_votaron), lista_nominal: n(t.lista_nominal), votos_totales: n(t.votos_totales),
        nulos: n(t.nulos), recuadros: n(t.recuadros), candidaturas: n(t.candidaturas), ambitos: n(t.ambitos), mujeres: n(t.mujeres), hombres: n(t.hombres),
      })),
      locales,
    });
  }
  if (vista === "estados") {
    const filas = await q(`SELECT id_estado, sum(personas_votaron) AS personas_votaron, sum(lista_nominal) AS lista_nominal, sum(votos_totales) AS votos_totales, sum(nulos) AS nulos,
      sum(recuadros_no_utilizados) AS recuadros FROM jud_estado WHERE eleccion = $1 GROUP BY id_estado ORDER BY id_estado`, [eleccion]);
    return NextResponse.json({ eleccion, estados: filas });
  }
  if (vista === "ambitos") {
    const filas = await q(`SELECT ambito, id_estado, count(*) AS candidaturas, sum(votos) AS votos, min(materia) FILTER (WHERE materia IS NOT NULL) AS materia
      FROM jud_candidatura WHERE eleccion = $1 AND ($2::int = 0 OR id_estado = $2) GROUP BY ambito, id_estado ORDER BY id_estado, ambito`, [eleccion, estado]);
    return NextResponse.json({ eleccion, ambitos: filas });
  }
  if (vista === "candidatos") {
    const ambito = u.searchParams.get("ambito") || "Nacional";
    const filas = await q(`SELECT candidatura_id, nombre, no_candidato, genero, materia, poder_postulante, cancelada, votos, lugar, pct_ambito, votos_oficiales, candidaturas_ambito
      FROM jud_candidatura WHERE eleccion = $1 AND ambito = $2 AND ($3::int = 0 OR id_estado = $3) ORDER BY lugar, nombre LIMIT 400`, [eleccion, ambito, estado]);
    return NextResponse.json({ eleccion, ambito, candidatos: filas });
  }
  if (vista === "candidato") {
    const id = u.searchParams.get("id") || "";
    const [c] = await q("SELECT * FROM jud_candidatura WHERE candidatura_id = $1", [id]);
    const por = await q(`SELECT x.id_estado, x.votos, e.votos_totales FROM jud_cand_estado x
      LEFT JOIN (SELECT id_estado, sum(votos_totales) AS votos_totales FROM jud_estado WHERE eleccion = $2 GROUP BY 1) e USING (id_estado) WHERE x.candidatura_id = $1 ORDER BY x.id_estado`, [id, (c as { eleccion?: string })?.eleccion ?? ""]);
    return NextResponse.json({ candidato: c ?? null, estados: por });
  }
  if (vista === "municipios") {
    const filas = await q(`SELECT j.clave_inegi, m.nombre, j.secciones, j.personas_votaron, j.lista_nominal, j.votos_totales, j.nulos
      FROM jud_municipio j LEFT JOIN app_municipio m USING (clave_inegi) WHERE j.eleccion = $1 AND j.id_estado = $2 ORDER BY m.nombre`, [eleccion, estado]);
    return NextResponse.json({ eleccion, estado, municipios: filas });
  }
  return NextResponse.json({ error: "vista desconocida" }, { status: 400 });
}
