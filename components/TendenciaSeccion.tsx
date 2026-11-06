"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Compass, Layers, Ruler } from "lucide-react";
import { api } from "@/lib/api";
import { BLOQUES } from "@/lib/analisis";
import { nombreEleccion } from "@/lib/partidos";
import { Cargando } from "@/components/Kpi";
import { pct } from "@/lib/format";

type Reparto = Record<string, number>;
type R = {
  seccion: number;
  filas: { eleccion: string; anio: number; primera_sec: string | null; primera_nac: string | null; primera_edo: string | null; sec: Reparto; nac: Reparto; edo: Reparto; dist_nac: number; dist_edo: number }[];
  resumen: { elecciones: number; dist_nac_media: number | null; dist_edo_media: number | null; coincide_primera_nac_pct: number | null; pares: number; r_nac: number | null; b_nac: number | null;
    r_edo: number | null; b_edo: number | null; misma_direccion_pct: number | null; pares_claros: number; desviacion_media: number | null; veredicto: "sigue" | "parcial" | "independiente" | "sin_datos"; intensidad: "amplifica" | "amortigua" | "igual" | null } | null;
  pares: { eleccion: string; desde: number; hasta: number; familia: string; d_sec: number; d_nac: number; d_edo: number }[];
  concurrentes: { anio: number; referencia: string; eleccion: string; split_sec: number; split_edo: number; misma_primera: boolean; lectura: "bloque" | "diferenciado" | "similar" }[];
  arrastre: { n: number; bloque: number; diferenciado: number; similar: number; misma_primera_pct: number; split_sec_medio: number; split_edo_medio: number } | null;
  entidades: Record<string, number>;
  posicion: { pctl_r_nac: number | null; pctl_r_nac_estado: number | null; pctl_dist_nac: number | null } | null;
  referencias: Record<string, number | string | null>[];
};

const VER: Record<string, { t: string; d: string; color: string }> = {
  sigue: { t: "Sigue la tendencia nacional", d: "Cuando el país se mueve hacia un bloque, esta sección se mueve en la misma dirección.", color: "var(--azul)" },
  parcial: { t: "Sigue parcialmente la tendencia nacional", d: "Acompaña algunas olas nacionales, pero con movimientos propios importantes.", color: "#d97706" },
  independiente: { t: "Se comporta de forma independiente", d: "Sus cambios entre elecciones no se explican por lo que pasó en el país.", color: "var(--rose)" },
  sin_datos: { t: "Sin elecciones suficientes para medirlo", d: "Se necesitan al menos 6 cambios comparables (dos elecciones del mismo cargo con bloques que existan en ambas).", color: "var(--fg-mute)" },
};
const INT = { amplifica: "y la amplifica: se mueve más que el país", amortigua: "pero la amortigua: se mueve menos que el país", igual: "con una intensidad parecida a la del país" };
const LECT = { bloque: { t: "Vota en bloque", c: "var(--azul)" }, diferenciado: { t: "Voto diferenciado", c: "var(--rose)" }, similar: { t: "Como su estado", c: "var(--fg-mute)" } };
const nb = (k: string | null) => (k ? BLOQUES[k]?.nombre ?? k : "—");
const col = (k: string | null) => (k ? BLOQUES[k]?.color : undefined);
const fuerza = (r: number | null) => r === null ? "—" : Math.abs(r) < 0.3 ? "débil" : Math.abs(r) < 0.5 ? "moderada" : Math.abs(r) < 0.7 ? "considerable" : "fuerte";

/** Cómo se comporta una sección frente al país y a su estado: distancia a la media nacional por elección, si sus cambios siguen la ola
 *  nacional y si en años con varias boletas vota en bloque (arrastre) o diferencia. */
