import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { GRUPOS_EDAD } from "@/lib/consultas";
import { eraDistrital } from "@/lib/analisis";

// Lista nominal por edad y sexo del territorio elegido en «Resultados por cargo», en el corte DERFE MÁS RECIENTE, con referencias:
// su estado y el país en el mismo corte, y el mismo territorio en el corte de la elección (el más cercano anterior a la jornada).
// ?eleccion=diputados_federales&anio=2024&estado=5&municipio=0&distrito=0&seccion=0
// Fuente por nivel: país, estado, municipio y distrito federal vigente → ln_edad_territorio. Distrito local, distrito federal de otra
// distritación y sección → suma de ln_edad_seccion de las secciones de esa elección (las que ya no existen en el corte no se cuentan; se avisa).
type Pir = { h: number[]; m: number[]; nb: number };
type Fila = { h: (string | number)[] | null; m: (string | number)[] | null; nb: string | number | null; n?: string | number };

const SUMA = (tabla: string, filtro: string) =>
  `SELECT array_agg(h_i ORDER BY i) AS h, array_agg(m_i ORDER BY i) AS m, max(nb) AS nb, max(n) AS n FROM (
     SELECT i, sum(h[i]) AS h_i, sum(m[i]) AS m_i, sum(nb) FILTER (WHERE i = 1) AS nb, count(*) FILTER (WHERE i = 1) AS n
     FROM ${tabla} t, generate_series(1, 12) i WHERE ${filtro} GROUP BY i) x`;

const pir = (r: Fila | undefined): Pir | null =>
  r?.h && r.m ? { h: r.h.map(Number), m: r.m.map(Number), nb: Number(r.nb ?? 0) } : null;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const anio = Number(u.searchParams.get("anio") || 0);
  const estado = Number(u.searchParams.get("estado") || 0);
  const municipio = Number(u.searchParams.get("municipio") || 0);
  const distrito = Number(u.searchParams.get("distrito") || 0);
  const seccion = Number(u.searchParams.get("seccion") || 0);

  const cortes = (await q<{ f: string }>("SELECT to_char(fecha_corte,'YYYY-MM-DD') AS f FROM ln_corte WHERE tiene_edad ORDER BY fecha_corte")).map((c) => c.f);
  if (!cortes.length) return NextResponse.json({ error: "Sin cortes con edad" }, { status: 404 });
  const corte = cortes[cortes.length - 1];
  // Corte de la elección: el más cercano ANTERIOR a la jornada (se toma el 30 de junio del año como tope); antes de 2021 no hay edad
  const corteElec = anio ? [...cortes].reverse().find((c) => c <= `${anio}-06-30`) ?? null : null;

  const local = eleccion.startsWith("diputados_locales");
  let nivel: "nacional" | "estado" | "municipio" | "distrito" | "seccion" = "nacional";
  let porSecciones: number[] | null = null; // secciones de la elección que componen el territorio
  if (seccion) { nivel = "seccion"; porSecciones = [seccion]; }
  else if (municipio) nivel = "municipio";
  else if (distrito) {
    nivel = "distrito";
    if (local || eraDistrital(anio) !== eraDistrital(Number(corte.slice(0, 4)))) {
      const col = local ? "id_distrito_local" : "id_distrito_federal";
      porSecciones = (await q<{ s: number }>(
        `SELECT DISTINCT seccion_id AS s FROM sec_resumen WHERE eleccion = $1 AND anio = $2 AND extraordinaria = false AND ${col} = $3 AND seccion_confiable`,
        [eleccion, anio, distrito])).map((x) => x.s);
    }
  } else if (estado) nivel = "estado";

  // Con suma de secciones, la comparación contra la elección usa solo las secciones que están en ambos cortes (si no, el cambio
  // mezclaría el reseccionamiento con el cambio del electorado)
  let comunes: number[] | null = null;
  if (porSecciones && corteElec && corteElec !== corte)
    comunes = (await q<{ s: number }>(
      "SELECT seccion_id AS s FROM ln_edad_seccion WHERE seccion_id = ANY($1::int[]) AND fecha_corte IN ($2, $3) GROUP BY seccion_id HAVING count(*) = 2",
      [porSecciones, corte, corteElec])).map((x) => x.s);

  async function del(f: string, secs = porSecciones): Promise<{ p: Pir | null; n: number | null }> {
    if (secs) {
      const [r] = await q<Fila>(SUMA("ln_edad_seccion", "fecha_corte = $1 AND seccion_id = ANY($2::int[])"), [f, secs]);
      return { p: pir(r), n: r?.n !== undefined && r.n !== null ? Number(r.n) : 0 };
    }
    if (nivel === "nacional") { const [r] = await q<Fila>(SUMA("ln_edad_territorio", "nivel = 'estado' AND fecha_corte = $1"), [f]); return { p: pir(r), n: null }; }
    const clave = nivel === "municipio" ? municipio : nivel === "distrito" ? distrito : estado;
    const [r] = await q<Fila>("SELECT h, m, nb FROM ln_edad_territorio WHERE nivel = $1 AND clave = $2 AND fecha_corte = $3", [nivel, clave, f]);
    return { p: pir(r), n: null };
  }

  const [hoy, hoyComunes, elec, ref, nac] = await Promise.all([
    del(corte),
    comunes ? del(corte, comunes) : Promise.resolve(null),
    // En la elección: solo si su corte es otro y el territorio se mide igual (un distrito federal vigente no existía antes de 2024)
    corteElec && corteElec !== corte && (porSecciones || nivel !== "distrito" || eraDistrital(anio) === eraDistrital(Number(corteElec.slice(0, 4)))) ? del(corteElec, comunes ?? porSecciones) : Promise.resolve(null),
    estado && nivel !== "estado" ? q<Fila>("SELECT h, m, nb FROM ln_edad_territorio WHERE nivel = 'estado' AND clave = $1 AND fecha_corte = $2", [estado, corte]).then((r) => pir(r[0])) : Promise.resolve(null),
    nivel !== "nacional" ? q<Fila>(SUMA("ln_edad_territorio", "nivel = 'estado' AND fecha_corte = $1"), [corte]).then((r) => pir(r[0])) : Promise.resolve(null),
  ]);

  const res = NextResponse.json({
    nivel, corte, corte_eleccion: elec?.p ? corteElec : null, grupos: GRUPOS_EDAD,
    piramide: hoy.p, piramide_eleccion: elec?.p ?? null, estado: ref, nacional: nac,
    // hoy, con las mismas secciones que piramide_eleccion (solo si se armó por secciones); el cambio «desde la elección» se mide contra esto
    piramide_hoy_comparable: hoyComunes?.p ?? null, secciones_comparables: comunes && nivel !== "seccion" ? comunes.length : null,
    // Con suma de secciones: cuántas secciones de la elección tienen lista por edad en el corte (las demás ya no existen o cambiaron)
    secciones: porSecciones && nivel !== "seccion" ? { total: porSecciones.length, con_edad: hoy.n ?? 0 } : null,
  });
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
