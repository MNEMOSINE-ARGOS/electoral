import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { GRUPOS_EDAD } from "@/lib/consultas";
import { porCandidatura } from "@/lib/analisis";
import { origenes, hijasDe } from "@/lib/historico";

// Ficha de una sección: todas sus elecciones (cada una por separado), lista nominal por edad y sexo, y serie de cortes.
// ?id=50338  (seccion_id = id_estado*10000 + sección). Aviso: la sección puede no ser la misma unidad geográfica entre años.
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const base = await q<{ totales_id: string; eleccion: string; anio: number; votos_totales: string | null; lista_nominal: string | null; id_distrito_federal: number | null; id_distrito_local: number | null }>(
    `SELECT totales_id, eleccion, anio, votos_totales, lista_nominal, id_distrito_federal, id_distrito_local
     FROM sec_resumen WHERE seccion_id = $1 AND extraordinaria = false ORDER BY eleccion, anio`, [id]);
  const vs = base.length ? await q<{ totales_id: number | string; partido: string; votos: string }>(
    "SELECT v.totales_id, c.partido, v.votos FROM sec_votos v JOIN app_partido_codigo c ON c.codigo = v.partido WHERE v.totales_id = ANY($1::bigint[])", [base.map((b) => b.totales_id)]) : [];
  const por = new Map<string, Record<string, number>>();
  for (const v of vs) { const k = String(v.totales_id); if (!por.has(k)) por.set(k, {}); por.get(k)![v.partido] = Number(v.votos); }
  const historia = base.map((b) => {
    const cand = porCandidatura(por.get(String(b.totales_id)) ?? {});
    const t = Object.values(cand).reduce((a, x) => a + x, 0);
    const o = Object.entries(cand).sort((a, x) => x[1] - a[1]);
    const lugar = (i: number) => (o[i] ? { candidatura: o[i][0], votos: o[i][1], pct: t ? (100 * o[i][1]) / t : 0 } : null);
    const vt = b.votos_totales ? Number(b.votos_totales) : null, ln = b.lista_nominal ? Number(b.lista_nominal) : null;
    const p1 = lugar(0), p2 = lugar(1);
    return { eleccion: b.eleccion, anio: b.anio, primero: p1, segundo: p2, margen: p1 && p2 ? p1.pct - p2.pct : null,
      votos_totales: vt, lista_nominal: ln, participacion: vt && ln ? (100 * vt) / ln : null, id_distrito_federal: b.id_distrito_federal, id_distrito_local: b.id_distrito_local };
  });
  // ?corte=YYYY-MM-DD elige un corte de edad concreto (si existe para la sección); si no, el más reciente
  const pedido = new URL(req.url).searchParams.get("corte");
  const cortesEdad = (await q<{ f: string }>("SELECT to_char(fecha_corte,'YYYY-MM-DD') AS f FROM ln_edad_seccion WHERE seccion_id = $1 ORDER BY fecha_corte", [id])).map((x) => x.f);
  const corte = { f: pedido && cortesEdad.includes(pedido) ? pedido : (cortesEdad.at(-1) ?? null) };
  let piramide: { h: number[]; m: number[]; nb: number } | null = null;
  if (corte?.f) {
    const [r] = await q<{ h: number[]; m: number[]; nb: number }>("SELECT h, m, nb FROM ln_edad_seccion WHERE seccion_id = $1 AND fecha_corte = $2", [id, corte.f]);
    if (r) piramide = { h: r.h.map(Number), m: r.m.map(Number), nb: Number(r.nb) };
  }
  const serie = await q(
    "SELECT to_char(fecha_corte,'YYYY-MM-DD') AS fecha_corte, lista_hombres, lista_mujeres, lista_total, padron_total FROM ln_seccion WHERE seccion_id = $1 ORDER BY fecha_corte", [id]);
  const [mun] = await q<{ nombre: string; clave_inegi: number }>(
    "SELECT m.nombre, m.clave_inegi FROM app_municipio m WHERE m.clave_inegi = (SELECT clave_inegi FROM sec_resumen WHERE seccion_id = $1 AND clave_inegi IS NOT NULL ORDER BY anio DESC LIMIT 1)", [id]);
  // Genealogía oficial (INE): de qué sección viene y en cuáles se dividió o con cuál se fusionó
  const genealogia = {
    origenes: origenes(id).map((o) => ({ seccion: o.o % 10000, tipo: o.t, anio: o.a })),
    destinos: hijasDe(id).map((h) => h % 10000),
  };
  return NextResponse.json({ seccion_id: id, seccion: id % 10000, genealogia, id_estado: Math.floor(id / 10000), municipio: mun ?? null, historia, corte_edad: corte?.f ?? null, cortes_edad: cortesEdad, grupos: GRUPOS_EDAD, piramide, serie,
    aviso: "El número de sección identifica la sección en cada año; si hubo reseccionamiento, la geografía puede haber cambiado (docs/GUIA_RESECCIONAMIENTO.md)." });
}
