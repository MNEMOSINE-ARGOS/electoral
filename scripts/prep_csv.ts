// Convierte un CSV del PREP (formato INE/OPLE: resultados por acta) en un archivo de la app: data/prep/<estado>_<eleccion>_<anio>.json
//   bun scripts/prep_csv.ts "<RESULTADOS.csv>" ["<CANDIDATURAS.csv>"] [--eleccion=diputados_locales_mr]
// Después hay que registrarlo en lib/prep.ts (una línea de import). La app lo muestra como PREP, preliminar, nunca como cómputo.
//
// Reglas (verificadas contra el encabezado del propio CSV, que trae los totales del PREP):
// - Solo actas CONTABILIZADA = 1, como el PREP. Las no contabilizadas (ilegibles, exceden lista, sin bolsa) se cuentan aparte.
// - Mayoría relativa: actas ordinarias (TIPO_ACTA 2) + especiales de MR (2EMR) + las de casillas sin sección (tipo 1: A, P…).
//   Las especiales de representación proporcional (2ERP) NO entran: son otra boleta.
// - Actas con SECCION = N/A (voto anticipado «A», prisión preventiva «P»…) cuentan en su distrito, no en una sección ni municipio.
// - Coaliciones: la columna C_PRI_UDC es la fila de coalición «pri-udc» (no se reparte); siempre se guarda, aunque valga 0,
//   para que porCandidatura sume a sus partidos. Independientes CAND_IND_XXX → «ind_xxx».
// - El municipio de cada sección sale de la cartografía del INE (public/geo/<estado>/secciones.geojson); el CSV no lo trae.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
if (!args[0]) { console.error("Uso: bun scripts/prep_csv.ts <RESULTADOS.csv> [CANDIDATURAS.csv] [--eleccion=diputados_locales_mr]"); process.exit(1); }

