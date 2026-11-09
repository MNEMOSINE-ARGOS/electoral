"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useEnfoque } from "@/components/Enfoque";
import { Ayuda } from "@/components/Ayuda";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ArrowRight, Download, Target } from "lucide-react";
import { api, type EleccionCat } from "@/lib/api";
import { Cargando } from "@/components/Kpi";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";

type Lado = { vt: number | null; ln: number | null; fam: Record<string, number> } | null;
type Fila = { seccion_id: number; seccion: number; actual: NonNullable<Lado>; comparada: Lado };
type Clase = "bastion" | "blindar" | "nueva" | "recuperar" | "objetivo" | "adversa";

const CLASES: Record<Clase, { t: string; d: string; color: string; accion: string }> = {
  bastion: { t: "Bastión", d: "Gana en ambas elecciones y hoy por 10 puntos o más", color: "#1e3a5f", accion: "Conservar con poca inversión; fuente de voluntariado y estructura." },
  blindar: { t: "Ganada reñida", d: "Gana en ambas, pero hoy por menos de 10 puntos", color: "#0e71af", accion: "Blindar: defensa del voto, presencia territorial, representantes de casilla." },
  nueva: { t: "Conquista nueva", d: "Hoy gana; en la elección comparada perdía", color: "#7c3aed", accion: "Consolidar: fidelizar al votante nuevo y evitar que regrese." },
  recuperar: { t: "Perdida", d: "En la elección comparada ganaba; hoy pierde", color: "#d81b60", accion: "Recuperar: diagnóstico de la caída, reconexión con liderazgos locales." },
  objetivo: { t: "Objetivo al alcance", d: "Pierde en ambas, pero hoy por menos de 10 puntos", color: "#d97706", accion: "Persuadir y movilizar: la prioridad con mejor costo-beneficio." },
  adversa: { t: "Adversa", d: "Pierde en ambas por 10 puntos o más", color: "#94a3b8", accion: "Baja prioridad; mensajes de contraste y reducción del margen." },
};
const ORDEN: Clase[] = ["objetivo", "recuperar", "blindar", "nueva", "bastion", "adversa"];

const incluye = (cand: string, f: string) => cand.split("-").includes(f);
const nom = (k: string) => k.split("-").join("·").toUpperCase();
/** Primer y segundo lugar de una sección (candidaturas), con su porcentaje. */
function podio(fam: Record<string, number>) {
  const t = Object.values(fam).reduce((a, b) => a + b, 0);
  const o = Object.entries(fam).sort((a, b) => b[1] - a[1]);
  const x = (i: number) => (o[i] ? { k: o[i][0], p: t ? (100 * o[i][1]) / t : 0 } : null);
  return { p1: x(0), p2: x(1) };
}
/** % de la fuerza (suma de las candidaturas en que participa) y la mejor candidatura rival, sobre el total de votos a candidaturas. */
function medir(fam: Record<string, number>, f: string) {
  const t = Object.values(fam).reduce((a, b) => a + b, 0);
  let vF = 0, rk = "", rv = 0;
  for (const [k, v] of Object.entries(fam)) { if (incluye(k, f)) vF += v; else if (v > rv) { rk = k; rv = v; } }
  return { pF: t ? (100 * vF) / t : 0, pR: t ? (100 * rv) / t : 0, vF, vR: rv, rival: rk };
}

