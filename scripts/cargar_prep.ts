// Carga un PREP procesado (data/prep/*.json, de scripts/prep_csv.ts) a las tablas de resultados de la base, para que lo vean TODOS
// los módulos como una elección más. Por decisión del usuario; normalmente estas tablas solo las llena el pipeline (proyecto Data/).
//   bun scripts/cargar_prep.ts data/prep/5_diputados_locales_mr_2026.json              → simula: dice qué cargaría, no escribe
//   bun scripts/cargar_prep.ts data/prep/5_diputados_locales_mr_2026.json --aplicar    → carga (reemplaza lo cargado antes de ese PREP)
//   bun scripts/cargar_prep.ts data/prep/5_diputados_locales_mr_2026.json --revertir   → borra lo cargado de ese PREP
//
// Se identifica por su fuente («prep_<fecha de corte>»): nunca toca filas de otra fuente. Todo en una transacción.
// Convención de la base (igual que diputaciones locales 2023): sec_resumen y sec_votos por sección; distritos y municipios = suma de
// sus secciones; la entidad = todas las actas (incluye las que no tienen sección: voto anticipado, prisión preventiva).
// confianza = 'baja' (preliminar, sin contrastar con el cómputo). app_sec_tendencia NO se recalcula (es del pipeline).
// Cuando el pipeline cargue el cómputo oficial: --revertir y quitar la línea de lib/prep.ts.
import { readFileSync } from "fs";
import { Pool, type PoolClient } from "pg";
import type { Prep } from "../lib/prep";

const archivo = process.argv[2];
const aplicar = process.argv.includes("--aplicar"), revertir = process.argv.includes("--revertir");
if (!archivo) { console.error("Uso: bun scripts/cargar_prep.ts data/prep/<archivo>.json [--aplicar | --revertir]"); process.exit(1); }
type Fila = Prep["distritos"][number] & { nulos: number; nr: number };
const P = JSON.parse(readFileSync(archivo, "utf8")) as Prep & { distritos: Fila[]; municipios: Fila[]; secciones: (Fila & { dl: number; m: number | null; df: number | null })[] };
const [d, m, a] = P.corte.split(" ")[0].split("/");
const FUENTE = `prep_${a}-${m}-${d}`;
const { eleccion, anio, estado } = P;
const llave: [string, number, string] = [eleccion, anio, FUENTE];

