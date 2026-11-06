import { NextResponse } from "next/server";
import { CAMPOS_CENSO, INDICADORES, valor, valorTerritorio, type FilaCenso } from "@/lib/censo";
import { origenes } from "@/lib/historico";
import { q } from "@/lib/db";

// Censo 2020 por sección (ECEG 2020; data/censo2020, ver scripts/censo_secciones.ts). ?estado=5
// Devuelve, por seccion_id, los indicadores de lib/censo.ts (en el orden de INDICADORES, 1 decimal) y la población; el valor del estado y del país
// (suma de conteos); y, para las secciones nacidas después de enero de 2021, de qué sección del censo vienen (genealogía del INE).
type Archivo = { fuente: string; campos: string[]; s: Record<string, (number | null)[]> };

async function filas(e: number): Promise<{ ids: number[]; fs: FilaCenso[] }> {
  const a = (await import(`@/data/censo2020/${e}.json`)).default as Archivo;
  const ids: number[] = [], fs: FilaCenso[] = [];
  for (const [sec, v] of Object.entries(a.s)) {
    const f: FilaCenso = {};
    a.campos.forEach((k, i) => { f[k as keyof FilaCenso] = v[i]; });
    ids.push(e * 10000 + Number(sec)); fs.push(f);
  }
  return { ids, fs };
}

let nacional: (number | null)[] | null = null;
async function valoresNacionales() {
  if (nacional) return nacional;
  const todas: FilaCenso[] = [];
  for (let e = 1; e <= 32; e++) todas.push(...(await filas(e)).fs);
  nacional = INDICADORES.map((ind) => r1(valorTerritorio(ind, todas)));
  return nacional;
}
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

export async function GET(req: Request) {
  const estado = Number(new URL(req.url).searchParams.get("estado"));
  if (!(estado >= 1 && estado <= 32)) return NextResponse.json({ error: "Falta estado (1 a 32)" }, { status: 400 });
  const { ids, fs } = await filas(estado);
  const secciones: Record<number, { pob: number | null; v: (number | null)[] }> = {};
  ids.forEach((id, i) => { secciones[id] = { pob: fs[i].POBTOT ?? null, v: INDICADORES.map((ind) => r1(valor(ind, fs[i]))) }; });
  // Secciones posteriores al marco del censo: su origen (siguiendo divisiones) que sí está en el censo
  const enCenso = new Set(ids);
  const origen = (s: number): number | null => {
    for (let x = s, n = 0; n < 6; n++) {
      const o = origenes(x).find((y) => y.t === "division"); if (!o) return null;
      if (enCenso.has(o.o)) return o.o; x = o.o;
    }
    return null;
  };
  const nuevas = (await q<{ s: string }>("SELECT DISTINCT seccion_id AS s FROM sec_resumen WHERE id_estado = $1 AND anio >= 2021 AND seccion_confiable", [estado]))
    .map((x) => Number(x.s)).filter((x) => !enCenso.has(x));
  const res = NextResponse.json({
    fuente: "INEGI-INE, Estadísticas Censales a Escalas Geoelectorales 2020 (Censo 2020; marco seccional del INE de enero de 2021)",
    campos: CAMPOS_CENSO.length, indicadores: INDICADORES.map((x) => x.k), secciones,
    estado: INDICADORES.map((ind) => r1(valorTerritorio(ind, fs))), poblacion_estado: fs.reduce((a, f) => a + (f.POBTOT ?? 0), 0),
    nacional: await valoresNacionales(),
    origen_de: Object.fromEntries(nuevas.map((s) => [s, origen(s)]).filter(([, o]) => o !== null)),
  });
  res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
}
