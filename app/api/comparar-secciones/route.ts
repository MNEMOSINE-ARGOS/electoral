import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { porCandidatura } from "@/lib/analisis";
import { claves } from "@/lib/params";

// Comparación sección por sección entre dos elecciones (mismo cargo de otro año, o incluso otro cargo) dentro de un municipio o distrito.
// ?eleccion=presidente&anio=2024&eleccion2=presidente&anio2=2018&municipio=5035   (o &distrito=506; con &distrito y &municipio, el cruce)
// Cada elección se calcula por separado (votos por candidatura inferida de la boleta); nunca se suman entre sí.
// Las secciones se cruzan por seccion_id: si hubo reseccionamiento, una sección puede no existir en la otra elección.
type Tot = { totales_id: string; seccion_id: string; votos_totales: string | null; lista_nominal: string | null };

async function cargar(eleccion: string, anio: number, filtro: string, valores: unknown[]) {
  const tots = await q<Tot>(
    `SELECT totales_id, seccion_id, votos_totales, lista_nominal FROM sec_resumen WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND ${filtro}`, [eleccion, anio, ...valores]);
  const vs = tots.length ? await q<{ totales_id: number | string; partido: string; votos: string }>(
    "SELECT v.totales_id, c.partido, v.votos FROM sec_votos v JOIN app_partido_codigo c ON c.codigo = v.partido WHERE v.totales_id = ANY($1::bigint[])", [tots.map((t) => t.totales_id)]) : [];
  const por = new Map<string, Record<string, number>>();
  for (const v of vs) { const k = String(v.totales_id); if (!por.has(k)) por.set(k, {}); por.get(k)![v.partido] = Number(v.votos); }
  const out = new Map<number, { vt: number | null; ln: number | null; fam: Record<string, number> }>();
  for (const t of tots) out.set(Number(t.seccion_id), { vt: t.votos_totales ? Number(t.votos_totales) : null, ln: t.lista_nominal ? Number(t.lista_nominal) : null, fam: porCandidatura(por.get(String(t.totales_id)) ?? {}) });
  return out;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const e1 = u.searchParams.get("eleccion") || "presidente", a1 = Number(u.searchParams.get("anio"));
  const e2 = u.searchParams.get("eleccion2") || e1, a2 = Number(u.searchParams.get("anio2"));
  const muns = claves(u.searchParams.get("municipio")), dis = Number(u.searchParams.get("distrito") || 0);
  if (!a1 || !a2 || (!muns.length && !dis)) return NextResponse.json({ error: "Faltan años y municipio o distrito" }, { status: 400 });
  const colDis = e1.startsWith("diputados_locales") ? "id_distrito_local" : "id_distrito_federal";
  const A = !dis ? await cargar(e1, a1, "clave_inegi = ANY($3::int[])", [muns])
    : muns.length ? await cargar(e1, a1, `${colDis} = $3 AND clave_inegi = ANY($4::int[])`, [dis, muns])
    : await cargar(e1, a1, `${colDis} = $3`, [dis]);
  const B = await cargar(e2, a2, "seccion_id = ANY($3::bigint[])", [[...A.keys()]]);
  const secciones = [...A.entries()].filter(([id]) => id % 10000 !== 0).sort((x, y) => x[0] - y[0]).map(([id, a]) => {
    const b = B.get(id) ?? null;
    return { seccion_id: id, seccion: id % 10000, actual: a, comparada: b };
  });
  return NextResponse.json({ eleccion: e1, anio: a1, eleccion2: e2, anio2: a2, secciones, sin_par: secciones.filter((s) => !s.comparada).length });
}