const TABLAS_ELECCION = ["agg_est_votos", "agg_est_totales", "agg_mun_votos", "agg_mun_totales", "agg_dis_votos", "agg_dis_totales", "app_eleccion"];
async function borrar(c: PoolClient) {
  const n: Record<string, number> = {};
  const r = await c.query("DELETE FROM sec_votos WHERE totales_id IN (SELECT totales_id FROM sec_resumen WHERE eleccion=$1 AND anio=$2 AND fuente=$3)", llave);
  n.sec_votos = r.rowCount ?? 0;
  n.sec_resumen = (await c.query("DELETE FROM sec_resumen WHERE eleccion=$1 AND anio=$2 AND fuente=$3", llave)).rowCount ?? 0;
  for (const t of TABLAS_ELECCION) n[t] = (await c.query(`DELETE FROM ${t} WHERE eleccion=$1 AND anio=$2 AND fuente=$3`, llave)).rowCount ?? 0;
  return n;
}
const suma = (fs: Fila[]) => fs.reduce((o, f) => {
  o.vt += f.vt; o.ln += f.ln; o.nulos += f.nulos; o.nr += f.nr; o.actas += f.actas;
  for (const [k, v] of Object.entries(f.p)) o.p[k] = (o.p[k] ?? 0) + v;
  return o;
}, { vt: 0, ln: 0, nulos: 0, nr: 0, actas: 0, p: {} as Record<string, number> });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  // Otra fuente de la misma elección y entidad: no se mezclan (cada fuente es una elección distinta); se avisa y se detiene
  const otra = (await c.query("SELECT DISTINCT fuente FROM agg_est_totales WHERE eleccion=$1 AND anio=$2 AND id_estado=$3 AND fuente<>$4", [eleccion, anio, estado, FUENTE])).rows;
  if (otra.length && !revertir) { console.error(`La base ya tiene ${eleccion} ${anio} de la entidad ${estado} con otra fuente (${otra.map((x) => x.fuente).join(", ")}): no se carga el PREP encima.`); process.exit(1); }

  await c.query("BEGIN");
  if (revertir) {
    const n = await borrar(c);
    await c.query("COMMIT");
    console.log(`Revertido ${FUENTE} (${eleccion} ${anio}):`, n);
    process.exit(0);
  }

  // Códigos de partido que faltan en app_partido_codigo (sec_votos guarda el código, no la sigla)
  const siglas = [...new Set(P.secciones.flatMap((s) => Object.keys(s.p)))];
  const cod = new Map((await c.query<{ partido: string; codigo: number }>("SELECT partido, codigo FROM app_partido_codigo WHERE partido = ANY($1)", [siglas])).rows.map((x) => [x.partido, x.codigo]));
  const faltan = siglas.filter((s) => !cod.has(s));

  const est = suma(P.distritos);                       // toda la entidad: incluye actas sin sección
  const porMun = new Map<number, Fila[]>(), porDis = new Map<number, Fila[]>();
  for (const s of P.secciones) {
    if (s.m) { if (!porMun.has(s.m)) porMun.set(s.m, []); porMun.get(s.m)!.push(s); }
    if (!porDis.has(s.dl)) porDis.set(s.dl, []); porDis.get(s.dl)!.push(s);
  }
  console.log(`${P.titulo} · corte ${P.corte} · fuente «${FUENTE}»`);
  console.log(`Entidad ${estado}: ${est.vt.toLocaleString("es-MX")} votos, ${est.actas} actas · ${porDis.size} distritos locales · ${porMun.size} municipios · ${P.secciones.length} secciones (${P.secciones.reduce((x, s) => x + s.vt, 0).toLocaleString("es-MX")} votos)`);
  console.log(`Partidos: ${siglas.join(", ")}${faltan.length ? ` · códigos nuevos para: ${faltan.join(", ")}` : ""}`);
  if (!aplicar) { await c.query("ROLLBACK"); console.log("Simulación: no se escribió nada. Para cargar, agrega --aplicar."); process.exit(0); }

  const previo = await borrar(c);
  if (Object.values(previo).some(Boolean)) console.log("Reemplazando la carga anterior:", previo);
  await c.query("LOCK TABLE app_partido_codigo, sec_resumen IN SHARE ROW EXCLUSIVE MODE");
  let maxCod = Number((await c.query("SELECT coalesce(max(codigo),0) m FROM app_partido_codigo")).rows[0].m);
  for (const s of faltan) { cod.set(s, ++maxCod); await c.query("INSERT INTO app_partido_codigo (partido, codigo) VALUES ($1,$2)", [s, maxCod]); }

  // sec_resumen + sec_votos
  let tid = Number((await c.query("SELECT coalesce(max(totales_id),0) m FROM sec_resumen")).rows[0].m);
  const R: unknown[][] = [[], [], [], [], [], [], [], [], [], [], []], V: number[][] = [[], [], []];
  for (const s of P.secciones) {
    tid++;
    const o = Object.entries(s.p).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    [s.id, s.m, s.df, s.dl, s.vt, s.ln || null, tid, o[0]?.[0] ?? null, o[0]?.[1] ?? null, o[1]?.[0] ?? null, o[1]?.[1] ?? null].forEach((v, i) => R[i].push(v));
    for (const [k, v] of Object.entries(s.p)) if (v > 0) { V[0].push(tid); V[1].push(cod.get(k)!); V[2].push(v); }
  }
  await c.query(`INSERT INTO sec_resumen (totales_id, eleccion, anio, extraordinaria, fuente, seccion_id, id_estado, clave_inegi, id_distrito_federal, id_distrito_local,
      votos_totales, lista_nominal, seccion_confiable, confianza, ganador, votos_ganador, segundo, votos_segundo)
    SELECT t, $1, $2, false, $3, s, $4, m, df, dl, vt, ln, true, 'baja', g, vg, sg, vs
    FROM unnest($5::bigint[], $6::int[], $7::int[], $8::int[], $9::bigint[], $10::bigint[], $11::bigint[], $12::text[], $13::bigint[], $14::text[], $15::bigint[])
      AS u(s, m, df, dl, vt, ln, t, g, vg, sg, vs)`, [eleccion, anio, FUENTE, estado, ...R]);
  await c.query("INSERT INTO sec_votos (totales_id, partido, votos) SELECT * FROM unnest($1::int[], $2::smallint[], $3::int[])", V);

  // Agregados
  const tot = (f: ReturnType<typeof suma>, n: number) => [n, f.actas, f.vt, f.nulos, f.nr, f.ln];
  await c.query(`INSERT INTO agg_est_totales (eleccion, anio, extraordinaria, fuente, id_estado, secciones, casillas, votos_totales, nulos, no_registrados, lista_nominal, confianza)
    VALUES ($1,$2,false,$3,$4,$5,$6,$7,$8,$9,$10,'baja')`, [...llave, estado, ...tot(est, P.secciones.length)]);
  for (const [k, v] of Object.entries(est.p)) if (v > 0) await c.query("INSERT INTO agg_est_votos VALUES ($1,$2,false,$3,$4,$5,$6)", [...llave, estado, k, v]);
  for (const [mun, fs] of porMun) {
    const f = suma(fs);
    await c.query(`INSERT INTO agg_mun_totales (eleccion, anio, extraordinaria, fuente, id_estado, clave_inegi, secciones, casillas, votos_totales, nulos, no_registrados, lista_nominal, confianza)
      VALUES ($1,$2,false,$3,$4,$5,$6,$7,$8,$9,$10,$11,'baja')`, [...llave, estado, mun, ...tot(f, fs.length)]);
    for (const [k, v] of Object.entries(f.p)) if (v > 0) await c.query("INSERT INTO agg_mun_votos VALUES ($1,$2,false,$3,$4,$5,$6,$7)", [...llave, estado, mun, k, v]);
  }
  for (const [dis, fs] of porDis) {
    const f = suma(fs);
    await c.query(`INSERT INTO agg_dis_totales (eleccion, anio, extraordinaria, fuente, tipo, id_distrito, id_estado, secciones, votos_totales, lista_nominal, confianza)
      VALUES ($1,$2,false,$3,'local',$4,$5,$6,$7,$8,'baja')`, [...llave, dis, estado, fs.length, f.vt, f.ln]);
    for (const [k, v] of Object.entries(f.p)) if (v > 0) await c.query("INSERT INTO agg_dis_votos VALUES ($1,$2,false,$3,'local',$4,$5,$6)", [...llave, dis, k, v]);
  }
  await c.query("INSERT INTO app_eleccion (eleccion, anio, extraordinaria, fuente, estados, confianza, tiene_municipio) VALUES ($1,$2,false,$3,1,'baja',true)", llave);

  // Comprobación antes de confirmar: lo leído de vuelta debe dar lo mismo que el archivo
  const [chk] = (await c.query(`SELECT (SELECT sum(votos_totales) FROM sec_resumen WHERE eleccion=$1 AND anio=$2 AND fuente=$3) sec,
      (SELECT sum(votos) FROM sec_votos WHERE totales_id IN (SELECT totales_id FROM sec_resumen WHERE eleccion=$1 AND anio=$2 AND fuente=$3)) part,
      (SELECT votos_totales FROM agg_est_totales WHERE eleccion=$1 AND anio=$2 AND fuente=$3) est,
      (SELECT sum(votos_totales) FROM agg_dis_totales WHERE eleccion=$1 AND anio=$2 AND fuente=$3) dis,
      (SELECT sum(votos_totales) FROM agg_mun_totales WHERE eleccion=$1 AND anio=$2 AND fuente=$3) mun`, llave)).rows;
  const secArchivo = P.secciones.reduce((x, s) => x + s.vt, 0), partArchivo = P.secciones.reduce((x, s) => x + Object.values(s.p).reduce((y, v) => y + v, 0), 0);
  const ok = Number(chk.sec) === secArchivo && Number(chk.part) === partArchivo && Number(chk.est) === est.vt && Number(chk.dis) === secArchivo && Number(chk.mun) === secArchivo;
  if (!ok) { await c.query("ROLLBACK"); console.error("Las sumas leídas de vuelta no cuadran; no se cargó nada.", chk); process.exit(1); }
  await c.query("COMMIT");
  console.log(`Cargado ${FUENTE}: ${P.secciones.length} secciones, ${V[0].length} filas de votos, ${porMun.size} municipios, ${porDis.size} distritos, entidad. Sumas comprobadas:`, chk);
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); await pool.end(); }
