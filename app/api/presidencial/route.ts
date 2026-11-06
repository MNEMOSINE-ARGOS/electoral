import { NextResponse } from "next/server";
import { resultados, type Territorio } from "@/lib/consultas";
import { q } from "@/lib/db";
import { eraDistrital } from "@/lib/analisis";

// Serie de UN cargo en un territorio: una entrada por AÑO (nunca se acumulan años).
// ?eleccion=presidente&estado=0|id&municipio=clave&distrito=id_distrito[&anio_ref=2024]
// Con distrito, solo se devuelven elecciones del mismo mapa distrital que anio_ref (distrito federal) o todas (distrito local, con aviso).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const eleccion = u.searchParams.get("eleccion") || "presidente";
  const estado = Number(u.searchParams.get("estado") || 0);
  const municipio = Number(u.searchParams.get("municipio") || 0);
  const distrito = Number(u.searchParams.get("distrito") || 0);
  const seccion = Number(u.searchParams.get("seccion") || 0);
  if (seccion) {
    // Una sección: cada elección del cargo por separado. Aviso: la sección puede cambiar entre años (reseccionamiento).
    const tots = await q<{ totales_id: string; anio: number; votos_totales: string | null; lista_nominal: string | null; confianza: string | null; fuente: string }>(
      "SELECT totales_id, anio, votos_totales, lista_nominal, confianza, fuente FROM sec_resumen WHERE seccion_id = $1 AND eleccion = $2 AND extraordinaria = false ORDER BY anio", [seccion, eleccion]);
    const vs = tots.length ? await q<{ totales_id: number | string; partido: string; votos: string }>(
      "SELECT v.totales_id, c.partido, v.votos FROM sec_votos v JOIN app_partido_codigo c ON c.codigo = v.partido WHERE v.totales_id = ANY($1::bigint[])", [tots.map((t) => t.totales_id)]) : [];
    const elecciones = tots.map((t) => ({
      anio: t.anio, extraordinaria: false, fuentes: [t.fuente], confianza: t.confianza, votos_totales: t.votos_totales ? Number(t.votos_totales) : null, nulos: null, no_registrados: null,
      lista_nominal: t.lista_nominal ? Number(t.lista_nominal) : null, secciones: 1,
      partidos: Object.fromEntries(vs.filter((v) => String(v.totales_id) === String(t.totales_id)).map((v) => [v.partido, Number(v.votos)])),
    }));
    return NextResponse.json({ eleccion, territorio: { nivel: "seccion", id: seccion }, elecciones, aviso: "La sección puede haber cambiado de geografía entre años (reseccionamiento)." });
  }
  if (distrito) {
    const local = eleccion.startsWith("diputados_locales");
    let ref = Number(u.searchParams.get("anio_ref") || 0);
    const tots = await q<{ anio: number; votos_totales: string | null; lista_nominal: string | null; secciones: string; confianza: string | null; fuente: string }>(
      "SELECT anio, votos_totales, lista_nominal, secciones, confianza, fuente FROM agg_dis_totales WHERE eleccion=$1 AND id_distrito=$2 AND extraordinaria=false ORDER BY anio", [eleccion, distrito]);
    if (!ref && tots.length) ref = tots[tots.length - 1].anio; // sin año de referencia: el mapa distrital más reciente
    const vs = await q<{ anio: number; partido: string; votos: string }>("SELECT anio, partido, votos FROM agg_dis_votos WHERE eleccion=$1 AND id_distrito=$2 AND extraordinaria=false", [eleccion, distrito]);
    const elecciones = tots.filter((t) => local || !ref || eraDistrital(t.anio) === eraDistrital(ref)).map((t) => ({
      anio: t.anio, extraordinaria: false, fuentes: [t.fuente], confianza: t.confianza, votos_totales: t.votos_totales ? Number(t.votos_totales) : null, nulos: null, no_registrados: null,
      lista_nominal: t.lista_nominal ? Number(t.lista_nominal) : null, secciones: Number(t.secciones),
      partidos: Object.fromEntries(vs.filter((v) => v.anio === t.anio).map((v) => [v.partido, Number(v.votos)])),
    }));
    return NextResponse.json({ eleccion, territorio: { nivel: "distrito", id: distrito }, elecciones,
      aviso: local ? "Distrito local: la serie no se verificó como comparable entre redistritaciones." : "Solo elecciones con el mismo mapa distrital." });
  }
  const t: Territorio = municipio ? { nivel: "municipio", id: municipio } : estado ? { nivel: "estado", id: estado } : { nivel: "nacional", id: 0 };
  const elecciones = await resultados(eleccion, t);
  return NextResponse.json({ eleccion, territorio: t, elecciones });
}
