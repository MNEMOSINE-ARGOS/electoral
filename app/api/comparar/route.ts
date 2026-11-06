import { NextResponse } from "next/server";
import { resultados, type Territorio } from "@/lib/consultas";
import { q } from "@/lib/db";

// Pantalla 3. ?eleccion=alcaldes&s=estado:5:2021,municipio:5035:2021,...   (nivel:id:anio)
// Todas las series son del MISMO tipo de elección y cada una es un año distinto o un territorio distinto; no se suman entre sí.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "alcaldes";
  const specs = (u.searchParams.get("s") || "").split(",").filter(Boolean).slice(0, 6);
  const series = [];
  for (const sp of specs) {
    const [nivel, idS, anioS] = sp.split(":");
    const id = Number(idS), anio = Number(anioS);
    if ((nivel !== "estado" && nivel !== "municipio") || !id || !anio) continue;
    const t: Territorio = { nivel, id };
    const [r] = await resultados(eleccion, t, anio);
    let nombre = "";
    if (nivel === "estado") nombre = (await q<{ nombre_corto: string }>("SELECT nombre_corto FROM app_estado WHERE id_estado = $1", [id]))[0]?.nombre_corto ?? String(id);
    else {
      const m = (await q<{ nombre: string; abreviatura: string }>("SELECT m.nombre, e.abreviatura FROM app_municipio m JOIN app_estado e USING (id_estado) WHERE m.clave_inegi = $1", [id]))[0];
      nombre = m ? `${m.nombre} (${m.abreviatura})` : String(id);
    }
    series.push({ clave: sp, nivel, id, anio, nombre, resultado: r ?? null });
  }
  return NextResponse.json({ eleccion, series });
}