function filaCsv(linea: string) {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (q) { if (c === '"' && linea[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}
const leer = (ruta: string) => readFileSync(ruta, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
const num = (x: string | undefined) => (!x || x === "N/A" || x === "-" ? 0 : Number(x));
const sigla = (col: string) => col.startsWith("C_") ? col.slice(2).toLowerCase().replace(/_/g, "-") : col.startsWith("CAND_IND_") ? `ind_${col.slice(9).toLowerCase()}` : col.toLowerCase();

const lineas = leer(args[0]);
const titulo = lineas[0].replace(/"/g, "");
const corte = lineas[1].replace(/"/g, "");
const iRes = lineas.findIndex((l) => l.startsWith("ACTAS_ESPERADAS"));
const resumen = Object.fromEntries(filaCsv(lineas[iRes]).map((k, i) => [k, filaCsv(lineas[iRes + 1])[i]]));
const iCab = lineas.findIndex((l) => l.startsWith("CLAVE_CASILLA"));
const cab = filaCsv(lineas[iCab]);
const actas = lineas.slice(iCab + 1).map(filaCsv).map((v) => Object.fromEntries(cab.map((k, i) => [k, v[i] ?? ""])));
const cols = cab.slice(cab.indexOf("TOTAL_VOTOS_SACADOS") + 1, cab.indexOf("NO_REGISTRADAS"));
const coaliciones = cols.filter((c) => c.startsWith("C_")).map(sigla);

const estado = Number(actas[0].ID_ENTIDAD);
const anio = Number(/\d{2}\/\d{2}\/(\d{4})/.exec(corte)?.[1]);
const eleccion = opt.eleccion ?? (/DIPUTACIONES LOCALES/i.test(titulo) ? "diputados_locales_mr" : /AYUNTAMIENTO|PRESIDENCIAS MUNICIPALES/i.test(titulo) ? "alcaldes" : /GUBERNATURA/i.test(titulo) ? "gobernador" : "");
if (!eleccion || !anio || !estado) { console.error("No se reconoció la elección, el año o la entidad; usa --eleccion=…"); process.exit(1); }

// Total del encabezado del PREP = suma de todas las actas contabilizadas (MR + RP especiales): se comprueba antes de seguir
const contab = actas.filter((a) => a.CONTABILIZADA === "1");
const sumaTodas = contab.reduce((s, a) => s + num(a.TOTAL_VOTOS_CALCULADO), 0);
if (resumen.TOTAL_VOTOS_C_CS && sumaTodas !== Number(resumen.TOTAL_VOTOS_C_CS)) {
  console.error(`La suma de actas contabilizadas (${sumaTodas}) no coincide con TOTAL_VOTOS_C_CS del encabezado (${resumen.TOTAL_VOTOS_C_CS}).`); process.exit(1);
}

type Acum = { vt: number; ln: number; actas: number; nulos: number; nr: number; p: Record<string, number> };
const nuevo = (): Acum => ({ vt: 0, ln: 0, actas: 0, nulos: 0, nr: 0, p: Object.fromEntries(coaliciones.map((c) => [c, 0])) });
const sumar = (a: Acum, r: Record<string, string>) => {
  a.vt += num(r.TOTAL_VOTOS_CALCULADO); a.ln += num(r.LISTA_NOMINAL); a.actas++; a.nulos += num(r.NULOS); a.nr += num(r.NO_REGISTRADAS);
  for (const c of cols) { const v = num(r[c]); if (v) a.p[sigla(c)] = (a.p[sigla(c)] ?? 0) + v; }
};

const geoRuta = join(RAIZ, "public", "geo", String(estado), "secciones.geojson");
const geoDe = new Map<number, { municipio: number; df: number; dl: number }>();
if (existsSync(geoRuta)) for (const f of JSON.parse(readFileSync(geoRuta, "utf8")).features) geoDe.set(f.properties.id, f.properties);
const munDe = new Map([...geoDe].map(([k, v]) => [k, v.municipio]));

const secc = new Map<number, Acum>(), dist = new Map<number, Acum>(), mun = new Map<number, Acum>();
let sinSeccion = 0, sinMunicipio = 0;
const mr = contab.filter((a) => a.TIPO_ACTA !== "2ERP");
for (const a of mr) {
  const d = estado * 100 + Number(a.ID_DISTRITO_LOCAL);
  if (!dist.has(d)) dist.set(d, nuevo()); sumar(dist.get(d)!, a);
  if (a.SECCION === "N/A" || !a.SECCION) { sinSeccion++; continue; }
  const s = estado * 10000 + Number(a.SECCION);
  if (!secc.has(s)) secc.set(s, nuevo()); sumar(secc.get(s)!, a);
  const m = munDe.get(s);
  if (m === undefined) { sinMunicipio++; continue; }
  if (!mun.has(m)) mun.set(m, nuevo()); sumar(mun.get(m)!, a);
}
// Distrito de cada sección según el PREP (para comparar con la cartografía)
const distDeSeccion = new Map<number, number>();
for (const a of mr) if (a.SECCION !== "N/A" && a.SECCION) distDeSeccion.set(estado * 10000 + Number(a.SECCION), estado * 100 + Number(a.ID_DISTRITO_LOCAL));

const candidaturas: Record<number, Record<string, string>> = {};
if (args[1]) {
  const l = leer(args[1]); const h = filaCsv(l[0]);
  for (const v of l.slice(1).map(filaCsv)) {
    const r = Object.fromEntries(h.map((k, i) => [k, v[i]]));
    const d = estado * 100 + Number(r.ID_DISTRITO_LOCAL);
    (candidaturas[d] ??= {})[sigla(r.PARTIDO_CI)] = r.CANDIDATURA_PROPIETARIA;
  }
}

const filas = (m: Map<number, Acum>, extra?: (id: number) => object) => [...m].sort((a, b) => a[0] - b[0]).map(([id, a]) => ({ id, vt: a.vt, ln: a.ln, actas: a.actas, nulos: a.nulos, nr: a.nr, p: a.p, ...extra?.(id) }));
const salida = {
  fuente: "prep", eleccion, anio, estado, titulo, corte,
  resumen: {
    actas_esperadas: num(resumen.ACTAS_ESPERADAS), actas_contabilizadas: num(resumen.ACTAS_CONTABILIZADAS), pct_actas: Number(resumen.PORCENTAJE_ACTAS_CONTABILIZADAS),
    votos_con_especiales: num(resumen.TOTAL_VOTOS_C_CS), votos_sin_especiales: num(resumen.TOTAL_VOTOS_S_CS), lista_nominal: num(resumen.LISTA_NOMINAL_ACTAS_CONTABILIZADAS),
    participacion: Number(resumen.PORCENTAJE_PARTICIPACION_CIUDADANA),
    votos_mr: mr.reduce((s, a) => s + num(a.TOTAL_VOTOS_CALCULADO), 0), actas_mr: mr.length, actas_sin_seccion: sinSeccion,
    no_contabilizadas: Object.entries(actas.filter((a) => a.CONTABILIZADA !== "1").reduce((o: Record<string, number>, a) => { const k = a.OBSERVACIONES || "sin observación"; o[k] = (o[k] ?? 0) + 1; return o; }, {})),
  },
  candidaturas,
  distritos: filas(dist),
  municipios: filas(mun),
  secciones: filas(secc, (id) => ({ dl: distDeSeccion.get(id), m: geoDe.get(id)?.municipio ?? null, df: geoDe.get(id)?.df ?? null })),
};
const dir = join(RAIZ, "data", "prep"); mkdirSync(dir, { recursive: true });
const archivo = `${estado}_${eleccion}_${anio}.json`;
writeFileSync(join(dir, archivo), JSON.stringify(salida));
console.log(`${titulo} · ${corte}`);
console.log(`Actas: ${mr.length} de MR contabilizadas (${sinSeccion} sin sección) · votos MR ${salida.resumen.votos_mr.toLocaleString("es-MX")} · total PREP con especiales ${sumaTodas.toLocaleString("es-MX")} (= encabezado)`);
console.log(`${dist.size} distritos · ${mun.size} municipios · ${secc.size} secciones (${sinMunicipio} actas de secciones sin municipio en la cartografía)`);
const difDl = [...distDeSeccion].filter(([s, d]) => geoDe.has(s) && geoDe.get(s)!.dl !== d).length;
console.log(`Distrito local del PREP vs cartografía: ${distDeSeccion.size - difDl} de ${distDeSeccion.size} secciones coinciden`);
console.log(`Escrito data/prep/${archivo}. Regístralo en lib/prep.ts si es nuevo.`);
