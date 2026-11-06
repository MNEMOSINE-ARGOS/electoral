import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Opciones para los buscadores de territorio, siempre de UNA elección (cargo + año):
//   tipo=distrito&eleccion&anio&estado            distritos (federal o local según el cargo), con el municipio principal
//   tipo=seccion&eleccion&anio&estado[&municipio|&distrito]   secciones con su municipio
export async function GET(req: Request) {
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo");
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  const estado = Number(u.searchParams.get("estado") || 0);
  const municipio = Number(u.searchParams.get("municipio") || 0);
  const distrito = Number(u.searchParams.get("distrito") || 0);
  if (!anio || !estado) return NextResponse.json({ opciones: [] });
  const local = eleccion.startsWith("diputados_locales");
  const colDis = local ? "id_distrito_local" : "id_distrito_federal";

  if (tipo === "distrito") {
    if (!["presidente", "senado", "diputados_federales", "diputados_locales_mr", "diputados_locales_rp"].includes(eleccion)) return NextResponse.json({ opciones: [] });
    const filas = await q<{ id: number; nombre: string | null; secciones: string }>(
      `SELECT DISTINCT ON (d) d AS id, m.nombre, n AS secciones FROM (
         SELECT ${colDis} AS d, clave_inegi, count(*) AS n FROM sec_resumen WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND id_estado = $3 AND ${colDis} IS NOT NULL GROUP BY 1, 2
       ) x LEFT JOIN app_municipio m USING (clave_inegi) ORDER BY d, n DESC`, [eleccion, anio, estado]);
    return NextResponse.json({ opciones: filas.map((f) => ({ valor: f.id, etiqueta: `Distrito ${local ? "local " : ""}${f.id % 100}`, sub: f.nombre ? `principal: ${f.nombre}` : undefined })) });
  }
  if (tipo === "seccion") {
    const p: unknown[] = [eleccion, anio, estado];
    let extra = "";
    if (municipio) { p.push(municipio); extra = ` AND s.clave_inegi = $4`; }
    else if (distrito) { p.push(distrito); extra = ` AND s.${colDis} = $4`; }
    const filas = await q<{ seccion_id: string; nombre: string | null }>(
      `SELECT DISTINCT s.seccion_id, m.nombre FROM sec_resumen s LEFT JOIN app_municipio m USING (clave_inegi)
       WHERE s.eleccion = $1 AND s.anio = $2 AND s.extraordinaria = false AND s.id_estado = $3 AND s.seccion_id % 10000 <> 0${extra} ORDER BY s.seccion_id LIMIT 8000`, p);
    return NextResponse.json({ opciones: filas.map((f) => ({ valor: Number(f.seccion_id), etiqueta: String(Number(f.seccion_id) % 10000), sub: f.nombre ?? undefined })) });
  }
  return NextResponse.json({ error: "tipo" }, { status: 400 });
}
