import { NextResponse, connection } from "next/server";
import { q } from "@/lib/db";

export async function GET() {
  await connection(); // se resuelve en cada petición: sin esto Next lo pre-renderiza al compilar y exige la base en el build
  const [estados, elecciones, cortes] = await Promise.all([
    q("SELECT id_estado, nombre, nombre_corto, abreviatura FROM app_estado ORDER BY id_estado"),
    q(`SELECT eleccion, anio, extraordinaria, fuente, estados, confianza, tiene_municipio FROM app_eleccion ORDER BY eleccion, anio, extraordinaria`),
    q(`SELECT to_char(fecha_corte, 'YYYY-MM-DD') AS fecha_corte, tipo_corte, tiene_edad, secciones_territoriales, padron_total, lista_total FROM ln_corte ORDER BY fecha_corte`),
  ]);
  const res = NextResponse.json({ estados, elecciones, cortes });
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
