import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// ?estado=5            municipios de un estado
// ?buscar=torreon      búsqueda por nombre en todo el país (máx. 30)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const estado = Number(u.searchParams.get("estado"));
  const buscar = (u.searchParams.get("buscar") || "").trim();
  let filas;
  if (estado) {
    filas = await q("SELECT clave_inegi, id_estado, nombre FROM app_municipio WHERE id_estado = $1 ORDER BY nombre", [estado]);
  } else if (buscar.length >= 2) {
    filas = await q(
      `SELECT m.clave_inegi, m.id_estado, m.nombre, e.abreviatura FROM app_municipio m JOIN app_estado e USING (id_estado)
       WHERE translate(lower(m.nombre), 'áéíóú', 'aeiou') LIKE '%' || translate(lower($1), 'áéíóú', 'aeiou') || '%' ORDER BY m.nombre LIMIT 30`,
      [buscar],
    );
  } else {
    return NextResponse.json({ error: "Indica estado o buscar" }, { status: 400 });
  }
  const res = NextResponse.json({ municipios: filas });
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
