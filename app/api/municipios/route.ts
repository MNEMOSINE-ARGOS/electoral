import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { claves } from "@/lib/params";

// ?estado=5[,19…]      municipios de uno o varios estados (con la abreviatura de su estado)
// ?buscar=torreon      búsqueda por nombre en todo el país (máx. 30)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const estados = claves(u.searchParams.get("estado"));
  const buscar = (u.searchParams.get("buscar") || "").trim();
  let filas;
  if (estados.length) {
    filas = await q("SELECT m.clave_inegi, m.id_estado, m.nombre, e.abreviatura FROM app_municipio m JOIN app_estado e USING (id_estado) WHERE m.id_estado = ANY($1::int[]) ORDER BY m.nombre", [estados]);
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
