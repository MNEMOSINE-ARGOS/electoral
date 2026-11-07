import { NextResponse } from "next/server";
import { INDICADORES } from "@/lib/censo";
import { seccionesCenso, resumenCenso, resumenNacional } from "@/lib/censoDatos";
import { q } from "@/lib/db";

// Censo 2020 de un territorio (pantalla Electorado): ?estado=0|id&municipio=0|clave_inegi
// País y estado: todas sus secciones. Municipio: las secciones del censo (marco INE de enero de 2021) cuyo municipio, según la base, es ese;
// el municipio de cada sección se toma de su elección más cercana a 2021 (sec_resumen). Siempre se devuelven el estado y el país para comparar.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const estado = Number(u.searchParams.get("estado") || 0);
  const municipio = Number(u.searchParams.get("municipio") || 0);
  if (estado < 0 || estado > 32) return NextResponse.json({ error: "estado" }, { status: 400 });
  const nac = await resumenNacional();
  let est: ReturnType<typeof resumenCenso> | null = null, mun: ReturnType<typeof resumenCenso> | null = null, sinMunicipio = 0;
  if (estado) {
    const ss = await seccionesCenso(estado);
    est = resumenCenso(ss.map((s) => s.f));
    if (municipio) {
      const munDe = new Map((await q<{ s: string; c: number }>(
        `SELECT DISTINCT ON (seccion_id) seccion_id AS s, clave_inegi AS c FROM sec_resumen
         WHERE id_estado = $1 AND clave_inegi IS NOT NULL AND seccion_confiable ORDER BY seccion_id, abs(anio - 2021), anio DESC`, [estado])).map((x) => [Number(x.s), x.c]));
      sinMunicipio = ss.filter((s) => !munDe.has(s.id)).length;
      mun = resumenCenso(ss.filter((s) => munDe.get(s.id) === municipio).map((s) => s.f));
    }
  }
  const res = NextResponse.json({
    fuente: "INEGI-INE, Estadísticas Censales a Escalas Geoelectorales 2020 (Censo de Población y Vivienda 2020, por sección electoral)",
    indicadores: INDICADORES.map((x) => x.k),
    territorio: mun ?? est ?? nac, estado: est, nacional: nac, nivel: mun ? "municipio" : est ? "estado" : "nacional",
    secciones_sin_municipio: sinMunicipio,
  });
  res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
}
