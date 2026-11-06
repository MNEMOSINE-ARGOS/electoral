// Censo 2020 por sección electoral: «Estadísticas Censales a Escalas Geoelectorales» (ECEG 2020, INEGI con cartografía del INE de enero de 2021)
// → data/censo2020/<id_estado>.json (solo las columnas que usa lib/censo.ts, en conteos crudos; los porcentajes se calculan en la app).
//
//   bun scripts/censo_secciones.ts [carpeta de descarga] [--entidad 5,19]
//
// Fuente: https://cartografia.ine.mx/sige8/estadisticos-Geoelectorales (lista: https://cartografia.ine.mx/sige8/api/estadisticos?producto=ECEG&corte=2020;
// archivos en https://cartografia.ine.mx/mapoteca/estadisticos/ECEG/2020/). Un Excel por entidad, una hoja, una fila por sección, 224 indicadores
// con las claves del INEGI (POBTOT, GRAPROES, VPH_INTER…). Los valores protegidos por confidencialidad («*», «N/D») quedan como null: no son 0.
// Se comprueba que la suma de POBTOT de las secciones dé la población del estado del Censo 2020 (CENSO_2020 abajo) y que no haya secciones repetidas.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { inflateRawSync } from "zlib";
import { tmpdir } from "os";
import { CAMPOS_CENSO } from "../lib/censo";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const i = args.indexOf("--entidad");
const SOLO = i >= 0 ? args[i + 1].split(",").map(Number) : null;
const carpeta = args.find((a, k) => !a.startsWith("--") && args[k - 1] !== "--entidad") ?? join(tmpdir(), "censo2020_ine");
mkdirSync(carpeta, { recursive: true });

// Población total por entidad, Censo de Población y Vivienda 2020 (INEGI, tabulados básicos)
const CENSO_2020: Record<number, number> = {
  1: 1425607, 2: 3769020, 3: 798447, 4: 928363, 5: 3146771, 6: 731391, 7: 5543828, 8: 3741869, 9: 9209944, 10: 1832650, 11: 6166934,
  12: 3540685, 13: 3082841, 14: 8348151, 15: 16992418, 16: 4748846, 17: 1971520, 18: 1235456, 19: 5784442, 20: 4132148, 21: 6583278,
  22: 2368467, 23: 1857985, 24: 2822255, 25: 3026943, 26: 2944840, 27: 2402598, 28: 3527735, 29: 1342977, 30: 8062579, 31: 2320898, 32: 1622138,
};

/** Lee un .xlsx (zip) sin dependencias: directorio central → entradas → inflate. */
function leerZip(buf: Buffer) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10), dir = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0, p = dir; k < n; k++) {
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), nombre = buf.subarray(p + 46, p + 46 + ln).toString("utf8");
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(ini, ini + comp);
    out.set(nombre, metodo === 8 ? inflateRawSync(datos) : datos);
    p += 46 + ln + le + lc;
  }
  return out;
}

const desc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function leerHoja(xlsx: Buffer): string[][] {
  const z = leerZip(xlsx);
  const ss = z.has("xl/sharedStrings.xml")
    ? [...z.get("xl/sharedStrings.xml")!.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desc(m[1].replace(/<[^>]+>/g, "")))
    : [];
  const hoja = [...z.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))!;
  const filas: string[][] = [];
  for (const r of z.get(hoja)!.toString("utf8").matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const fila: string[] = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      let col = 0; for (const ch of c[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      const v = /<v>([^<]*)<\/v>/.exec(c[3] ?? "")?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(c[3] ?? "")?.[1] ?? "";
      fila[col - 1] = /t="s"/.test(c[2]) ? ss[Number(v)] : desc(v);
    }
    filas.push(fila);
  }
  return filas;
}

const lista = (await (await fetch("https://cartografia.ine.mx/sige8/api/estadisticos?producto=ECEG&corte=2020")).json()) as { path: string; archivo: string }[];
mkdirSync(join(RAIZ, "data", "censo2020"), { recursive: true });
const resumen: string[] = [];
for (const f of lista.sort((a, b) => a.archivo.localeCompare(b.archivo))) {
  const e = Number(/ECEG (\d+)/.exec(f.archivo)?.[1]);
  if (!e || (SOLO && !SOLO.includes(e))) continue;
  const local = join(carpeta, f.archivo);
  if (!existsSync(local)) {
    const r = await fetch(`https://cartografia.ine.mx/mapoteca/${f.path}${encodeURIComponent(f.archivo)}`);
    if (!r.ok) { resumen.push(`${e}: no se pudo descargar (${r.status})`); continue; }
    writeFileSync(local, Buffer.from(await r.arrayBuffer()));
  }
  const [enc, ...filas] = leerHoja(readFileSync(local));
  const col = (k: string) => enc.indexOf(k);
  const faltan = ["ENTIDAD", "SECCION", ...CAMPOS_CENSO].filter((k) => col(k) < 0);
  if (faltan.length) { resumen.push(`${e}: faltan columnas ${faltan.join(", ")}`); continue; }
  const s: Record<string, (number | null)[]> = {};
  let pob = 0, nulos = 0, repetidas = 0;
  for (const x of filas) {
    if (!x[col("SECCION")] || Number(x[col("ENTIDAD")]) !== e) continue;
    const sec = String(Number(x[col("SECCION")]));
    if (s[sec]) repetidas++;
    s[sec] = CAMPOS_CENSO.map((k) => { const v = x[col(k)]; const n = v === undefined || v === "" || !/^-?[\d.]+$/.test(v.trim()) ? null : Number(v); if (n === null) nulos++; return n; });
    pob += s[sec][0] ?? 0;
  }
  const n = Object.keys(s).length, esperado = CENSO_2020[e];
  const ok = pob === esperado;
  writeFileSync(join(RAIZ, "data", "censo2020", `${e}.json`), JSON.stringify({ fuente: "INEGI-INE, ECEG 2020 (Censo de Población y Vivienda 2020; marco seccional INE de enero de 2021)", campos: CAMPOS_CENSO, s }));
  resumen.push(`${String(e).padStart(2)} ${f.archivo.replace(/^ECEG \d+ |\.xlsx$/g, "")}: ${n} secciones · población ${pob.toLocaleString("es-MX")} ${ok ? "= Censo 2020" : `≠ Censo 2020 (${esperado.toLocaleString("es-MX")}, dif. ${(pob - esperado).toLocaleString("es-MX")})`} · celdas protegidas ${nulos}${repetidas ? ` · ${repetidas} REPETIDAS` : ""}`);
}
console.log(resumen.join("\n"));
