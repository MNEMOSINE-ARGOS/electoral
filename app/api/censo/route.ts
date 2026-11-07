import { NextResponse } from "next/server";
import { CAMPOS_CENSO, INDICADORES, valor } from "@/lib/censo";
import { seccionesCenso, resumenCenso, resumenNacional, r1 } from "@/lib/censoDatos";
import { origenes } from "@/lib/historico";
import { q } from "@/lib/db";

// Censo 2020 por sección (ECEG 2020; data/censo2020, ver scripts/censo_secciones.ts). ?estado=5
// Devuelve, por seccion_id, los indicadores de lib/censo.ts (en el orden de INDICADORES, 1 decimal) y la población; el valor del estado y del país
// (suma de conteos); y, para las secciones nacidas después de enero de 2021, de qué sección del censo vienen (genealogía del INE).
export async function GET(req: Request) {
  const estado = Number(new URL(req.url).searchParams.get("estado"));
  if (!(estado >= 1 && estado <= 32)) return NextResponse.json({ error: "Falta estado (1 a 32)" }, { status: 400 });
  const ss = await seccionesCenso(estado);
  const secciones: Record<number, { pob: number | null; v: (number | null)[] }> = {};
  for (const s of ss) secciones[s.id] = { pob: s.f.POBTOT ?? null, v: INDICADORES.map((ind) => r1(valor(ind, s.f))) };
  // Secciones posteriores al marco del censo: su origen (siguiendo divisiones) que sí está en el censo
  const enCenso = new Set(ss.map((s) => s.id));
  const origen = (s: number): number | null => {
    for (let x = s, n = 0; n < 6; n++) {
      const o = origenes(x).find((y) => y.t === "division"); if (!o) return null;
      if (enCenso.has(o.o)) return o.o; x = o.o;
    }
    return null;
  };
  const nuevas = (await q<{ s: string }>("SELECT DISTINCT seccion_id AS s FROM sec_resumen WHERE id_estado = $1 AND anio >= 2021 AND seccion_confiable", [estado]))
    .map((x) => Number(x.s)).filter((x) => !enCenso.has(x));
  const est = resumenCenso(ss.map((s) => s.f));
  const res = NextResponse.json({
    fuente: "INEGI-INE, Estadísticas Censales a Escalas Geoelectorales 2020 (Censo 2020; marco seccional del INE de enero de 2021)",
    campos: CAMPOS_CENSO.length, indicadores: INDICADORES.map((x) => x.k), secciones,
    estado: est.valores, poblacion_estado: est.poblacion,
    nacional: (await resumenNacional()).valores,
    origen_de: Object.fromEntries(nuevas.map((s) => [s, origen(s)]).filter(([, o]) => o !== null)),
  });
  res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
}
