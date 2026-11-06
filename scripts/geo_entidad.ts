// Convierte la cartografía del INE a GeoJSON ligeros para la app, por entidad.
//   bun scripts/geo_entidad.ts "<carpeta con SECCION.shp, MUNICIPIO.shp, DISTRITO_FEDERAL.shp, DISTRITO_LOCAL.shp, ENTIDAD.shp>" [opciones]
//   Sirve la Base Geográfica Digital (BGD) de una entidad o el Marco Geográfico Seccional NACIONAL (todas las entidades en un archivo:
//   https://cartografia.ine.mx/mapoteca/MGS_CCL/SHAPEFILE.7z; la lista sale de https://cartografia.ine.mx/sige8/api/bases/archivosMgsNacional?producto=mgsn&formato=Shapefile).
//   Opciones: --entidad 1,2,3 (solo esas; las rehace aunque existan) · --reemplazar (rehace todas; por defecto se respetan las que ya están).
// Escribe public/geo/<id_estado>/{entidad,municipios,distritos_federales,distritos_locales,secciones}.geojson y agrega cada
// entidad a public/geo/entidades.json (las que tienen polígonos).
//
// - Proyecciones: WGS84 UTM norte (BGD estatal) o Cónica Conforme de Lambert (marco nacional); se pasan a longitud/latitud.
// - Se simplifican con Douglas-Peucker en metros (tolerancia por capa) y se redondean a 5 decimales (~1 m).
// - Llaves de la app: seccion_id = id_estado*10000 + sección; id_distrito = id_estado*100 + n; clave_inegi = id_estado*1000 + mun.
//   El municipio del INE es código IFE, NO INEGI: se traduce por nombre contra app_municipio (lee DATABASE_URL de .env).
//   Si un nombre no coincide, esa entidad NO se escribe y se reporta; no se adivina.
// - Se conserva la orientación del shapefile (exterior en sentido horario), que es la que espera d3-geo.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "SECCION.shp"))) { console.error("Uso: bun scripts/geo_entidad.ts <carpeta con SECCION.shp> [--entidad 1,2] [--reemplazar]"); process.exit(1); }
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const SOLO = arg("--entidad")?.split(",").map(Number);
const REEMPLAZAR = process.argv.includes("--reemplazar");

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

/** Cónica Conforme de Lambert (elipsoide WGS84, dos paralelos) → [lon, lat]. Fórmulas inversas de Snyder (1987), 15-7 a 15-11. */
function lccALonLat(p1g: number, p2g: number, origeng: number, cmg: number, fe: number, fn: number) {
  const a = 6378137, f = 1 / 298.257223563, e = Math.sqrt(f * (2 - f)), r = Math.PI / 180;
  const m = (φ: number) => Math.cos(φ) / Math.sqrt(1 - (e * Math.sin(φ)) ** 2);
  const t = (φ: number) => Math.tan(Math.PI / 4 - φ / 2) / ((1 - e * Math.sin(φ)) / (1 + e * Math.sin(φ))) ** (e / 2);
  const φ1 = p1g * r, φ2 = p2g * r, φ0 = origeng * r, λ0 = cmg * r;
  const n = (Math.log(m(φ1)) - Math.log(m(φ2))) / (Math.log(t(φ1)) - Math.log(t(φ2)));
  const F = m(φ1) / (n * t(φ1) ** n), ρ0 = a * F * t(φ0) ** n;
  return ([x0, y0]: [number, number]): [number, number] => {
    const x = x0 - fe, y = y0 - fn;
    const ρ = Math.sign(n) * Math.hypot(x, ρ0 - y), tt = (ρ / (a * F)) ** (1 / n), θ = Math.atan2(x, ρ0 - y);
    let φ = Math.PI / 2 - 2 * Math.atan(tt);
    for (let i = 0; i < 8; i++) φ = Math.PI / 2 - 2 * Math.atan(tt * ((1 - e * Math.sin(φ)) / (1 + e * Math.sin(φ))) ** (e / 2));
    return [(θ / n + λ0) / r, φ / r];
  };
}

