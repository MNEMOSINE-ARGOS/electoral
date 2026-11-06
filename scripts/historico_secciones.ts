// Genealogía de las secciones electorales (INE, «Histórico de secciones PEF 1994-PEF 2024», corte diciembre 2025) → data/historico_secciones.json
//
// Fuente: https://cartografia.ine.mx/sige8/estadisticos-Geoelectorales (lista en https://cartografia.ine.mx/sige8/api/historicos?tipo=historico),
// archivo Access (.accdb). Bun no lee Access: primero se exporta a JSON con PowerShell (requiere el proveedor Microsoft.ACE.OLEDB, que trae Office):
//
//   $p = "<ruta>\HISTORICO_SECC_ELECT_PEF_1994-PEF2024_Corte_diciembre2025.accdb"
//   $c = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$p;Mode=Read"); $c.Open()
//   $cmd = $c.CreateCommand(); $cmd.CommandText = "SELECT cve_ent, seccion, PRIMER_MOVIMIENTO, SEGUNDO_MOVIMIENTO, TERCER_MOVIMIENTO FROM [HISTORICO_SECC_ELECT_PEF1994-PEF2024_CORTE_diciembre2025]"
//   $dt = New-Object System.Data.DataTable; [void](New-Object System.Data.OleDb.OleDbDataAdapter($cmd)).Fill($dt); $c.Close()
//   $dt | Select-Object cve_ent, seccion, PRIMER_MOVIMIENTO, SEGUNDO_MOVIMIENTO, TERCER_MOVIMIENTO | ConvertTo-Json -Compress | Out-File -Encoding utf8 movimientos.json
//
//   bun scripts/historico_secciones.ts movimientos.json
//
// Cada movimiento es texto libre (488 redacciones). Se leen solo los que cambian el TERRITORIO de las secciones:
//   division: la sección origen se da de baja y su territorio pasa a las nuevas («BAJA POR RESECCIONAMIENTO … DE LA A A LA B»,
//             «SECCION NUEVA POR RESECCIONAMIENTO …, SECC ORIGEN N», «RESECCIONAMIENTO AAAA (SU ORIGEN VIENE DE LA SECCION N)»)
//   fusion:   la sección se integra completa a otra («BAJA POR INTEGRACION SECCIONAL … SE FUSIONA A LA SECCION N», «… RECIBE A LA SECC N»)
//   parcial:  pasa un pedazo y la sección origen sigue existiendo (programa de secciones multipolígono, ajustes de límites)
// Los cambios de referencia municipal no mueven territorio entre secciones y se ignoran. Lo que no se reconoce se cuenta y se informa.
// Salida: { "<id_estado>": [[origen, [destinos…], tipo, año|null], …] } con números de sección (sin el prefijo del estado).
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ruta = process.argv[2];
if (!ruta) { console.error("Uso: bun scripts/historico_secciones.ts <movimientos.json exportado del .accdb>"); process.exit(1); }

type Fila = { cve_ent: number; seccion: number; PRIMER_MOVIMIENTO: string | null; SEGUNDO_MOVIMIENTO: string | null; TERCER_MOVIMIENTO: string | null };
type Tipo = "division" | "fusion" | "parcial";
const filas: Fila[] = JSON.parse(readFileSync(ruta, "utf8").replace(/^﻿/, ""));

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const anioDe = (t: string) => { const m = /(?:RESECCIONAMIENTO|INTEGRACION SECCIONAL|AMGE)\D{0,40}?((?:19|20)\d\d)/.exec(t); return m ? Number(m[1]) : null; };

// aristas por estado: clave "origen>tipo" → destinos (los dos lados del movimiento lo cuentan: se unen)
const aristas = new Map<number, Map<string, { o: number; t: Tipo; d: Set<number>; a: number | null }>>();
function arista(e: number, o: number, d: number[], t: Tipo, a: number | null) {
  if (!aristas.has(e)) aristas.set(e, new Map());
  const m = aristas.get(e)!, k = `${o}>${t}`;
  const x = m.get(k) ?? { o, t, d: new Set<number>(), a };
  for (const y of d) if (y !== o) x.d.add(y);
  x.a ??= a; m.set(k, x);
}

const cuenta = { leidos: 0, ignorados_municipio: 0, no_reconocidos: 0 };
const noReconocidos = new Map<string, number>();
const avisos: string[] = [];

