// Cifras de verificación de CLAUDE.md §8, en un solo comando: bun scripts/verificar.ts
// Cada prueba consulta la base (DATABASE_URL de .env) o llama al mismo manejador de API que usa la app, y compara contra el valor esperado.
// Sale con código 1 si alguna falla. Si cambia una cifra a propósito (p. ej. el pipeline recarga una elección), actualiza aquí y en CLAUDE.md.
import { q, pool } from "../lib/db";
import { resultados } from "../lib/consultas";
import { serieReconstruida } from "../lib/reconstruccion";
import { resumenNacional, seccionesCenso } from "../lib/censoDatos";
import historico from "../data/historico_secciones.json";
import { GET as apiUnidades } from "../app/api/unidades/route";
import { GET as apiMapa } from "../app/api/mapa/route";
import { GET as apiEdad } from "../app/api/perfil-edad/route";
import { GET as apiCensoTerr } from "../app/api/censo-territorio/route";

type Prueba = { nombre: string; esperado: string; obtener: () => Promise<string> };
const json = async <T,>(h: (r: Request) => Promise<Response>, url: string) => (await (await h(new Request(`http://local${url}`))).json()) as T;
const n = (x: number) => x.toLocaleString("es-MX");
const sumaPir = (p: { h: number[]; m: number[]; nb: number } | null) => (p ? p.h.reduce((a, b) => a + b, 0) + p.m.reduce((a, b) => a + b, 0) + p.nb : 0);
type U = { id: number; ganador: string | null; votos_totales: number | null; margen_enfoque: number | null };

