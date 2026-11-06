// Convierte la Base Geográfica Digital (BGD) del INE de una entidad a GeoJSON ligeros para la app.
//   bun scripts/geo_entidad.ts "<carpeta con SECCION.shp, MUNICIPIO.shp, DISTRITO_FEDERAL.shp, DISTRITO_LOCAL.shp, ENTIDAD.shp>"
// Escribe public/geo/<id_estado>/{entidad,municipios,distritos_federales,distritos_locales,secciones}.geojson y agrega la
// entidad a public/geo/entidades.json (las que tienen polígonos).
//
// - Los shapefiles del INE vienen en WGS84 UTM (zona en el .prj): se proyectan a longitud/latitud.
// - Se simplifican con Douglas-Peucker en metros (tolerancia por capa) y se redondean a 5 decimales (~1 m).
// - Llaves de la app: seccion_id = id_estado*10000 + sección; id_distrito = id_estado*100 + n; clave_inegi = id_estado*1000 + mun.
//   El municipio del INE es código IFE, NO INEGI: se traduce por nombre contra app_municipio (lee DATABASE_URL de .env).
//   Si un nombre no coincide, el script se detiene y lo dice; no adivina.
// - Se conserva la orientación del shapefile (exterior en sentido horario), que es la que espera d3-geo.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "SECCION.shp"))) { console.error("Uso: bun scripts/geo_entidad.ts <carpeta BGD con SECCION.shp>"); process.exit(1); }

type Anillo = [number, number][];
type Registro = { props: Record<string, string>; anillos: Anillo[] };

function leerDbf(ruta: string): Record<string, string>[] {
  const d = readFileSync(ruta);
  const cpg = ruta.replace(/\.dbf$/i, ".cpg");
  const cod: BufferEncoding = existsSync(cpg) && /utf-?8/i.test(readFileSync(cpg, "utf8")) ? "utf8" : "latin1";
  const n = d.readUInt32LE(4), hl = d.readUInt16LE(8), rl = d.readUInt16LE(10);
  const campos: [string, number][] = [];
  for (let i = 32; d[i] !== 0x0d; i += 32) campos.push([d.subarray(i, i + 11).toString("latin1").replace(/\0.*$/, "").toLowerCase(), d[i + 16]]);
  const filas: Record<string, string>[] = [];
  for (let r = 0; r < n; r++) {
    let o = hl + r * rl + 1; const x: Record<string, string> = {};
    for (const [k, l] of campos) { x[k] = d.subarray(o, o + l).toString(cod).trim(); o += l; }
    filas.push(x);
  }
  return filas;
}

function leerShp(ruta: string): Anillo[][] {
  const d = readFileSync(ruta);
  const out: Anillo[][] = [];
  let o = 100;
  while (o < d.length) {
    const largo = d.readInt32BE(o + 4) * 2; const c = o + 8;
    const tipo = d.readInt32LE(c);
    if (tipo === 0) { out.push([]); o = c + largo; continue; }
    if (tipo !== 5) throw new Error(`Tipo de geometría ${tipo} no soportado en ${ruta}`);
    const nPartes = d.readInt32LE(c + 36), nPuntos = d.readInt32LE(c + 40);
    const partes = Array.from({ length: nPartes }, (_, i) => d.readInt32LE(c + 44 + 4 * i));
    const p0 = c + 44 + 4 * nPartes;
    const anillos: Anillo[] = partes.map((ini, i) => {
      const fin = i + 1 < nPartes ? partes[i + 1] : nPuntos;
      const a: Anillo = [];
      for (let k = ini; k < fin; k++) a.push([d.readDoubleLE(p0 + 16 * k), d.readDoubleLE(p0 + 16 * k + 8)]);
      return a;
    });
    out.push(anillos);
    o = c + largo;
  }
  return out;
}

