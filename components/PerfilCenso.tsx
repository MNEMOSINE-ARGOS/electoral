"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { api } from "@/lib/api";
import { BLOQUES, ENFOQUES, nombreCandidatura } from "@/lib/analisis";
import { colorPartido } from "@/lib/partidos";
import { GRUPOS, INDICADOR, INDICADORES, fmtInd, type Indicador } from "@/lib/censo";
import { useEnfoque } from "@/components/Enfoque";
import { Cargando } from "@/components/Kpi";
import { Ayuda } from "@/components/Ayuda";
import { fmt, pct } from "@/lib/format";

export type SecCenso = {
  seccion_id: number; seccion: number; votos_totales: number | null; lista_nominal: number | null; participacion: number | null;
  ganador: string | null; p_enfoque: number | null; bloques: Record<string, number>;
};
type R = {
  fuente: string; indicadores: string[]; secciones: Record<number, { pob: number | null; v: (number | null)[] }>;
  estado: (number | null)[]; nacional: (number | null)[]; origen_de: Record<number, number>;
};

function pearson(x: number[], y: number[]) {
  const n = x.length; if (n < 8) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
const fuerza = (r: number) => (Math.abs(r) < 0.1 ? "prácticamente ninguna" : Math.abs(r) < 0.3 ? "débil" : Math.abs(r) < 0.5 ? "moderada" : "fuerte");

/** Perfil socioeconómico de las secciones (Censo 2020) cruzado con el voto y la participación de UNA elección. */
export function PerfilCenso({ secciones, estado, anio, nombreEstado, resaltar = 0, onElegir }: {
  secciones: SecCenso[]; estado: number; anio: number; nombreEstado: string; resaltar?: number; onElegir?: (id: number) => void;
}) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const [d, setD] = useState<R | null>(null);
  const [error, setError] = useState("");
  const [k, setK] = useState("escolaridad");
  // Qué se cruza: el partido de enfoque, un bloque o la participación
  const bloquesVista = useMemo(() => {
    const t: Record<string, number> = {};
    for (const s of secciones) for (const [b, v] of Object.entries(s.bloques)) t[b] = (t[b] ?? 0) + v;
    return Object.entries(t).filter(([b]) => b !== "otros" && b !== "mixto").sort((a, b) => b[1] - a[1]).map(([b]) => b);
  }, [secciones]);
  const [y, setY] = useState<string>("enfoque");
  const yEf = y === "enfoque" && enfoque === "general" ? (bloquesVista[0] ?? "participacion") : y;
  useEffect(() => { setD(null); setError(""); api<R>(`/api/censo?estado=${estado}`).then(setD).catch((e) => setError(e.message)); }, [estado]);

  const ind: Indicador = INDICADOR[k];
  const iInd = d ? d.indicadores.indexOf(k) : -1;
  const yDe = (s: SecCenso): number | null => {
    if (yEf === "participacion") return s.participacion !== null && s.participacion <= 100 ? s.participacion : null;
    if (yEf === "enfoque") return s.p_enfoque;
    const tot = Object.values(s.bloques).reduce((a, b) => a + b, 0);
    return tot ? (100 * (s.bloques[yEf] ?? 0)) / tot : null;
  };
  const yNombre = yEf === "participacion" ? "Participación" : yEf === "enfoque" ? enf.t : (BLOQUES[yEf]?.nombre ?? yEf);
  const yColor = yEf === "participacion" ? "var(--azul)" : yEf === "enfoque" ? enf.color : (BLOQUES[yEf]?.color ?? "var(--fg)");

  const calc = useMemo(() => {
    if (!d || iInd < 0) return null;
    const conCenso = secciones.filter((s) => d.secciones[s.seccion_id]);
    const nuevas = secciones.filter((s) => !d.secciones[s.seccion_id]);
    const deOrigen = nuevas.filter((s) => d.origen_de[s.seccion_id]).length;
    const pts = conCenso.map((s) => ({ s, x: d.secciones[s.seccion_id].v[iInd], y: yDe(s), pob: d.secciones[s.seccion_id].pob ?? 0 }))
      .filter((p): p is typeof p & { x: number; y: number } => p.x !== null && p.y !== null && (p.s.lista_nominal ?? 0) >= 50);
    const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y));
    // Quintiles por el indicador: voto (sumando votos, no promediando %), participación y ganador más frecuente
    const o = [...pts].sort((a, b) => a.x - b.x), K = Math.min(5, o.length);
    const grupos = Array.from({ length: K }, (_, i) => {
      const g = o.slice(Math.floor((i * o.length) / K), Math.floor(((i + 1) * o.length) / K));
      const vt = g.reduce((a, p) => a + (p.s.votos_totales ?? 0), 0), ln = g.reduce((a, p) => a + (p.s.lista_nominal ?? 0), 0);
      const yv = yEf === "participacion" ? (ln ? (100 * vt) / ln : null)
        : yEf === "enfoque" ? (() => { const w = g.reduce((a, p) => a + (p.s.votos_totales ?? 0), 0); return w ? g.reduce((a, p) => a + p.y * (p.s.votos_totales ?? 0), 0) / w : null; })()
        : (() => { const b = g.reduce((a, p) => a + (p.s.bloques[yEf] ?? 0), 0), t = g.reduce((a, p) => a + Object.values(p.s.bloques).reduce((x, z) => x + z, 0), 0); return t ? (100 * b) / t : null; })();
      const gan: Record<string, number> = {}; for (const p of g) if (p.s.ganador) gan[p.s.ganador] = (gan[p.s.ganador] ?? 0) + 1;
      const top = Object.entries(gan).sort((a, b) => b[1] - a[1])[0];
      const pobW = g.reduce((a, p) => a + p.pob, 0);
      return { i, desde: g[0]?.x ?? 0, hasta: g.at(-1)?.x ?? 0, n: g.length, ln, pob: pobW, y: yv, part: ln ? (100 * vt) / ln : null, top };
    });
    const pob = pts.reduce((a, p) => a + p.pob, 0);
    const vista = pob ? pts.reduce((a, p) => a + p.x * p.pob, 0) / pob : null;
    return { pts, r, grupos, conCenso: conCenso.length, nuevas: nuevas.length, deOrigen, vista, pob };
  }, [d, iInd, secciones, yEf]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <section className="material p-5"><p role="alert" style={{ color: "var(--bad)" }}>{error}</p></section>;
  if (!d || !calc) return <Cargando alto={320} />;
  const vEst = d.estado[iInd], vNac = d.nacional[iInd];
  const g0 = calc.grupos[0], gN = calc.grupos.at(-1);
  const brecha = g0?.y != null && gN?.y != null ? gN.y - g0.y : null;
  const maxY = Math.max(...calc.grupos.map((g) => g.y ?? 0), 1);
  const tip = { background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12, padding: "8px 10px" };
  const mute = { color: "var(--fg-mute)" };

  return (
    <section className="material p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Perfil socioeconómico · Censo 2020 · {anio}</p>
          <h2 className="text-xl font-bold pt-1">¿Cómo vota cada tipo de sección?<Ayuda clave="censo_seccion" /></h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs space-y-1"><span className="label block">Variable del censo</span>
            <select className="field !py-1.5 text-sm" value={k} onChange={(e) => setK(e.target.value)}>
              {GRUPOS.map((g) => <optgroup key={g} label={g}>{INDICADORES.filter((x) => x.grupo === g).map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}</optgroup>)}
            </select></label>
          <label className="text-xs space-y-1"><span className="label block">Contra</span>
            <select className="field !py-1.5 text-sm" value={yEf} onChange={(e) => setY(e.target.value)}>
              {enfoque !== "general" && <option value="enfoque">Voto de {enf.t}</option>}
              {bloquesVista.map((b) => <option key={b} value={b}>Voto de {BLOQUES[b]?.nombre ?? b}</option>)}
              <option value="participacion">Participación</option>
            </select></label>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Dato t={ind.t} v={fmtInd(ind, calc.vista)} n="≈ en estas secciones (ponderado por población)" />
        <Dato t={nombreEstado} v={fmtInd(ind, vEst)} n={`País: ${fmtInd(ind, vNac)}`} />
        <Dato t="Relación con el voto" v={calc.r !== null ? `${calc.r >= 0 ? "+" : ""}${calc.r.toFixed(2)}` : "—"} n={calc.r !== null ? `${fuerza(calc.r)} · ${yNombre}` : "pocas secciones"} color={yColor} />
        <Dato t="Brecha entre extremos" v={brecha !== null ? `${brecha >= 0 ? "+" : ""}${brecha.toFixed(1)} pts` : "—"} n={`${yNombre}: 20% con más ${ind.t.toLowerCase()} menos 20% con menos`} color={yColor} />
      </div>

      {brecha !== null && g0 && gN && (
        <p className="text-sm font-semibold rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--azul) 8%, transparent)", color: "var(--fg-soft)" }}>
          En el 20% de secciones con <b>más</b> {ind.t.toLowerCase()} ({fmtInd(ind, gN.desde)} a {fmtInd(ind, gN.hasta)}), {yEf === "participacion" ? "la participación es" : `${yNombre} obtiene`} <b style={{ color: yColor }}>{pct(gN.y)}</b>;
          en el 20% con <b>menos</b> ({fmtInd(ind, g0.desde)} a {fmtInd(ind, g0.hasta)}), <b style={{ color: yColor }}>{pct(g0.y)}</b>.
          {calc.r !== null && Math.abs(calc.r) >= 0.3 ? ` Es una relación ${fuerza(calc.r)}: ${calc.r > 0 ? "a más" : "a menos"} ${ind.t.toLowerCase()}, ${yEf === "participacion" ? "más participación" : `más voto de ${yNombre}`}.` : " La relación es débil: esta variable explica poco del voto aquí."}
        </p>)}

      <div className="grid xl:grid-cols-[1.25fr_1fr] gap-5">
        <div>
          <p className="text-xs pb-1" style={mute}>Cada punto es una sección: color = candidatura ganadora; tamaño = lista nominal. {onElegir ? "Tócalo para abrir su lectura." : ""}</p>
          <div style={{ height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -6, right: 12, top: 8, bottom: 18 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis type="number" dataKey="x" domain={["auto", "auto"]} stroke="var(--fg-mute)" fontSize={11} tickFormatter={(v) => `${Number(v).toFixed(0)}${ind.unidad === "%" ? "%" : ""}`}
                  label={{ value: `${ind.t}${ind.unidad === "años" ? " (años)" : " (%)"}`, position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--fg-mute)" }} />
                <YAxis type="number" dataKey="y" unit="%" domain={["auto", "auto"]} stroke="var(--fg-mute)" fontSize={11} />
                <ZAxis type="number" dataKey="z" range={[14, 110]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as { s: SecCenso; x: number; y: number; pob: number } | undefined) : undefined;
                  return p ? (
                    <div style={tip} className="space-y-0.5">
                      <p className="font-bold">Sección {p.s.seccion}</p>
                      {p.s.ganador && <p>Ganó <b style={{ color: colorPartido(p.s.ganador) }}>{nombreCandidatura(p.s.ganador)}</b></p>}
                      <p>{ind.t}: <b>{fmtInd(ind, p.x)}</b></p>
                      <p>{yNombre}: <b>{pct(p.y)}</b></p>
                      <p style={mute}>{fmt(p.pob)} habitantes (2020) · {fmt(p.s.lista_nominal)} electores</p>
                    </div>) : null;
                }} />
                <Scatter data={calc.pts.map((p) => ({ ...p, z: p.s.lista_nominal ?? 1 }))} isAnimationActive={false} onClick={(e: unknown) => { const id = (e as { payload?: { s: SecCenso } })?.payload?.s.seccion_id; if (id) onElegir?.(id); }}
                  shape={(props: unknown) => { const { cx, cy, size, payload } = props as { cx: number; cy: number; size: number; payload: { s: SecCenso } };
                    const r = Math.sqrt(size / Math.PI), sel = payload.s.seccion_id === resaltar;
                    return <circle cx={cx} cy={cy} r={sel ? r + 2 : r} fill={payload.s.ganador ? colorPartido(payload.s.ganador) : "#94a3b8"} fillOpacity={resaltar && !sel ? 0.25 : 0.7}
                      stroke={sel ? "var(--fg)" : "none"} strokeWidth={2.5} style={{ cursor: onElegir ? "pointer" : undefined }} />; }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-2">
          <p className="label">Secciones en 5 grupos por {ind.t.toLowerCase()}</p>
          {calc.grupos.map((g) => (
            <div key={g.i} className="rounded-xl p-3 space-y-1.5" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <b>{fmtInd(ind, g.desde)} – {fmtInd(ind, g.hasta)}</b>
                <span className="text-xs" style={mute}>{g.n} secciones · {fmt(g.ln)} electores</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(100 * (g.y ?? 0)) / maxY}%`, background: yColor }} /></div>
                <b className="text-sm num w-14 text-right" style={{ color: yColor }}>{pct(g.y)}</b>
              </div>
              <p className="text-[11px]" style={mute}>
                {yEf !== "participacion" && <>participación {pct(g.part)} · </>}
                {g.top && <>gana más <b style={{ color: colorPartido(g.top[0]) }}>{nombreCandidatura(g.top[0])}</b> ({g.top[1]})</>}
              </p>
            </div>))}
          <p className="text-xs" style={mute}>La barra es {yEf === "participacion" ? "la participación del grupo (votos ÷ lista)" : `el voto de ${yNombre} en el grupo (sumando sus votos)`}.</p>
        </div>
      </div>

      <ul className="nota-metodo text-xs space-y-1" style={mute}>
        <li>{ind.que} Fuente: {d.fuente}.</li>
        <li>El censo es de 2020 y usa las secciones de enero de 2021. {calc.nuevas > 0 ? <><b>{fmt(calc.nuevas)} secciones de esta elección no existían entonces</b> (reseccionamiento posterior{calc.deOrigen ? `; ${fmt(calc.deOrigen)} salieron de secciones que sí están en el censo` : ""}) y no entran en el cálculo: no se les copia el perfil de su sección de origen. </> : "Todas las secciones de esta vista están en el censo. "}Se usan {fmt(calc.pts.length)} de {fmt(secciones.length)} secciones (también se excluyen las de menos de 50 electores{yEf === "participacion" ? " y con participación mayor a 100%" : ""}).</li>
        <li>Relación: correlación de Pearson entre secciones (−1 a +1). Mide asociación territorial, no causa, y no dice cómo votó cada persona (falacia ecológica): que una sección con más internet vote más por un partido no significa que quienes tienen internet voten por él.</li>
        <li>Las celdas que el INEGI protege por confidencialidad quedan vacías, no en 0.</li>
      </ul>
    </section>
  );
}

function Dato({ t, v, n, color }: { t: string; v: string; n?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4 space-y-1" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <p className="label">{t}</p>
      <p className="display text-[1.45rem] font-bold num" style={{ color: color ?? "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
