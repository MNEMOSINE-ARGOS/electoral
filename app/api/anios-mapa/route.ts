import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { catalogoPrep } from "@/lib/prep";

// Qué entidades votaron cada año en UN cargo (para activar solo esos años en el mapa). ?eleccion=gobernador
// Una entidad cuenta si tiene votos por partido en agg_est_votos (no basta con totales: hay años con totales y sin votos, p. ej.
// diputaciones locales 2006), más las elecciones que solo existen como PREP (lib/prep.ts).
export async function GET(req: Request) {
  const eleccion = new URL(req.url).searchParams.get("eleccion") || "presidente";
  const r = await q<{ anio: number; estados: number[] }>(
    `SELECT anio, array_agg(DISTINCT id_estado ORDER BY id_estado) AS estados FROM agg_est_votos
     WHERE eleccion = $1 AND extraordinaria = false AND votos > 0 GROUP BY anio ORDER BY anio`, [eleccion]);
  const por = new Map(r.map((x) => [x.anio, new Set(x.estados.map(Number))]));
  for (const p of catalogoPrep()) if (p.eleccion === eleccion) { if (!por.has(p.anio)) por.set(p.anio, new Set()); por.get(p.anio)!.add(p.estado); }
  const res = NextResponse.json({ eleccion, anios: [...por].sort((a, b) => b[0] - a[0]).map(([anio, s]) => ({ anio, estados: [...s].sort((a, b) => a - b) })) });
  res.headers.set("Cache-Control", "private, max-age=600");
  return res;
}