function proyeccion(prj: string, nombre: string) {
  const par = (k: string) => { const x = new RegExp(`PARAMETER\\["${k}",(-?[\\d.]+)\\]`, "i").exec(prj); return x ? Number(x[1]) : NaN; };
  if (/Lambert_Conformal_Conic/i.test(prj))
    return lccALonLat(par("standard_parallel_1"), par("standard_parallel_2"), par("latitude_of_origin"), par("central_meridian"), par("false_easting") || 0, par("false_northing") || 0);
  if (/UTM_Zone_\d+N/i.test(prj) && !isNaN(par("central_meridian"))) return utmALonLat(par("central_meridian"));
  throw new Error(`Proyección no reconocida en ${nombre}.prj (se espera WGS84 UTM norte o Lambert)`);
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

// Cada capa se lee UNA vez (el marco nacional de secciones pesa ~150 MB) y luego se filtra por entidad
const crudo = new Map<string, { filas: Record<string, string>[]; geoms: Anillo[][]; proy: ReturnType<typeof proyeccion> }>();
function leer(nombre: string) {
  if (!crudo.has(nombre)) {
    const prj = readFileSync(join(dir, `${nombre}.prj`), "utf8");
    crudo.set(nombre, { filas: leerDbf(join(dir, `${nombre}.dbf`)), geoms: leerShp(join(dir, `${nombre}.shp`)), proy: proyeccion(prj, nombre) });
  }
  return crudo.get(nombre)!;
}
function capa(nombre: string, idEstado: number, tol: number, minArea: number): Registro[] {
  const { filas, geoms, proy } = leer(nombre);
  const out: Registro[] = [];
  filas.forEach((props, i) => {
    if (props.entidad !== undefined && props.entidad !== "" && Number(props.entidad) !== idEstado) return;
    const anillos = geoms[i]
      .map((r) => simplificar(r, tol))
      .filter((r) => r.length >= 4 && Math.abs(area(r)) >= minArea)
      .map((r) => r.map((p) => proy(p).map((v) => Math.round(v * 1e5) / 1e5) as [number, number]));
    out.push({ props, anillos });
  });
  return out;
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
const fc = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
const feat = (props: object, anillos: Anillo[]) => ({ type: "Feature", properties: props, geometry: geometria(anillos) });

const indice = join(RAIZ, "public", "geo", "entidades.json");
type Ent = { id: number; nombre: string; secciones: number; df_desde: number | null; dl_desde: number | null };
const lista: Ent[] = existsSync(indice) ? JSON.parse(readFileSync(indice, "utf8")) : [];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// La entidad: campo «entidad» si la capa lo trae (marco nacional); si no (BGD estatal), la única entidad del archivo
const entidades = [...new Set(leer("ENTIDAD").filas.map((f) => Number(f.entidad)))].sort((a, b) => a - b).filter((e) => !SOLO || SOLO.includes(e));
const reporte: string[] = [];

for (const idEstado of entidades) {
  if (!REEMPLAZAR && !SOLO && lista.some((e) => e.id === idEstado)) { reporte.push(`${idEstado}: ya existe, se respeta (usa --entidad ${idEstado} o --reemplazar para rehacerla)`); continue; }
  const munDb = (await pool.query<{ clave_inegi: number; nombre: string }>("SELECT clave_inegi, nombre FROM app_municipio WHERE clave_inegi / 1000 = $1", [idEstado])).rows;
  const [{ nombre_corto }] = (await pool.query<{ nombre_corto: string }>("SELECT nombre_corto FROM app_estado WHERE id_estado = $1", [idEstado])).rows;
  const porNombre = new Map(munDb.map((m) => [norm(m.nombre), m.clave_inegi]));

  const municipios = capa("MUNICIPIO", idEstado, 80, 1e5);
  const secs = capa("SECCION", idEstado, 12, 50);
  const ifeAInegi = new Map<number, number>();
  // 1. Por nombre, solo si el nombre es único en el estado (hay homónimos, p. ej. dos «San Juan Mixtepec» en Oaxaca)
  const repetidos = new Set(municipios.map((m) => norm(m.props.nombre)).filter((n, i, a) => a.indexOf(n) !== i));
  const sinNombre = municipios.filter((m) => {
    const c = repetidos.has(norm(m.props.nombre)) ? undefined : porNombre.get(norm(m.props.nombre));
    if (c) ifeAInegi.set(Number(m.props.municipio), c);
    return !c;
  });
  // 2. Por secciones: la base dice a qué municipio INEGI pertenece cada sección (su año más reciente). Si ≥ 90% de las secciones
  //    del municipio IFE caen en el mismo municipio INEGI y nadie más lo tomó, esa es la equivalencia. Se reporta cada caso.
  const faltan: string[] = [];
  if (sinNombre.length) {
    const inegiDe = new Map((await pool.query<{ s: string; c: number }>(
      `SELECT DISTINCT ON (seccion_id) seccion_id AS s, clave_inegi AS c FROM sec_resumen
       WHERE id_estado = $1 AND clave_inegi IS NOT NULL AND seccion_confiable ORDER BY seccion_id, anio DESC`, [idEstado])).rows.map((x) => [Number(x.s), x.c]));
    const tomados = new Set(ifeAInegi.values());
    for (const m of sinNombre) {
      const ife = Number(m.props.municipio), votos = new Map<number, number>();
      for (const s of secs) if (Number(s.props.municipio) === ife) { const c = inegiDe.get(idEstado * 10000 + Number(s.props.seccion)); if (c) votos.set(c, (votos.get(c) ?? 0) + 1); }
      const n = [...votos.values()].reduce((a, b) => a + b, 0);
      const [c, k] = [...votos.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
      if (c && k / n >= 0.9 && !tomados.has(c)) {
        ifeAInegi.set(ife, c); tomados.add(c);
        reporte.push(`${idEstado} ${nombre_corto}: «${m.props.nombre}» (IFE ${ife}) = «${munDb.find((x) => x.clave_inegi === c)?.nombre}» (INEGI ${c}) por secciones: ${k} de ${n}`);
      } else faltan.push(`${ife} ${m.props.nombre}${n ? ` (mejor: INEGI ${c}, ${k} de ${n} secciones)` : " (sin secciones en la base)"}`);
    }
  }
  if (faltan.length) { reporte.push(`${idEstado} ${nombre_corto}: NO se escribió; municipios sin equivalente INEGI: ${faltan.join(", ")}`); continue; }

  const salida = join(RAIZ, "public", "geo", String(idEstado));
  mkdirSync(salida, { recursive: true });
  let kb = 0;
  const escribir = (archivo: string, features: unknown[]) => { const t = fc(features); writeFileSync(join(salida, archivo), t); kb += t.length / 1024; };

  escribir("entidad.geojson", capa("ENTIDAD", idEstado, 120, 2e5).map((r) => feat({ id: idEstado, nombre: nombre_corto }, r.anillos)));
  escribir("municipios.geojson", municipios.map((r) => {
    const id = ifeAInegi.get(Number(r.props.municipio))!;
    return feat({ id, nombre: munDb.find((m) => m.clave_inegi === id)!.nombre, ife: Number(r.props.municipio) }, r.anillos);
  }));
  escribir("distritos_federales.geojson", capa("DISTRITO_FEDERAL", idEstado, 80, 1e5).map((r) => feat({ id: idEstado * 100 + Number(r.props.distrito_f), n: Number(r.props.distrito_f) }, r.anillos)));
  escribir("distritos_locales.geojson", capa("DISTRITO_LOCAL", idEstado, 80, 1e5).map((r) => feat({ id: idEstado * 100 + Number(r.props.distrito_l), n: Number(r.props.distrito_l) }, r.anillos)));
  escribir("secciones.geojson", secs.filter((r) => r.anillos.length).map((r) => feat({
    id: idEstado * 10000 + Number(r.props.seccion), seccion: Number(r.props.seccion),
    municipio: ifeAInegi.get(Number(r.props.municipio)) ?? null, df: idEstado * 100 + Number(r.props.distrito_f), dl: idEstado * 100 + Number(r.props.distrito_l),
  }, r.anillos)));

  // Vigencia de los distritos: la cartografía trae la distritación ACTUAL. Se busca desde qué año las secciones de la base caen
  // en el mismo distrito que en el shapefile (≥ 98%); antes de ese año el mapa distrital era otro y esa capa no se dibuja.
  const secProps = new Map<number, { df: number; dl: number }>();
  for (const r of secs) secProps.set(idEstado * 10000 + Number(r.props.seccion), { df: idEstado * 100 + Number(r.props.distrito_f), dl: idEstado * 100 + Number(r.props.distrito_l) });
  const vigenteDesde = async (col: "id_distrito_federal" | "id_distrito_local", k: "df" | "dl") => {
    const r = (await pool.query<{ anio: number; seccion_id: string; d: number }>(
      `SELECT DISTINCT anio, seccion_id, ${col} AS d FROM sec_resumen WHERE id_estado = $1 AND extraordinaria = false AND seccion_confiable AND ${col} IS NOT NULL`, [idEstado])).rows;
    const porAnio = new Map<number, [number, number]>();
    for (const x of r) {
      const p = secProps.get(Number(x.seccion_id)); if (!p) continue;
      const c = porAnio.get(x.anio) ?? [0, 0]; c[1]++; if (p[k] === x.d) c[0]++; porAnio.set(x.anio, c);
    }
    let desde: number | null = null;
    for (const a of [...porAnio.keys()].sort((x, y) => y - x)) { const [ok, n] = porAnio.get(a)!; if (ok / n >= 0.98) desde = a; else break; }
    return desde;
  };
  const df_desde = await vigenteDesde("id_distrito_federal", "df"), dl_desde = await vigenteDesde("id_distrito_local", "dl");
  const nueva: Ent = { id: idEstado, nombre: nombre_corto, secciones: secProps.size, df_desde, dl_desde };
  const i = lista.findIndex((e) => e.id === idEstado);
  if (i >= 0) lista[i] = nueva; else lista.push(nueva);
  writeFileSync(indice, JSON.stringify([...lista].sort((a, b) => a.id - b.id)));
  console.log(`${String(idEstado).padStart(2)} ${nombre_corto}: ${secProps.size} secciones · ${municipios.length} municipios · ${kb.toFixed(0)} KB · distritos federales desde ${df_desde}, locales desde ${dl_desde}`);
}
await pool.end();
if (reporte.length) console.log("\n" + reporte.join("\n"));
