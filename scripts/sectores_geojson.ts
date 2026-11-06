// Organización territorial propia (sector por sección) → data/sectores/<clave_inegi>.json. Después se registra en lib/sectores.ts.
//   bun scripts/sectores_geojson.ts "<secciones_xxx.geojson>" --estado=5 --municipio=5035
// El archivo trae por sección: seccion, sector y secciones_nuevas («1938,1939…» cuando la sección se dividió después); las nuevas
// heredan el sector de la sección de la que salieron.
// SOLO se guarda el sector: los nombres de coordinación que trae el archivo NO se copian (el repositorio es público).
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const estado = Number(opt.estado), municipio = Number(opt.municipio);
if (!archivo || !estado || !municipio) { console.error('Uso: bun scripts/sectores_geojson.ts "<archivo.geojson>" --estado=5 --municipio=5035'); process.exit(1); }

type P = { seccion: number; sector: string; secciones_nuevas?: string | null };
const ps: P[] = JSON.parse(readFileSync(archivo, "utf8")).features.map((f: { properties: P }) => f.properties);
const secciones: Record<number, string> = {};
let heredadas = 0;
const poner = (n: number, sector: string) => {
  const id = estado * 10000 + n;
  if (secciones[id] && secciones[id] !== sector) { console.error(`La sección ${n} aparece en dos sectores (${secciones[id]} y ${sector})`); process.exit(1); }
  secciones[id] = sector;
};
for (const p of ps) {
  if (!p.sector) continue;
  const sector = String(p.sector).trim();
  poner(Number(p.seccion), sector);
  for (const n of String(p.secciones_nuevas ?? "").split(/[,;\s]+/).filter(Boolean)) { poner(Number(n), sector); heredadas++; }
}
const dir = join(RAIZ, "data", "sectores"); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${municipio}.json`), JSON.stringify({ municipio, fuente: archivo.split(/[\\/]/).pop(), secciones }));
const n: Record<string, number> = {};
for (const s of Object.values(secciones)) n[s] = (n[s] ?? 0) + 1;
console.log(`${Object.keys(secciones).length} secciones (${heredadas} heredadas de secciones divididas) en ${Object.keys(n).length} sectores:`, Object.entries(n).map(([k, v]) => `${k}=${v}`).join(" "));
console.log(`Escrito data/sectores/${municipio}.json (sin nombres). Regístralo en lib/sectores.ts si es nuevo.`);