/** `enMunicipios` («5035» o «5035,5030»), con un distrito: solo las secciones del cruce distrito × municipios. */
export function EstrategiaSecciones({ eleccion, anio, municipio, distrito, enMunicipios = "", elecciones, estado }: {
  eleccion: string; anio: number; municipio: number; distrito: number; enMunicipios?: string; elecciones: EleccionCat[]; estado: number;
}) {
  const [e2, setE2] = useState(eleccion);
  const [a2, setA2] = useState(0);
  const [d, setD] = useState<{ secciones: Fila[]; sin_par: number } | null>(null);
  const [fuerza, setFuerza] = useState("");
  const [filtro, setFiltro] = useState<Clase | "">("");
  const [aniosE2, setAniosE2] = useState<number[]>([]);

  // Años con datos por sección del cargo comparado en esa entidad
  useEffect(() => {
    api<{ elecciones: { anio: number; extraordinaria: boolean; partidos: Record<string, number> }[] }>(`/api/presidencial?eleccion=${e2}&estado=${estado}`).then((r) => {
      const ys = [...new Set(r.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length && x.anio >= 1994).map((x) => x.anio))].sort((a, b) => b - a);
      setAniosE2(ys);
      const validos = ys.filter((y) => !(e2 === eleccion && y === anio));
      const cercano = [...validos].sort((x, y) => Math.abs(x - anio) - Math.abs(y - anio) || x - y)[0] ?? 0;
      setA2((v) => (validos.includes(v) ? v : cercano));
    });
  }, [e2, estado, eleccion, anio]);
  // Al cambiar de cargo de comparación, vuelve a tomar el año más cercano
  useEffect(() => setA2(0), [e2]);
  useEffect(() => {
    if (!a2) return;
    setD(null);
    api<{ secciones: Fila[]; sin_par: number }>(`/api/comparar-secciones?eleccion=${eleccion}&anio=${anio}&eleccion2=${e2}&anio2=${a2}&${municipio ? `municipio=${municipio}` : `distrito=${distrito}${enMunicipios ? `&municipio=${enMunicipios}` : ""}`}`).then(setD);
  }, [eleccion, anio, e2, a2, municipio, distrito, enMunicipios]);

  // Fuerzas presentes (por partido que encabeza la candidatura)
  const fuerzas = useMemo(() => {
    const t: Record<string, number> = {};
    for (const s of d?.secciones ?? []) for (const [k, v] of Object.entries(s.actual.fam)) for (const p of k.split("-")) t[p] = (t[p] ?? 0) + v;
    return Object.entries(t).filter(([k]) => !/^(ind|independiente|nr|otros)/.test(k)).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [d]);
  // Con partido de enfoque (barra superior), la fuerza analizada es ese partido si compite aquí (MC antes era Convergencia)
  const { enfoque } = useEnfoque();
  useEffect(() => {
    const pref = enfoque === "general" ? null : [enfoque, ...(enfoque === "mc" ? ["conve"] : [])].find((x) => fuerzas.includes(x));
    if (pref) setFuerza(pref);
  }, [enfoque, fuerzas]);
  useEffect(() => { if (fuerzas.length && !fuerzas.includes(fuerza)) setFuerza(fuerzas[0]); }, [fuerzas, fuerza]);

  const filas = useMemo(() => {
    if (!d || !fuerza) return [];
    const parts = d.secciones.map((s) => (s.actual.vt && s.actual.ln ? (100 * s.actual.vt) / s.actual.ln : null)).filter((x): x is number => x !== null && x <= 100).sort((a, b) => a - b);
    const mediana = parts.length ? parts[Math.floor(parts.length / 2)] : 0;
    return d.secciones.map((s) => {
      const A = medir(s.actual.fam, fuerza), C = s.comparada ? medir(s.comparada.fam, fuerza) : null;
      const fA = A.pF, winA = A.pF > A.pR, margen = A.pF - A.pR;
      const fC = C ? C.pF : null, winC = C ? C.pF > C.pR : null;
      const clase: Clase | null = winC === null ? null : winA && winC ? (margen >= 10 ? "bastion" : "blindar") : winA ? "nueva" : winC ? "recuperar" : margen > -10 ? "objetivo" : "adversa";
      const vF = A.vF, vR = A.vR;
      const pA = s.actual.vt && s.actual.ln ? (100 * s.actual.vt) / s.actual.ln : null;
      const pC = s.comparada?.vt && s.comparada.ln ? (100 * s.comparada.vt) / s.comparada.ln : null;
      // (rival = mejor candidatura sin la fuerza)
      const potencial = pA !== null && pA < mediana && s.actual.ln ? Math.round(((mediana - pA) / 100) * s.actual.ln * (fA / 100)) : 0;
      return { ...s, fA, fC, delta: fC === null ? null : fA - fC, margen, clase, votosVoltear: winA ? null : vR - vF + 1, ventaja: winA ? vF - vR : null, pA, pC, potencial, ln: s.actual.ln, rival: A.rival, vF, vFC: C ? C.vF : 0, podA: podio(s.actual.fam), podC: s.comparada ? podio(s.comparada.fam) : null };
    });
  }, [d, fuerza]);

  const resumen = useMemo(() => {
    const c: Record<string, { n: number; ln: number; voltear: number }> = {};
    let ganA = 0, ganC = 0, vA = 0, vC = 0;
    for (const f of filas) {
      if (f.clase) { const x = (c[f.clase] ??= { n: 0, ln: 0, voltear: 0 }); x.n++; x.ln += f.ln ?? 0; x.voltear += f.votosVoltear ?? 0; }
      if (f.margen > 0) ganA++;
      if (f.clase && ["bastion", "blindar", "recuperar"].includes(f.clase)) ganC++;
      vA += f.vF; vC += f.vFC;
    }
    return { c, ganA, ganC, vA, vC };
  }, [filas, fuerza]);

  const vista = useMemo(() => {
    const f = filas.filter((x) => !filtro || x.clase === filtro);
    // Prioridad: menos votos para voltear primero; luego las ganadas con menor ventaja
    return [...f].sort((a, b) => ORDEN.indexOf(a.clase ?? "adversa") - ORDEN.indexOf(b.clase ?? "adversa") || (a.votosVoltear ?? a.ventaja ?? 0) - (b.votosVoltear ?? b.ventaja ?? 0));
  }, [filas, filtro]);

  function exportar() {
    const enc = ["seccion", "estrategia", `pct_${fuerza}_${e2}_${a2}`, `primero_${e2}_${a2}`, `pct_primero_${e2}_${a2}`, `segundo_${e2}_${a2}`, `pct_segundo_${e2}_${a2}`, `pct_${fuerza}_${eleccion}_${anio}`, `primero_${eleccion}_${anio}`, `pct_primero_${eleccion}_${anio}`, `segundo_${eleccion}_${anio}`, `pct_segundo_${eleccion}_${anio}`, "cambio_pts", "margen_pts", "rival", "votos_para_ganar", "votos_de_ventaja", `participacion_${a2}`, `participacion_${anio}`, "lista_nominal", "votos_potenciales_movilizacion"];
    const lineas = vista.map((f) => [f.seccion, f.clase ? CLASES[f.clase].t : "sin comparación", f.fC?.toFixed(1) ?? "", f.podC?.p1 ? nom(f.podC.p1.k) : "", f.podC?.p1?.p.toFixed(1) ?? "", f.podC?.p2 ? nom(f.podC.p2.k) : "", f.podC?.p2?.p.toFixed(1) ?? "",
      f.fA.toFixed(1), f.podA.p1 ? nom(f.podA.p1.k) : "", f.podA.p1?.p.toFixed(1) ?? "", f.podA.p2 ? nom(f.podA.p2.k) : "", f.podA.p2?.p.toFixed(1) ?? "", f.delta?.toFixed(1) ?? "", f.margen.toFixed(1), f.rival.split("-").join("·").toUpperCase(), f.votosVoltear ?? "", f.ventaja ?? "", f.pC?.toFixed(1) ?? "", f.pA?.toFixed(1) ?? "", f.ln ?? "", f.potencial].join(","));
    const blob = new Blob(["﻿" + [enc.join(","), ...lineas].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `estrategia_${fuerza}_${eleccion}_${anio}_vs_${e2}_${a2}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const n1 = `${nombreEleccion[eleccion] ?? eleccion} ${anio}`, n2 = `${nombreEleccion[e2] ?? e2} ${a2}`;
  const cargos = useMemo(() => [...new Set(elecciones.map((e) => e.eleccion))].filter((e) => e !== "diputados_locales_rp"), [elecciones]);
  const tip = { background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 };
  const puntos = filas.filter((f) => f.fC !== null).map((f) => ({ x: +f.fC!.toFixed(1), y: +f.fA.toFixed(1), z: f.ln ?? 1, s: f.seccion, clase: f.clase! }));

  return (
    <div className="space-y-5">
      <section className="material p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><span className="label block">Elección leída</span><p className="field !w-auto font-semibold">{nombreEleccion[eleccion] ?? eleccion} {anio}</p></div>
          <ArrowRight size={18} className="mb-3" style={{ color: "var(--fg-mute)" }} />
          <label className="space-y-1"><span className="label block">Comparar con (cargo)</span>
            <select className="field !w-auto" value={e2} onChange={(e) => setE2(e.target.value)}>{cargos.map((c) => <option key={c} value={c}>{nombreEleccion[c] ?? c}</option>)}</select></label>
          <label className="space-y-1"><span className="label block">Año</span>
            <select className="field !w-auto" value={a2} onChange={(e) => setA2(Number(e.target.value))}>{aniosE2.filter((y) => !(e2 === eleccion && y === anio)).map((y) => <option key={y}>{y}</option>)}</select></label>
          <div className="space-y-1"><span className="label block">Fuerza a analizar</span>
            <div className="seg flex-wrap">{fuerzas.slice(0, 7).map((f) => <button key={f} aria-pressed={f === fuerza} onClick={() => setFuerza(f)} style={f === fuerza ? { color: colorPartido(f) } : undefined}>{f.toUpperCase()}</button>)}</div></div>
        </div>
        <p className="text-xs" style={{ color: "var(--fg-mute)" }}>La fuerza se mide con la candidatura en la que participa (sola o en coalición) y se compara contra la mejor candidatura rival. Comparar el mismo cargo en otro año mide la evolución; comparar con otro cargo del mismo año mide el voto diferenciado (por ejemplo, alcalde contra presidente). Las secciones se cruzan por número: si hubo reseccionamiento, algunas quedan sin comparación{d ? ` (${d.sin_par} aquí)` : ""}.</p>
      </section>

      {!d ? <Cargando alto={360} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <K t={`Secciones ganadas por ${fuerza.toUpperCase()}`} v={`${resumen.ganA}`} n={`de ${filas.length} en ${n1}; ${resumen.ganC} en ${n2}`} color={colorPartido(fuerza)} />
            <K t={`Votos de ${fuerza.toUpperCase()}`} v={fmt(resumen.vA)} n={resumen.vC ? `${resumen.vA >= resumen.vC ? "+" : ""}${fmt(resumen.vA - resumen.vC)} frente a ${n2}` : undefined} />
            <K t="Objetivos al alcance" v={`${resumen.c.objetivo?.n ?? 0}`} n={resumen.c.objetivo ? `${fmt(resumen.c.objetivo.voltear)} votos para ganarlas todas` : "pierde por menos de 10 pts en ambas"} color={CLASES.objetivo.color} />
            <K t="Por recuperar" v={`${resumen.c.recuperar?.n ?? 0}`} n={resumen.c.recuperar ? `${fmt(resumen.c.recuperar.voltear)} votos para recuperarlas` : "ganaba y hoy pierde"} color={CLASES.recuperar.color} />
          </div>

          <section className="grid xl:grid-cols-[1fr_1.1fr] gap-4">
            <div className="material p-5 space-y-3">
              <div className="flex items-center gap-2"><Target size={18} style={{ color: "var(--accion)" }} /><h2 className="text-lg font-bold">Matriz de estrategia · {fuerza.toUpperCase()}</h2></div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {ORDEN.map((k) => { const x = resumen.c[k]; return (
                  <button key={k} className="tarjeta-btn !p-3" aria-pressed={filtro === k} onClick={() => setFiltro(filtro === k ? "" : k)}>
                    <div className="flex items-baseline justify-between gap-2"><span className="font-bold text-sm" style={{ color: CLASES[k].color }}>{CLASES[k].t}</span><span className="display text-2xl font-bold num">{x?.n ?? 0}</span></div>
                    <p className="text-[11px] leading-snug pt-0.5" style={{ color: "var(--fg-mute)" }}>{CLASES[k].d}</p>
                    <p className="text-[11px] leading-snug pt-1.5 font-semibold" style={{ color: "var(--fg-soft)" }}>{CLASES[k].accion}</p>
                    {x && <p className="text-[11px] pt-1 num" style={{ color: "var(--fg-mute)" }}>{fmt(x.ln)} en lista nominal</p>}
                  </button>); })}
              </div>
            </div>
            <div className="material p-5 space-y-2">
              <h2 className="text-lg font-bold">% de {fuerza.toUpperCase()} por sección</h2>
              <p className="text-sm font-semibold" style={{ color: "var(--fg-soft)" }}>Horizontal: {n2} · Vertical: {n1}</p>
              <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Cada punto es una sección (tamaño = lista nominal). Arriba de la diagonal, {fuerza.toUpperCase()} creció; abajo, cayó.</p>
              <div style={{ height: 380 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ left: -10, right: 12, top: 8, bottom: 8 }}>
                    <CartesianGrid stroke="var(--line)" />
                    <XAxis type="number" dataKey="x" name={n2} unit="%" domain={[0, 100]} stroke="var(--fg-mute)" fontSize={11} />
                    <YAxis type="number" dataKey="y" name={n1} unit="%" domain={[0, 100]} stroke="var(--fg-mute)" fontSize={11} />
                    <ZAxis type="number" dataKey="z" range={[18, 140]} />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="var(--fg-mute)" strokeDasharray="4 4" />
                    <Tooltip contentStyle={tip} formatter={(v, n) => [`${v}%`, n]} labelFormatter={() => ""} />
                    {ORDEN.map((k) => <Scatter key={k} name={CLASES[k].t} data={puntos.filter((p) => p.clase === k && (!filtro || filtro === k))} fill={CLASES[k].color} fillOpacity={0.75} isAnimationActive={false} />)}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="material p-4 md:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Secciones por prioridad {filtro ? `· ${CLASES[filtro].t}` : ""} · {vista.length}</h2>
              <button className="btn btn-ghost !py-1.5 text-sm" onClick={exportar}><Download size={15} />Descargar CSV</button>
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="t">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ top: 0 }}>Sección</th><th rowSpan={2} style={{ top: 0 }}>Estrategia</th>
                    <th colSpan={4} style={{ top: 0, textAlign: "center", borderLeft: "1px solid var(--line-strong)", color: "var(--fg-soft)" }}>{n2}</th>
                    <th colSpan={4} style={{ top: 0, textAlign: "center", borderLeft: "1px solid var(--line-strong)", color: "var(--fg)" }}>{n1}</th>
                    <th colSpan={4} style={{ top: 0, textAlign: "center", borderLeft: "1px solid var(--line-strong)" }}>Lectura estratégica · {fuerza.toUpperCase()}</th>
                  </tr>
                  <tr>
                    {[0, 1].map((g) => (
                      <Fragment key={g}><th style={{ top: 33, borderLeft: "1px solid var(--line-strong)" }}>{fuerza.toUpperCase()}</th><th style={{ top: 33 }}>1er lugar</th><th style={{ top: 33 }}>2º lugar</th><th style={{ top: 33 }}>Particip.</th></Fragment>
                    ))}
                    <th style={{ top: 33, borderLeft: "1px solid var(--line-strong)" }}>Cambio</th><th style={{ top: 33 }}>Votos para ganar<Ayuda clave="votos_para_ganar" /></th><th style={{ top: 33 }}>Ventaja</th><th style={{ top: 33 }}>Potencial<Ayuda clave="potencial" /></th>
                  </tr>
                </thead>
                <tbody>{vista.map((f) => (
                  <tr key={f.seccion_id}>
                    <td className="font-bold">{f.seccion}</td>
                    <td>{f.clase ? <span className="font-bold" style={{ color: CLASES[f.clase].color }}>{CLASES[f.clase].t}</span> : <span style={{ color: "var(--fg-mute)" }}>sin comparación</span>}</td>
                    <td style={{ borderLeft: "1px solid var(--line)" }}>{f.fC !== null ? pct(f.fC) : "—"}</td>
                    <Lugar l={f.podC?.p1} /><Lugar l={f.podC?.p2} />
                    <td>{pct(f.pC, 0)}</td>
                    <td className="font-semibold" style={{ borderLeft: "1px solid var(--line)" }}>{pct(f.fA)}</td>
                    <Lugar l={f.podA.p1} /><Lugar l={f.podA.p2} />
                    <td>{pct(f.pA, 0)}</td>
                    <td className="font-bold" style={{ borderLeft: "1px solid var(--line)", color: f.delta === null ? undefined : f.delta >= 0 ? "var(--azul)" : "var(--rose)" }}>{f.delta === null ? "—" : `${f.delta >= 0 ? "+" : ""}${f.delta.toFixed(1)}`}</td>
                    <td className="font-semibold">{f.votosVoltear !== null ? fmt(f.votosVoltear) : "—"}</td>
                    <td>{f.ventaja !== null ? fmt(f.ventaja) : "—"}</td>
                    <td>{f.potencial ? fmt(f.potencial) : "—"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>«Votos para ganar»: votos que le faltaron a {fuerza.toUpperCase()} para superar a la primera fuerza en {anio}. «Potencial por participación»: votos adicionales que {fuerza.toUpperCase()} obtendría si la sección votara como la mediana del territorio, manteniendo su proporción. Son estimaciones para priorizar, no pronósticos. Orden: objetivos al alcance y secciones por recuperar primero, de las más baratas a las más caras.</p>
          </section>
        </>
      )}
    </div>
  );
}

function K({ t, v, n, color }: { t: string; v: string; n?: string; color?: string }) {
  return (
    <div className="material p-4 space-y-1">
      <p className="label">{t}</p>
      <p className="display text-[1.7rem] font-bold num" style={{ color: color ?? "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}

function Lugar({ l }: { l: { k: string; p: number } | null | undefined }) {
  if (!l) return <td>—</td>;
  return <td className="whitespace-nowrap"><span className="font-semibold" style={{ color: colorPartido(l.k) }}>{nom(l.k)}</span> <span className="num">{l.p.toFixed(1)}%</span></td>;
}
