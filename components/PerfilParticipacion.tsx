"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Activity, Venus, Users } from "lucide-react";
import { colorPartido } from "@/lib/partidos";
import { nombreCandidatura } from "@/lib/analisis";
import { fmt, pct } from "@/lib/format";
import { Ayuda } from "@/components/Ayuda";

export type SecPerfil = {
  seccion_id: number; seccion: number; votos_totales: number | null; lista_nominal: number | null; participacion: number | null; ganador: string | null;
  mujeres_pct: number | null; edad_media: number | null; pct_18_29: number | null; pct_65: number | null;
};
type Var = "edad_media" | "pct_18_29" | "pct_65" | "mujeres_pct";
const VARS: Record<Var, { t: string; eje: string; u: string }> = {
  edad_media: { t: "Edad media", eje: "Edad media del electorado (años)", u: " años" },
  pct_18_29: { t: "% jóvenes (18 a 29)", eje: "% de electores de 18 a 29 años", u: "%" },
  pct_65: { t: "% de 65 años y más", eje: "% de electores de 65 años y más", u: "%" },
  mujeres_pct: { t: "% mujeres", eje: "% de mujeres en la lista nominal", u: "%" },
};

function pearson(x: number[], y: number[]) {
  const n = x.length; if (n < 5) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
function lectura(r: number | null, v: Var) {
  if (r === null) return "No hay suficientes secciones para medir la relación.";
  const f = Math.abs(r) < 0.1 ? "prácticamente no hay relación" : Math.abs(r) < 0.3 ? "hay una relación débil" : Math.abs(r) < 0.5 ? "hay una relación moderada" : "hay una relación fuerte";
  if (Math.abs(r) < 0.1) return `Entre ${VARS[v].t.toLowerCase()} y participación ${f}.`;
  return `${f[0].toUpperCase() + f.slice(1)}: donde ${v === "edad_media" ? "el electorado es mayor" : v === "mujeres_pct" ? "hay más mujeres" : `es mayor el ${VARS[v].t.toLowerCase()}`}, la participación tiende a ser ${r > 0 ? "más alta" : "más baja"}.`;
}

/** Perfil por edad y sexo de las secciones cruzado con la participación de UNA elección. */
export function PerfilParticipacion({ secciones, corte, anio, filtro = "", universo, resaltar = 0, onElegir }: {
  secciones: SecPerfil[]; corte: string | null; anio: number; filtro?: string;
  /** secciones que se dibujan como puntos (por defecto, las mismas); al elegir una sección, se siguen viendo todas y ella se resalta */ universo?: SecPerfil[];
  resaltar?: number; onElegir?: (seccionId: number) => void;
}) {
  const [v, setV] = useState<Var>("edad_media");
  const validas = useMemo(() => secciones.filter((s) => s[v] !== null && s.participacion !== null && s.participacion <= 100 && (s.lista_nominal ?? 0) >= 50), [secciones, v]);
  const r = useMemo(() => pearson(validas.map((s) => s[v]!), validas.map((s) => s.participacion!)), [validas, v]);

  // Quintiles de la variable: participación ponderada (votos / lista), % mujeres, edad media y ganador más frecuente de cada grupo
  const grupos = useMemo(() => {
    const o = [...validas].sort((a, b) => a[v]! - b[v]!);
    const k = Math.min(5, o.length);
    return Array.from({ length: k }, (_, i) => {
      const g = o.slice(Math.floor((i * o.length) / k), Math.floor(((i + 1) * o.length) / k));
      const vt = g.reduce((a, s) => a + (s.votos_totales ?? 0), 0), ln = g.reduce((a, s) => a + (s.lista_nominal ?? 0), 0);
      const gan: Record<string, number> = {};
      for (const s of g) if (s.ganador) gan[s.ganador] = (gan[s.ganador] ?? 0) + 1;
      const top = Object.entries(gan).sort((a, b) => b[1] - a[1])[0];
      const prom = (f: Var) => { const xs = g.map((s) => s[f]).filter((x): x is number => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
      return { i, desde: g[0]?.[v] ?? 0, hasta: g.at(-1)?.[v] ?? 0, n: g.length, ln, part: ln ? (100 * vt) / ln : null, mujeres: prom("mujeres_pct"), edad: prom("edad_media"), jov: prom("pct_18_29"), top: top ? { k: top[0], n: top[1] } : null };
    });
  }, [validas, v]);

  const totLn = secciones.reduce((a, s) => a + (s.lista_nominal ?? 0), 0);
  const prom = (f: Var) => { const xs = secciones.filter((s) => s[f] !== null && s.lista_nominal); const w = xs.reduce((a, s) => a + s.lista_nominal!, 0); return w ? xs.reduce((a, s) => a + s[f]! * s.lista_nominal!, 0) / w : null; };
  // Puntos: todas las secciones del universo (aunque se haya elegido una); el peso es su lista nominal frente a la del universo
  const base = universo ?? secciones;
  const lnBase = base.reduce((a, s) => a + (s.lista_nominal ?? 0), 0);
  const puntos = base.filter((s) => s[v] !== null && s.participacion !== null && s.participacion <= 100 && (s.lista_nominal ?? 0) >= 50)
    .map((s) => ({ x: s[v]!, y: s.participacion!, z: s.lista_nominal ?? 1, s: s.seccion, id: s.seccion_id, g: s.ganador, sec: s, peso: lnBase ? (100 * (s.lista_nominal ?? 0)) / lnBase : null }));
  type Punto = (typeof puntos)[number];
  const sel = resaltar ? puntos.filter((p) => p.id === resaltar) : [];
  const zs = puntos.map((p) => p.z);
  const zMin = zs.length ? Math.min(...zs) : 0, zMax = zs.length ? Math.max(...zs) : 0;
  const pesadas = [...base].filter((s) => s.lista_nominal).sort((a, b) => b.lista_nominal! - a.lista_nominal!).slice(0, 8);
  const clic = (d: unknown) => { const id = (d as { payload?: Punto; id?: number })?.payload?.id ?? (d as { id?: number })?.id; if (id && onElegir) onElegir(id); };
  const porGanador = useMemo(() => { const m = new Map<string, Punto[]>(); for (const p of puntos) { const k = p.g ?? "—"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(p); } return [...m.entries()].sort((a, b) => b[1].length - a[1].length); }, [puntos]);
  const maxPart = Math.max(...grupos.map((g) => g.part ?? 0), 1);
  const tip = { background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 };
  const posterior = corte ? Number(corte.slice(0, 4)) > anio : false;

  return (
    <section className="material p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">Electorado y participación · {anio}{filtro ? ` · filtro: ${filtro} (${secciones.length} secc.)` : ""}</p><h2 className="text-xl font-bold pt-1">¿Quién vota? Edad y sexo de las secciones contra su participación</h2></div>
        <div className="seg flex-wrap">{(Object.keys(VARS) as Var[]).map((k) => <button key={k} aria-pressed={v === k} onClick={() => setV(k)}>{VARS[k].t}</button>)}</div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Dato ayuda="edad_media" icon={<Users size={20} />} t="Edad media del electorado" v={prom("edad_media") !== null ? `${prom("edad_media")!.toFixed(1)} años` : "—"} n="promedio ponderado por lista nominal" />
        <Dato icon={<Venus size={20} color="var(--mujer)" />} t="Mujeres" v={pct(prom("mujeres_pct"))} n={`de ${fmt(totLn)} en la lista`} color="var(--mujer)" />
        <Dato ayuda="jovenes" icon={<Users size={20} />} t="Jóvenes de 18 a 29" v={pct(prom("pct_18_29"))} n={`65 años y más: ${pct(prom("pct_65"))}`} />
        <Dato ayuda="relacion_pais" icon={<Activity size={20} color="var(--azul)" />} t="Relación con la participación" v={r !== null ? (r >= 0 ? "+" : "") + r.toFixed(2) : "—"} n={`${VARS[v].t}; de −1 a +1`} color="var(--azul)" />
      </div>
      <p className="text-sm font-semibold rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--azul) 8%, transparent)", color: "var(--fg-soft)" }}>{lectura(r, v)}</p>

      <div className="grid xl:grid-cols-[1.25fr_1fr] gap-5">
        <div>
          <p className="text-xs pb-1" style={{ color: "var(--fg-mute)" }}>Cada punto es una sección: color = candidatura ganadora; tamaño = lista nominal (de {fmt(zMin)} a {fmt(zMax)} electores). Pasa el cursor para ver cuál es y cuánto pesa{onElegir ? "; tócalo para abrir su ficha" : ""}.</p>
          <div style={{ height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -6, right: 12, top: 8, bottom: 18 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis type="number" dataKey="x" name={VARS[v].t} domain={["auto", "auto"]} stroke="var(--fg-mute)" fontSize={11} tickFormatter={(x) => `${Number(x).toFixed(0)}${VARS[v].u === "%" ? "%" : ""}`}
                  label={{ value: VARS[v].eje, position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--fg-mute)" }} />
                <YAxis type="number" dataKey="y" name="Participación" unit="%" domain={["auto", "auto"]} stroke="var(--fg-mute)" fontSize={11} />
                <ZAxis type="number" dataKey="z" range={[16, 120]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Punto | undefined) : undefined;
                  return p ? <TipSeccion p={p} v={v} tip={tip} /> : null;
                }} />
                {porGanador.map(([g, pts]) => <Scatter key={g} name={g === "—" ? "sin dato" : nombreCandidatura(g)} data={pts} fill={g === "—" ? "#94a3b8" : colorPartido(g)}
                  fillOpacity={resaltar ? 0.28 : 0.7} isAnimationActive={false} onClick={clic} style={{ cursor: onElegir ? "pointer" : undefined }} />)}
                {sel.length > 0 && <Scatter name={`Sección ${sel[0].s}`} data={sel} fill={sel[0].g ? colorPartido(sel[0].g) : "#94a3b8"} stroke="var(--fg)" strokeWidth={2.5} isAnimationActive={false} />}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-2">
          <p className="label">Secciones en 5 grupos por {VARS[v].t.toLowerCase()}</p>
          {grupos.map((g) => (
            <div key={g.i} className="rounded-xl p-3 space-y-1.5" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <b>{g.desde.toFixed(1)}–{g.hasta.toFixed(1)}{VARS[v].u}</b>
                <span className="text-xs" style={{ color: "var(--fg-mute)" }}>{g.n} secciones · {fmt(g.ln)} electores</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(100 * (g.part ?? 0)) / maxPart}%`, background: "var(--azul)" }} /></div>
                <b className="text-sm num w-14 text-right">{pct(g.part)}</b>
              </div>
              <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                {v !== "edad_media" && g.edad !== null && <>edad media {g.edad.toFixed(1)} · </>}
                {v !== "mujeres_pct" && g.mujeres !== null && <>{g.mujeres.toFixed(1)}% mujeres · </>}
                {g.top && <>gana más <b style={{ color: colorPartido(g.top.k) }}>{nombreCandidatura(g.top.k)}</b> ({g.top.n})</>}
              </p>
            </div>
          ))}
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>La barra es la participación del grupo (votos entre lista nominal).</p>
          {pesadas.length > 1 && (
            <div className="pt-2 space-y-1.5">
              <p className="label">Las secciones que más pesan · electores</p>
              <table className="t text-xs">
                <thead><tr><th>Sección</th><th>Lista nominal</th><th>Peso</th><th>Particip.</th><th>{VARS[v].t}</th></tr></thead>
                <tbody>{pesadas.map((s) => (
                  <tr key={s.seccion_id} className={onElegir ? "cursor-pointer" : undefined} onClick={() => onElegir?.(s.seccion_id)}
                    style={{ background: s.seccion_id === resaltar ? "color-mix(in srgb, var(--accion) 9%, transparent)" : undefined }}>
                    <td className="font-bold whitespace-nowrap"><span className="inline-block size-2 rounded-full mr-1.5" style={{ background: s.ganador ? colorPartido(s.ganador) : "#94a3b8" }} />{s.seccion}</td>
                    <td className="num">{fmt(s.lista_nominal)}</td><td className="num">{pct(lnBase ? (100 * s.lista_nominal!) / lnBase : null, 2)}</td>
                    <td className="num">{pct(s.participacion)}</td><td className="num">{s[v] !== null ? `${s[v]!.toFixed(1)}${VARS[v].u}` : "—"}</td>
                  </tr>))}</tbody>
              </table>
              <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Peso = su lista nominal ÷ la de las {fmt(base.length)} secciones de la vista ({fmt(lnBase)} electores).</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
        Edades del corte DERFE {corte ?? "—"}{posterior ? `, posterior a la elección de ${anio} (no hay edades por sección antes de 2021): es una aproximación del perfil de la sección` : ", el más cercano anterior a la jornada"}.
        La edad media usa la marca de cada grupo (65 y más = 72 años). La relación (correlación de Pearson) mide asociación entre secciones, no causa, y no dice cómo votó cada grupo de edad.
        Se excluyen secciones con menos de 50 electores o con participación mayor a 100% (casillas especiales).
      </p>
    </section>
  );
}

function Dato({ icon, t, v, n, color, ayuda }: { icon: React.ReactNode; t: string; v: string; n?: string; color?: string; ayuda?: string }) {
  return (
    <div className="rounded-2xl p-4 space-y-1" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <p className="label flex items-center gap-1.5">{icon}{t}{ayuda && <Ayuda clave={ayuda} />}</p>
      <p className="display text-[1.6rem] font-bold num" style={{ color: color ?? "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}

/** Tarjeta de un punto: qué sección es, cuánto pesa en números absolutos y su perfil de edad y sexo. */
function TipSeccion({ p, v, tip }: { p: { s: number; x: number; y: number; z: number; g: string | null; peso: number | null; sec: SecPerfil }; v: Var; tip: React.CSSProperties }) {
  const s = p.sec;
  return (
    <div style={{ ...tip, padding: "8px 10px", maxWidth: 250 }} className="space-y-0.5">
      <p className="font-bold text-[.85rem]">Sección {p.s}</p>
      {p.g && <p><span className="inline-block size-2 rounded-full mr-1.5" style={{ background: colorPartido(p.g) }} />Ganó <b>{nombreCandidatura(p.g)}</b></p>}
      <p><b className="num">{fmt(s.lista_nominal)}</b> electores{p.peso !== null && <> · <b>{pct(p.peso, 2)}</b> de la vista</>}</p>
      <p>{fmt(s.votos_totales)} votos · participación <b>{pct(p.y)}</b></p>
      <p style={{ color: "var(--fg-mute)" }}>{VARS[v].t}: <b style={{ color: "var(--fg)" }}>{p.x.toFixed(1)}{VARS[v].u}</b></p>
      <p style={{ color: "var(--fg-mute)" }}>
        {s.edad_media !== null && <>edad media {s.edad_media.toFixed(1)} · </>}{s.pct_18_29 !== null && <>18–29 {pct(s.pct_18_29)} · </>}{s.pct_65 !== null && <>65+ {pct(s.pct_65)} · </>}{s.mujeres_pct !== null && <>{pct(s.mujeres_pct)} mujeres</>}
      </p>
      {s.lista_nominal !== null && s.pct_18_29 !== null && <p style={{ color: "var(--fg-mute)" }}>≈ {fmt(Math.round((s.lista_nominal * s.pct_18_29) / 100))} jóvenes de 18 a 29 · ≈ {fmt(Math.round((s.lista_nominal * (s.pct_65 ?? 0)) / 100))} de 65 y más</p>}
    </div>
  );
}