/** UTM (WGS84, hemisferio norte) → [lon, lat]. Fórmulas inversas de Snyder (1987). */
function utmALonLat(meridiano: number) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const l0 = (meridiano * Math.PI) / 180;
  return ([x, y]: [number, number]): [number, number] => {
    const M = y / k0, mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
    const N1 = a / Math.sqrt(1 - e2 * s * s), T1 = t * t, C1 = ep2 * c * c, R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
    const D = (x - 500000) / (N1 * k0);
    const lat = p1 - ((N1 * t) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = l0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
    return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
  };
}

/** Douglas-Peucker sobre coordenadas en metros. Conserva el primer y último punto (anillo cerrado). */
function simplificar(pts: Anillo, tol: number): Anillo {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const pila: [number, number][] = [[0, pts.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop()!;
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let max = -1, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k];
      const dist = L === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
      if (dist > max) { max = dist; idx = k; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; pila.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

const area = (a: Anillo) => a.reduce((s, [x, y], i) => { const [x2, y2] = a[(i + 1) % a.length]; return s + x * y2 - x2 * y; }, 0) / 2;

function capa(nombre: string, tol: number, minArea: number): Registro[] {
  const filas = leerDbf(join(dir, `${nombre}.dbf`)), geoms = leerShp(join(dir, `${nombre}.shp`));
  const prj = readFileSync(join(dir, `${nombre}.prj`), "utf8");
  const zona = /UTM_Zone_(\d+)N/.exec(prj); const cm = /Central_Meridian",(-?[\d.]+)/.exec(prj);
  if (!zona || !cm) throw new Error(`Proyección no reconocida en ${nombre}.prj (se espera WGS84 UTM norte)`);
  const proy = utmALonLat(Number(cm[1]));
  return filas.map((props, i) => {
    const anillos = geoms[i]
      .map((r) => simplificar(r, tol))
      .filter((r) => r.length >= 4 && Math.abs(area(r)) >= minArea)
      .map((r) => r.map((p) => proy(p).map((v) => Math.round(v * 1e5) / 1e5) as [number, number]));
    return { props, anillos };
  });
}

/** Agrupa anillos en polígonos: cada exterior (horario, área < 0 en x-y) se lleva los huecos que contiene. */
function geometria(anillos: Anillo[]) {
  const ext: Anillo[][] = [];
  for (const r of anillos) {
    if (area(r) <= 0 || !ext.length) ext.push([r]);
    else (ext.find((p) => dentro(r[0], p[0])) ?? ext[ext.length - 1]).push(r);
  }
  return ext.length === 1 ? { type: "Polygon", coordinates: ext[0] } : { type: "MultiPolygon", coordinates: ext };
}
function dentro([x, y]: [number, number], r: Anillo) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const ent = capa("ENTIDAD", 120, 2e5);
const idEstado = Number(ent[0].props.entidad);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const munDb = (await pool.query<{ clave_inegi: number; nombre: string }>("SELECT clave_inegi, nombre FROM app_municipio WHERE clave_inegi / 1000 = $1", [idEstado])).rows;
const [{ nombre_corto }] = (await pool.query<{ nombre_corto: string }>("SELECT nombre_corto FROM app_estado WHERE id_estado = $1", [idEstado])).rows;
await pool.end();
const porNombre = new Map(munDb.map((m) => [norm(m.nombre), m.clave_inegi]));

const municipios = capa("MUNICIPIO", 80, 1e5);
const ifeAInegi = new Map<number, number>();
const faltan: string[] = [];
for (const m of municipios) {
  const c = porNombre.get(norm(m.props.nombre));
  if (c) ifeAInegi.set(Number(m.props.municipio), c); else faltan.push(`${m.props.municipio} ${m.props.nombre}`);
}
if (faltan.length) { console.error("Municipios sin equivalente INEGI por nombre:", faltan.join(", ")); process.exit(1); }

const fc = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
const salida = join(RAIZ, "public", "geo", String(idEstado));
mkdirSync(salida, { recursive: true });
const escribir = (archivo: string, features: unknown[]) => {
  const t = fc(features); writeFileSync(join(salida, archivo), t);
  console.log(`${archivo}: ${features.length} polígonos · ${(t.length / 1024).toFixed(0)} KB`);
};
const feat = (props: object, anillos: Anillo[]) => ({ type: "Feature", properties: props, geometry: geometria(anillos) });

escribir("entidad.geojson", ent.map((r) => feat({ id: idEstado, nombre: nombre_corto }, r.anillos)));
escribir("municipios.geojson", municipios.map((r) => {
  const id = ifeAInegi.get(Number(r.props.municipio))!;
  return feat({ id, nombre: munDb.find((m) => m.clave_inegi === id)!.nombre, ife: Number(r.props.municipio) }, r.anillos);
}));
escribir("distritos_federales.geojson", capa("DISTRITO_FEDERAL", 80, 1e5).map((r) => feat({ id: idEstado * 100 + Number(r.props.distrito_f), n: Number(r.props.distrito_f) }, r.anillos)));
escribir("distritos_locales.geojson", capa("DISTRITO_LOCAL", 80, 1e5).map((r) => feat({ id: idEstado * 100 + Number(r.props.distrito_l), n: Number(r.props.distrito_l) }, r.anillos)));
escribir("secciones.geojson", capa("SECCION", 12, 50).filter((r) => r.anillos.length).map((r) => feat({
  id: idEstado * 10000 + Number(r.props.seccion), seccion: Number(r.props.seccion),
  municipio: ifeAInegi.get(Number(r.props.municipio)) ?? null, df: idEstado * 100 + Number(r.props.distrito_f), dl: idEstado * 100 + Number(r.props.distrito_l),
}, r.anillos)));

// Vigencia de los distritos: la cartografía trae la distritación ACTUAL. Se busca desde qué año las secciones de la base caen
// en el mismo distrito que en el shapefile (≥ 98%); antes de ese año el mapa distrital era otro y esa capa no se dibuja.
const secProps = new Map<number, { df: number; dl: number }>();
for (const r of capa("SECCION", 1e9, 0)) secProps.set(idEstado * 10000 + Number(r.props.seccion), { df: idEstado * 100 + Number(r.props.distrito_f), dl: idEstado * 100 + Number(r.props.distrito_l) });
const pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
async function vigenteDesde(col: "id_distrito_federal" | "id_distrito_local", k: "df" | "dl") {
  const r = (await pool2.query<{ anio: number; seccion_id: string; d: number }>(
    `SELECT DISTINCT anio, seccion_id, ${col} AS d FROM sec_resumen WHERE id_estado = $1 AND extraordinaria = false AND seccion_confiable AND ${col} IS NOT NULL`, [idEstado])).rows;
  const porAnio = new Map<number, [number, number]>();
  for (const x of r) {
    const p = secProps.get(Number(x.seccion_id)); if (!p) continue;
    const c = porAnio.get(x.anio) ?? [0, 0]; c[1]++; if (p[k] === x.d) c[0]++; porAnio.set(x.anio, c);
  }
  let desde: number | null = null;
  for (const a of [...porAnio.keys()].sort((x, y) => y - x)) { const [ok, n] = porAnio.get(a)!; if (ok / n >= 0.98) desde = a; else break; }
  console.log(`${k}: coincidencia por año`, Object.fromEntries([...porAnio].sort((x, y) => x[0] - y[0]).map(([a, [ok, n]]) => [a, `${((100 * ok) / n).toFixed(0)}%`])), "→ vigente desde", desde);
  return desde;
}
const df_desde = await vigenteDesde("id_distrito_federal", "df"), dl_desde = await vigenteDesde("id_distrito_local", "dl");
await pool2.end();

const indice = join(RAIZ, "public", "geo", "entidades.json");
type Ent = { id: number; nombre: string; secciones: number; df_desde: number | null; dl_desde: number | null };
const lista: Ent[] = existsSync(indice) ? JSON.parse(readFileSync(indice, "utf8")) : [];
const nueva: Ent = { id: idEstado, nombre: nombre_corto, secciones: secProps.size, df_desde, dl_desde };
writeFileSync(indice, JSON.stringify([...lista.filter((e) => e.id !== idEstado), nueva].sort((a, b) => a.id - b.id)));
console.log(`Listo: ${nombre_corto} (${idEstado}) en public/geo/${idEstado}/`);