export function TendenciaSeccion({ seccionId }: { seccionId: number }) {
  const [d, setD] = useState<R | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setD(null); setError(""); api<R>(`/api/seccion-tendencia?id=${seccionId}`).then(setD).catch((e) => setError(e.message)); }, [seccionId]);
  if (error) return <section className="material p-5"><p role="alert" style={{ color: "var(--bad)" }}>{error}</p></section>;
  if (!d) return <Cargando alto={300} />;
  const r = d.resumen;
  if (!r) return <section className="material p-5"><p className="text-sm" style={{ color: "var(--fg-mute)" }}>No hay elecciones de esta sección para comparar con la media nacional.</p></section>;
  const v = VER[r.veredicto];
  const tip = { background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 };
  const puntos = d.pares.map((p) => ({ x: +p.d_nac.toFixed(1), y: +p.d_sec.toFixed(1), b: p.familia, t: `${nombreEleccion[p.eleccion] ?? p.eleccion} ${p.desde}→${p.hasta}` }));
  const lim = Math.ceil(Math.max(10, ...puntos.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))) ;
  const bloques = [...new Set(puntos.map((p) => p.b))];

  return (
    <section className="material p-5 space-y-5">
      <div><p className="label">Tendencia de la sección {d.seccion} frente al país y a su estado</p>
        <h2 className="text-xl font-bold pt-1">¿Vota según lo nacional o por su cuenta?</h2></div>

      <div className="rounded-2xl p-4 space-y-1" style={{ background: `color-mix(in srgb, ${v.color} 10%, transparent)` }}>
        <p className="display text-2xl font-bold" style={{ color: v.color }}>{v.t}{r.intensidad && r.veredicto !== "independiente" ? <span className="text-base font-semibold"> {INT[r.intensidad]}</span> : null}</p>
        <p className="text-sm" style={{ color: "var(--fg-soft)" }}>{v.d}</p>
        {r.pares > 0 && <p className="text-sm" style={{ color: "var(--fg-soft)" }}>
          En {r.pares} cambios de un bloque entre elecciones del mismo cargo, la relación con el cambio nacional es <b>{fuerza(r.r_nac)}</b> ({r.r_nac?.toFixed(2) ?? "—"}) y con el de su estado <b>{fuerza(r.r_edo)}</b> ({r.r_edo?.toFixed(2) ?? "—"}).
          {r.misma_direccion_pct !== null && <> Cuando el país se movió 2 puntos o más, la sección fue en la misma dirección el <b>{pct(r.misma_direccion_pct, 0)}</b> de las veces ({r.pares_claros} casos).</>}
          {r.desviacion_media !== null && <> En promedio, su cambio se apartó {r.desviacion_media.toFixed(1)} puntos del cambio nacional.</>}
          {r.r_edo !== null && r.r_nac !== null && r.r_edo - r.r_nac >= 0.15 && <> Sigue más a su estado que al país: la dinámica estatal pesa más que la nacional.</>}
        </p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Dato icon={<Ruler size={18} />} t="Distancia a la media nacional" v={r.dist_nac_media !== null ? `${r.dist_nac_media.toFixed(1)} pts` : "—"}
          n={`a su estado: ${r.dist_edo_media?.toFixed(1) ?? "—"} pts · promedio de ${r.elecciones} elecciones`} />
        <Dato icon={<Compass size={18} />} t="Misma primera fuerza que el país" v={pct(r.coincide_primera_nac_pct, 0)} n="de las elecciones de la sección" />
        <Dato icon={<Layers size={18} />} t="Elecciones concurrentes" v={d.arrastre ? `${d.arrastre.bloque} en bloque · ${d.arrastre.diferenciado} diferenciadas` : "—"}
          n={d.arrastre ? `de ${d.arrastre.n} comparaciones; misma primera fuerza en todas las boletas: ${pct(d.arrastre.misma_primera_pct, 0)}` : "no hubo dos cargos el mismo año"} />
      </div>

      {d.referencias.length > 0 && (
        <div className="space-y-2">
          <p className="label">Comparada con las demás secciones</p>
          {d.posicion?.pctl_r_nac != null && r.veredicto !== "sin_datos" && (
            <p className="text-sm" style={{ color: "var(--fg-soft)" }}>
              Esta sección sigue la tendencia nacional <b>más que el {pct(d.posicion.pctl_r_nac, 0)}</b> de las secciones del país
              {d.posicion.pctl_r_nac_estado != null && <> y más que el <b>{pct(d.posicion.pctl_r_nac_estado, 0)}</b> de las de su estado</>}.
              {d.posicion.pctl_dist_nac != null && <> Su reparto de votos se parece al nacional más que el de {pct(100 - d.posicion.pctl_dist_nac, 0)} de las secciones.</>}
            </p>)}
          <div className="overflow-auto"><table className="t">
            <thead><tr><th>Territorio</th><th>Secciones</th><th>Reparto por veredicto</th><th>Relación típica con el país</th><th>Con su estado</th><th>Distancia típica al país</th><th>Concurrentes en bloque / diferenciadas</th></tr></thead>
            <tbody>
              <tr style={{ background: `color-mix(in srgb, ${v.color} 7%, transparent)` }}><td className="font-bold">Esta sección</td><td className="num">1</td><td style={{ color: v.color, fontWeight: 700 }}>{v.t}</td>
                <td className="num">{r.r_nac?.toFixed(2) ?? "—"}</td><td className="num">{r.r_edo?.toFixed(2) ?? "—"}</td><td className="num">{r.dist_nac_media?.toFixed(1) ?? "—"} pts</td>
                <td className="num">{d.arrastre ? `${d.arrastre.bloque} / ${d.arrastre.diferenciado}` : "—"}</td></tr>
              {d.referencias.map((x) => { const n = Number(x.con_veredicto) || 1; const cn = Number(x.conc_n) || 1; return (
                <tr key={String(x.nivel)}><td className="font-bold">{String(x.nombre ?? x.nivel)}<span className="block text-[11px] font-normal" style={{ color: "var(--fg-mute)" }}>{x.nivel === "pais" ? "todas las secciones" : x.nivel === "estado" ? "su estado" : "su municipio"}</span></td>
                  <td className="num">{Number(x.secciones).toLocaleString("es-MX")}</td>
                  <td className="min-w-[180px]"><div className="flex h-3 rounded-full overflow-hidden">{(["sigue", "parcial", "independiente"] as const).map((k) => <div key={k} style={{ width: `${(100 * Number(x[k])) / n}%`, background: VER[k].color }} title={`${VER[k].t}: ${pct((100 * Number(x[k])) / n, 0)}`} />)}</div>
                    <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>sigue {pct((100 * Number(x.sigue)) / n, 0)} · parcial {pct((100 * Number(x.parcial)) / n, 0)} · independiente {pct((100 * Number(x.independiente)) / n, 0)}</span></td>
                  <td className="num">{x.r_nac_mediana != null ? Number(x.r_nac_mediana).toFixed(2) : "—"}</td><td className="num">{x.r_edo_mediana != null ? Number(x.r_edo_mediana).toFixed(2) : "—"}</td>
                  <td className="num">{x.dist_nac_mediana != null ? `${Number(x.dist_nac_mediana).toFixed(1)} pts` : "—"}</td>
                  <td className="num">{pct((100 * Number(x.conc_bloque)) / cn, 0)} / {pct((100 * Number(x.conc_diferenciado)) / cn, 0)}</td></tr>); })}
            </tbody>
          </table></div>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>«Relación típica» y «distancia típica» son medianas de las secciones del territorio. Los porcentajes del veredicto son sobre las secciones con suficientes elecciones; los de concurrentes, sobre todas las comparaciones de boletas del mismo año.</p>
        </div>
      )}

      {puntos.length > 0 && (
        <div className="grid xl:grid-cols-[1.1fr_1fr] gap-5">
          <div>
            <p className="label pb-1">Cambio de cada bloque: país (horizontal) contra sección (vertical)</p>
            <p className="text-xs pb-1" style={{ color: "var(--fg-mute)" }}>Sobre la diagonal, la sección se movió igual que el país; en los cuadrantes cruzados, en sentido contrario.</p>
            <div style={{ height: 320 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ left: -8, right: 12, top: 8, bottom: 18 }}>
                  <CartesianGrid stroke="var(--line)" />
                  <XAxis type="number" dataKey="x" name="Cambio nacional" unit=" pts" domain={[-lim, lim]} stroke="var(--fg-mute)" fontSize={11}
                    label={{ value: "Cambio nacional (puntos)", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--fg-mute)" }} />
                  <YAxis type="number" dataKey="y" name="Cambio en la sección" unit=" pts" domain={[-lim, lim]} stroke="var(--fg-mute)" fontSize={11} />
                  <ReferenceLine segment={[{ x: -lim, y: -lim }, { x: lim, y: lim }]} stroke="var(--fg-mute)" strokeDasharray="4 4" />
                  <ReferenceLine x={0} stroke="var(--line-strong)" /><ReferenceLine y={0} stroke="var(--line-strong)" />
                  <Tooltip contentStyle={tip} cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => { const p = payload?.[0]?.payload; return p ? <div style={tip} className="p-2"><b style={{ color: col(p.b) }}>{nb(p.b)}</b><br />{p.t}<br />País {p.x > 0 ? "+" : ""}{p.x} · sección {p.y > 0 ? "+" : ""}{p.y} pts</div> : null; }} />
                  {bloques.map((b) => <Scatter key={b} name={nb(b)} data={puntos.filter((p) => p.b === b)} fill={col(b) ?? "#94a3b8"} fillOpacity={0.75} isAnimationActive={false} />)}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-2">
            <p className="label">Elecciones del mismo año: ¿una boleta arrastra a las demás?</p>
            {d.concurrentes.length ? (
              <div className="overflow-auto max-h-[330px]"><table className="t">
                <thead><tr><th>Año</th><th>Comparación</th><th>Diferencia sección</th><th>Diferencia estado</th><th>Lectura</th></tr></thead>
                <tbody>{d.concurrentes.map((c, i) => (
                  <tr key={i}><td className="font-bold">{c.anio}</td><td>{nombreEleccion[c.referencia] ?? c.referencia} → {nombreEleccion[c.eleccion] ?? c.eleccion}</td>
                    <td className="num">{c.split_sec.toFixed(1)} pts</td><td className="num">{c.split_edo.toFixed(1)} pts</td>
                    <td style={{ color: LECT[c.lectura].c, fontWeight: 700 }}>{LECT[c.lectura].t}</td></tr>))}</tbody>
              </table></div>
            ) : <p className="text-sm" style={{ color: "var(--fg-mute)" }}>La sección no tiene dos cargos en un mismo año con datos.</p>}
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Diferencia = puntos de voto que habría que mover para que las dos boletas tuvieran el mismo reparto por bloque. «En bloque»: la sección diferencia al menos 2 puntos menos que su estado (el cargo principal arrastra a los demás); «diferenciado»: 2 puntos más.</p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="label">Cada elección de la sección contra la media nacional y estatal</p>
        <div className="overflow-auto max-h-[460px]"><table className="t">
          <thead><tr><th>Año</th><th>Cargo</th><th>1ª fuerza en la sección</th><th>Ese bloque en el país</th><th>Ese bloque en el estado</th><th>1ª fuerza en el país</th><th>Distancia al país</th><th>Distancia al estado</th></tr></thead>
          <tbody>{d.filas.map((f) => { const k = f.primera_sec; const s = k ? f.sec[k] : null, n = k ? f.nac[k] ?? 0 : null, e = k ? f.edo[k] ?? null : null; return (
            <tr key={`${f.eleccion}-${f.anio}`}>
              <td className="font-bold">{f.anio}</td><td>{nombreEleccion[f.eleccion] ?? f.eleccion}{(d.entidades[`${f.eleccion}|${f.anio}`] ?? 32) < 32 && <span className="block text-[11px]" style={{ color: "var(--fg-mute)" }}>país = {d.entidades[`${f.eleccion}|${f.anio}`]} entidades con esa elección</span>}</td>
              <td><b style={{ color: col(k) }}>{nb(k)}</b> <span className="num">{pct(s)}</span></td>
              <td className="num">{pct(n)} {s !== null && n !== null && <span style={{ color: s - n >= 0 ? "var(--azul)" : "var(--rose)" }}>({s - n >= 0 ? "+" : ""}{(s - n).toFixed(1)})</span>}</td>
              <td className="num">{e !== null ? pct(e) : "—"}</td>
              <td style={{ color: col(f.primera_nac), fontWeight: 600 }}>{nb(f.primera_nac)}</td>
              <td className="num">{f.dist_nac.toFixed(1)} pts</td><td className="num">{f.dist_edo.toFixed(1)} pts</td>
            </tr>); })}</tbody>
        </table></div>
      </div>

      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
        Lectura analítica, no oficial. Se compara por <b>bloque</b> (en cada año un partido cuenta en el mismo bloque vaya o no en coalición; desde 2021 PAN, PRI y PRD forman uno), así la sección, su estado y el país son comparables.
        «País» = suma de las entidades con esa elección ese año (para alcaldes, gubernaturas y diputaciones locales no son las 32). Los cambios solo se miden entre elecciones del mismo cargo y para bloques que existen en ambos años (los bloques cambian en 2018 y 2021); no entran «otros» ni coaliciones entre bloques.
        Veredicto: «sigue» si la correlación con el cambio nacional es ≥ 0.7 y coincide la dirección en ≥ 75% de los casos; «parcial» si la correlación es ≥ 0.4; con menos de 6 cambios no se emite. Correlación no es causa, y la sección puede haber cambiado de geografía por reseccionamiento.
      </p>
    </section>
  );
}

function Dato({ icon, t, v, n }: { icon: React.ReactNode; t: string; v: string; n?: string }) {
  return (
    <div className="rounded-2xl p-4 space-y-1" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <p className="label flex items-center gap-1.5">{icon}{t}</p>
      <p className="display text-xl font-bold num">{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
