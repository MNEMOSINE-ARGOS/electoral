import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { GRUPOS_EDAD } from "@/lib/consultas";

// Contexto geográfico (pantalla 4). ?nivel=nacional|estado|municipio|distrito&clave=5035&corte=2024-06-02
// Devuelve pirámide por edad y sexo (lista nominal) y la serie de cortes. Un corte = una fecha; no se suman cortes.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const nivel = u.searchParams.get("nivel") || "nacional";
  const clave = Number(u.searchParams.get("clave") || 0);
  const corte = u.searchParams.get("corte");
  if (!["nacional", "estado", "municipio", "distrito"].includes(nivel)) return NextResponse.json({ error: "nivel" }, { status: 400 });

  const cortes = await q<{ fecha_corte: string; tiene_edad: boolean }>(
    "SELECT to_char(fecha_corte,'YYYY-MM-DD') AS fecha_corte, tiene_edad FROM ln_corte ORDER BY fecha_corte",
  );
  const conEdad = cortes.filter((c) => c.tiene_edad).map((c) => c.fecha_corte);
  const fecha = corte && conEdad.includes(corte) ? corte : conEdad[conEdad.length - 1];

  let piramide: { h: number[]; m: number[]; nb: number } | null = null;
  let serie: unknown[] = [];
  if (nivel === "nacional") {
    const r = await q<{ h: number[]; m: number[]; nb: string }>(
      `SELECT array_agg(h_i ORDER BY i) AS h, array_agg(m_i ORDER BY i) AS m, max(nb) AS nb FROM (
         SELECT i, sum(h[i]) AS h_i, sum(m[i]) AS m_i, sum(nb) FILTER (WHERE i = 1) AS nb
         FROM ln_edad_territorio t, generate_series(1, 12) i WHERE nivel = 'estado' AND fecha_corte = $1 GROUP BY i) x`,
      [fecha],
    );
    if (r[0]) piramide = { h: r[0].h.map(Number), m: r[0].m.map(Number), nb: Number(r[0].nb ?? 0) };
    serie = await q(
      `SELECT to_char(fecha_corte,'YYYY-MM-DD') AS fecha_corte, sum(lista_h) AS lista_h, sum(lista_m) AS lista_m, sum(lista_total) AS lista_total, sum(padron_total) AS padron_total
       FROM ln_serie_territorio WHERE nivel = 'estado' GROUP BY fecha_corte ORDER BY fecha_corte`,
    );
  } else {
    const r = await q<{ h: number[]; m: number[]; nb: number }>(
      "SELECT h, m, nb FROM ln_edad_territorio WHERE nivel = $1 AND clave = $2 AND fecha_corte = $3", [nivel, clave, fecha],
    );
    if (r[0]) piramide = { h: r[0].h.map(Number), m: r[0].m.map(Number), nb: Number(r[0].nb) };
    serie = await q(
      `SELECT to_char(fecha_corte,'YYYY-MM-DD') AS fecha_corte, secciones, lista_h, lista_m, lista_total, padron_total
       FROM ln_serie_territorio WHERE nivel = $1 AND clave = $2 ORDER BY fecha_corte`, [nivel, clave],
    );
  }
  const res = NextResponse.json({ nivel, clave, corte: fecha, cortes_con_edad: conEdad, grupos: GRUPOS_EDAD, piramide, serie });
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