const PRUEBAS: Prueba[] = [
  { nombre: "Presidencia 2024, nacional: votos y participación", esperado: "60,115,184 · 61.1%", obtener: async () => {
    const [r] = (await resultados("presidente", { nivel: "nacional", id: 0 }, 2024)).filter((x) => !x.extraordinaria);
    return `${n(r.votos_totales!)} · ${((100 * r.votos_totales!) / r.lista_nominal!).toFixed(1)}%`;
  } },
  { nombre: "Diputaciones federales 2024: distritos ganados desde Morena, PAN y MC", esperado: "256 · 42 · 1", obtener: async () => {
    const gana = async (e: string) => (await json<{ unidades: U[] }>(apiUnidades, `/api/unidades?cargo=diputados_federales&anio=2024&enfoque=${e}`)).unidades.filter((u) => (u.margen_enfoque ?? -1) > 0).length;
    return `${await gana("morena")} · ${await gana("pan")} · ${await gana("mc")}`;
  } },
  { nombre: "Distritos federales suman el total del estado (2018 y 2024), estados que no cuadran", esperado: "0", obtener: async () => {
    const r = await q<{ n: string }>(`SELECT count(*) n FROM (
      SELECT d.anio, d.id_estado, sum(d.votos_totales) dv, max(e.votos_totales) ev FROM agg_dis_totales d
      JOIN (SELECT anio, id_estado, sum(votos_totales) votos_totales FROM agg_est_totales WHERE eleccion='diputados_federales' AND extraordinaria=false GROUP BY 1,2) e USING (anio, id_estado)
      WHERE d.eleccion='diputados_federales' AND d.tipo='federal' AND d.extraordinaria=false AND d.anio IN (2018, 2024) GROUP BY 1,2) x WHERE dv <> ev`);
    return r[0].n;
  } },
  { nombre: "Tendencia nacional: sigue · parcial · independiente · sin datos", esperado: "15,506 · 40,836 · 13,623 · 2,930", obtener: async () => {
    const r = await q<{ v: string; c: string }>("SELECT veredicto v, count(*) c FROM app_sec_tendencia GROUP BY 1");
    const c = (k: string) => n(Number(r.find((x) => x.v === k)?.c ?? 0));
    return `${c("sigue")} · ${c("parcial")} · ${c("independiente")} · ${c("sin_datos")}`;
  } },
  { nombre: "Sección 50338: votos propios de Morena, presidencia 2018 y 2024", esperado: "358 · 500", obtener: async () => {
    const r = await q<{ anio: number; v: string }>(`SELECT s.anio, v.votos v FROM sec_resumen s JOIN sec_votos v USING (totales_id) JOIN app_partido_codigo c ON c.codigo = v.partido
      WHERE s.seccion_id = 50338 AND s.eleccion = 'presidente' AND s.extraordinaria = false AND s.anio IN (2018, 2024) AND c.partido = 'morena' ORDER BY s.anio`);
    return r.map((x) => n(Number(x.v))).join(" · ");
  } },
  { nombre: "Judicial 2025: votos por candidatura", esperado: "486,063,196", obtener: async () => n(Number((await q<{ v: string }>("SELECT sum(votos) v FROM jud_candidatura"))[0].v)) },
  { nombre: "Mapa de Coahuila, presidencia 2024: votos por sección = por distrito · distritos · secciones", esperado: "1,585,389 = 1,585,389 · 8 · 1,777", obtener: async () => {
    const s = (await json<{ unidades: U[] }>(apiMapa, "/api/mapa?eleccion=presidente&anio=2024&estado=5&nivel=seccion")).unidades;
    const d = (await json<{ unidades: U[] }>(apiMapa, "/api/mapa?eleccion=presidente&anio=2024&estado=5&nivel=distrito")).unidades;
    const t = (us: U[]) => n(us.reduce((a, u) => a + (u.votos_totales ?? 0), 0));
    return `${t(s)} = ${t(d)} · ${d.length} · ${n(s.length)}`;
  } },
  { nombre: "Coahuila, diputaciones locales 2026 (PREP): entidad (con actas sin sección) · distritos ganados por PRI-UDC · distritos = secciones · Torreón", esperado: "1,244,124 · 16 de 16 · 1,242,559 = 1,242,559 · 288,388", obtener: async () => {
    const [ent] = (await resultados("diputados_locales_mr", { nivel: "estado", id: 5 }, 2026)).filter((x) => !x.extraordinaria);
    const d = (await json<{ unidades: U[] }>(apiMapa, "/api/mapa?eleccion=diputados_locales_mr&anio=2026&estado=5&nivel=distrito_local")).unidades;
    const s = (await json<{ unidades: U[] }>(apiMapa, "/api/mapa?eleccion=diputados_locales_mr&anio=2026&estado=5&nivel=seccion")).unidades;
    const m = (await json<{ unidades: U[] }>(apiMapa, "/api/mapa?eleccion=diputados_locales_mr&anio=2026&estado=5&nivel=municipio")).unidades.find((u) => u.id === 5035);
    const t = (us: U[]) => n(us.reduce((a, u) => a + (u.votos_totales ?? 0), 0));
    return `${n(ent.votos_totales ?? 0)} · ${d.filter((u) => u.ganador === "pri-udc").length} de ${d.length} · ${t(d)} = ${t(s)} · ${n(m?.votos_totales ?? 0)}`;
  } },
  { nombre: "Reconstrucción distrital: Coahuila 506, diputaciones federales 2021", esperado: "150,248 (134,908 + 15,340; 0 sin asignar)", obtener: async () => {
    const [r] = await serieReconstruida("diputados_federales", 506, 2024, [2021]);
    return `${n(r.votos_totales ?? 0)} (${n(r.cobertura.exactos)} + ${n(r.cobertura.por_historico)}; ${n(r.cobertura.dudosos)} sin asignar)`;
  } },
  { nombre: "Genealogía de secciones: divisiones · fusiones · parciales", esperado: "1,484 · 1,128 · 349", obtener: async () => {
    const c = { division: 0, fusion: 0, parcial: 0 } as Record<string, number>;
    for (const as of Object.values(historico as unknown as Record<string, [number, number[], string][]>)) for (const a of as) c[a[2]]++;
    return `${n(c.division)} · ${n(c.fusion)} · ${n(c.parcial)}`;
  } },
  { nombre: "Electorado por edad, corte 2026-10-22: país · Coahuila", esperado: "101,728,768 · 2,501,241", obtener: async () => {
    type E = { corte: string; piramide: { h: number[]; m: number[]; nb: number } | null; estado: { h: number[]; m: number[]; nb: number } | null };
    const p = await json<E>(apiEdad, "/api/perfil-edad?eleccion=presidente&anio=2024&estado=5&municipio=5035");
    const e = await json<E>(apiEdad, "/api/perfil-edad?eleccion=presidente&anio=2024&estado=5");
    if (p.corte !== "2026-10-22") return `corte ${p.corte}`;
    const nac = await json<E>(apiEdad, "/api/perfil-edad?eleccion=presidente&anio=2024");
    return `${n(sumaPir(nac.piramide))} · ${n(sumaPir(e.piramide))}`;
  } },
  { nombre: "Censo 2020 por sección: población del país · estados que no cuadran con el Censo · Torreón", esperado: "126,014,024 · 0 · 720,834", obtener: async () => {
    const OFICIAL = [1425607, 3769020, 798447, 928363, 3146771, 731391, 5543828, 3741869, 9209944, 1832650, 6166934, 3540685, 3082841, 8348151, 16992418, 4748846,
      1971520, 1235456, 5784442, 4132148, 6583278, 2368467, 1857985, 2822255, 3026943, 2944840, 2402598, 3527735, 1342977, 8062579, 2320898, 1622138];
    let mal = 0;
    for (let e = 1; e <= 32; e++) { const s = (await seccionesCenso(e)).reduce((a, x) => a + (x.f.POBTOT ?? 0), 0); if (s !== OFICIAL[e - 1]) mal++; }
    const t = await json<{ territorio: { poblacion: number } }>(apiCensoTerr, "/api/censo-territorio?estado=5&municipio=5035");
    return `${n((await resumenNacional()).poblacion ?? 0)} · ${mal} · ${n(t.territorio.poblacion)}`;
  } },
];

let fallas = 0;
const t0 = Date.now();
for (const p of PRUEBAS) {
  let obtenido: string;
  try { obtenido = await p.obtener(); } catch (e) { obtenido = `ERROR: ${(e as Error).message}`; }
  const ok = obtenido === p.esperado;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${p.nombre}\n    ${ok ? obtenido : `esperado ${p.esperado}\n    obtenido ${obtenido}`}`);
}
console.log(`\n${PRUEBAS.length - fallas} de ${PRUEBAS.length} pruebas pasan · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await pool().end();
process.exit(fallas ? 1 : 0);
