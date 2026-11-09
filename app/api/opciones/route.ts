import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { claves } from "@/lib/params";

// Opciones para los buscadores de territorio, siempre de UNA elección (cargo + año):
//   tipo=distrito&eleccion&anio&estado[&municipio]   distritos (federal o local según el cargo), con el municipio principal;
//                                                    con municipio, solo los distritos con secciones en él (orden Entidad → Municipio → Distrito → Sección)
//   tipo=seccion&eleccion&anio&estado[&municipio][&distrito]   secciones con su municipio (con ambos, las del cruce)
// estado, municipio y distrito aceptan varias claves separadas por coma (selección múltiple): se devuelve la unión.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo");
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio"));
  const estado = claves(u.searchParams.get("estado"));
  const municipio = claves(u.searchParams.get("municipio"));
  const distrito = claves(u.searchParams.get("distrito"));
  if (!anio || !estado.length) return NextResponse.json({ opciones: [] });
  const local = eleccion.startsWith("diputados_locales");
  const colDis = local ? "id_distrito_local" : "id_distrito_federal";

  if (tipo === "distrito") {
    if (!["presidente", "senado", "diputados_federales", "diputados_locales_mr", "diputados_locales_rp"].includes(eleccion)) return NextResponse.json({ opciones: [] });
    // Con municipio: solo los distritos con secciones en él, y cuántas tiene ahí
    const p: unknown[] = [eleccion, anio, estado];
    if (municipio.length) p.push(municipio);
    const aqui = municipio.length ? "clave_inegi = ANY($4::int[])" : "false";
    const filas = await q<{ id: number; nombre: string | null; aqui: string }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (d) d AS id, m.nombre, sum(CASE WHEN ${aqui} THEN n ELSE 0 END) OVER (PARTITION BY d) AS aqui FROM (
           SELECT ${colDis} AS d, clave_inegi, count(*) AS n FROM sec_resumen WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND id_estado = ANY($3::int[]) AND ${colDis} IS NOT NULL GROUP BY 1, 2
         ) x LEFT JOIN app_municipio m USING (clave_inegi) ORDER BY d, n DESC
       ) y${municipio.length ? " WHERE aqui > 0" : ""} ORDER BY id`, p);
    return NextResponse.json({ opciones: filas.map((f) => ({ valor: f.id, etiqueta: `Distrito ${local ? "local " : ""}${f.id % 100}`,
      sub: municipio.length ? `${Number(f.aqui).toLocaleString("es-MX")} secc. en el municipio` : f.nombre ? `principal: ${f.nombre}` : undefined })) });
  }
  if (tipo === "seccion") {
    const p: unknown[] = [eleccion, anio, estado];
    let extra = "";
    if (municipio.length) { p.push(municipio); extra += ` AND s.clave_inegi = ANY($${p.length}::int[])`; }
    if (distrito.length) { p.push(distrito); extra += ` AND s.${colDis} = ANY($${p.length}::int[])`; }
    const filas = await q<{ seccion_id: string; nombre: string | null }>(
      `SELECT DISTINCT s.seccion_id, m.nombre FROM sec_resumen s LEFT JOIN app_municipio m USING (clave_inegi)
       WHERE s.eleccion = $1 AND s.anio = $2 AND s.extraordinaria = false AND s.id_estado = ANY($3::int[]) AND s.seccion_id % 10000 <> 0${extra} ORDER BY s.seccion_id LIMIT 8000`, p);
    return NextResponse.json({ opciones: filas.map((f) => ({ valor: Number(f.seccion_id), etiqueta: String(Number(f.seccion_id) % 10000), sub: f.nombre ?? undefined })) });
  }
  return NextResponse.json({ error: "tipo" }, { status: 400 });
}