for (const f of filas) {
  const e = Number(f.cve_ent), s = Number(f.seccion);
  for (const bruto of [f.PRIMER_MOVIMIENTO, f.SEGUNDO_MOVIMIENTO, f.TERCER_MOVIMIENTO]) {
    if (!bruto || !String(bruto).trim()) continue;
    const t = norm(String(bruto)), a = anioDe(t);
    let m: RegExpExecArray | null;
    if ((m = /BAJA (?:POR|DE SECCION POR) .*?DANDO ORIGEN A ?(\d+) ?SECCIONES? ?\(DE LA ?(\d+) ?(?:A|DE) LA ?(\d+) ?\)/.exec(t))) {
      const [n, i, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (j - i + 1 !== n) avisos.push(`${e}-${s}: dice ${n} secciones pero el rango ${i}-${j} tiene ${j - i + 1}`);
      arista(e, s, Array.from({ length: j - i + 1 }, (_, k) => i + k), "division", a);
    } else if ((m = /SECCION NUEVA POR RESECCIONAMIENTO.*?SECC(?:ION)? ORIGEN (\d+)/.exec(t)) || (m = /RESECCIONAMIENTO (?:19|20)\d\d \(SU A?ORIGEN VIENE DE LA SECCION (\d+)\)/.exec(t))) {
      arista(e, Number(m[1]), [s], "division", a);
    } else if ((m = /BAJA .*?(?:SE FUSIONA|SU EXTENSION TERRITORIAL SE FUSIONA) A LA (?:SECC(?:ION)? )?(\d+)/.exec(t))) {
      arista(e, s, [Number(m[1])], "fusion", a);
    } else if ((m = /INTEGRACION SECCIONAL (?:19|20)\d\d,? (?:SE )?RECIBE (?:A )?LA SECC(?:ION)? (\d+)(?: Y (\d+))?/.exec(t))) {
      arista(e, Number(m[1]), [s], "fusion", a);
      if (m[2]) arista(e, Number(m[2]), [s], "fusion", a);
    } else if ((m = /SECCION NUEVA POR .*?SECC(?:ION)? ORIGEN (\d+)/.exec(t)) || (m = /SECCION NUEVA POR .*?ORIGEN MPIO .*?SECC (\d+)/.exec(t)) || (m = /SECCION NUEVA POR AMGE.*?SECC (\d+)/.exec(t))) {
      arista(e, Number(m[1]), [s], "parcial", a);
    } else if ((m = /DANDO ORIGEN A LA SECCION (\d+)/.exec(t)) || (m = /SE REASIGNA A LA SECCION (\d+)/.exec(t))) {
      arista(e, s, [Number(m[1])], "parcial", a);
    } else if ((m = /RECIBE UNA FRACCION .*?DE LA SECCION (\d+)/.exec(t))) {
      arista(e, Number(m[1]), [s], "parcial", a);
    } else if (/REFERENCIA M|MPIO|MUNICIPIO|MUNICIPAL|LIMITE|DELEGACIONAL|AJUSTE GRAFICO|CREACION/.test(t)) {
      cuenta.ignorados_municipio++; continue;
    } else {
      cuenta.no_reconocidos++; const p = t.replace(/\d+/g, "#"); noReconocidos.set(p, (noReconocidos.get(p) ?? 0) + 1); continue;
    }
    cuenta.leidos++;
  }
}

const salida: Record<string, [number, number[], Tipo, number | null][]> = {};
const porTipo: Record<Tipo, number> = { division: 0, fusion: 0, parcial: 0 };
for (const [e, m] of [...aristas].sort((x, y) => x[0] - y[0])) {
  salida[e] = [...m.values()].filter((x) => x.d.size).sort((x, y) => x.o - y.o || x.t.localeCompare(y.t))
    .map((x) => { porTipo[x.t]++; return [x.o, [...x.d].sort((p, q) => p - q), x.t, x.a]; });
}
const destino = join(RAIZ, "data", "historico_secciones.json");
const texto = JSON.stringify(salida);
writeFileSync(destino, texto);
console.log(`Filas: ${filas.length} · movimientos leídos: ${cuenta.leidos} · cambios de municipio o límites (sin efecto entre secciones): ${cuenta.ignorados_municipio} · no reconocidos: ${cuenta.no_reconocidos}`);
console.log(`Aristas: ${porTipo.division} divisiones · ${porTipo.fusion} fusiones · ${porTipo.parcial} parciales → ${destino} (${(texto.length / 1024).toFixed(0)} KB)`);
if (avisos.length) console.log(`Avisos (${avisos.length}):\n  ` + avisos.slice(0, 15).join("\n  "));
if (noReconocidos.size) console.log("No reconocidos:\n" + [...noReconocidos].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([p, n]) => `  ${String(n).padStart(4)} ${p.slice(0, 170)}`).join("\n"));
