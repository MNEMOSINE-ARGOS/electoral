"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Check } from "lucide-react";
import { api, type Resultado } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { Cargando } from "@/components/Kpi";
import { FiltroTerritorio, NAC, nombreTerr, type Terr } from "@/components/FiltroTerritorio";
import { CARGOS, cargo as cargoDe, type CargoId } from "@/lib/cargos";
import { alcance, colorPartido } from "@/lib/partidos";
import { BLOQUES, familia, indicadores, nombreCandidatura, porBloque, porCandidatura } from "@/lib/analisis";
import { fmt, pct } from "@/lib/format";

type Lectura = "candidatura" | "partido" | "bloque";
const LECT: Record<Lectura, { t: string; d: string }> = {
  candidatura: { t: "Por candidatura", d: "Cada candidatura (coalición) se agrupa por el partido que la encabeza, para poder seguirla entre años." },
  partido: { t: "Por partido (alcance)", d: "Votos del partido más los de cada coalición que integra. No suma 100%." },
  bloque: { t: "Por bloque", d: "Agrupación analítica de las coaliciones de cada elección (no oficial)." },
};

function series(r: Resultado, l: Lectura): Record<string, number> {
  if (l === "bloque") return porBloque(r.partidos, r.anio);
  if (l === "partido") return alcance(r.partidos);
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(porCandidatura(r.partidos))) { const f = familia(k) ?? "otros"; o[f] = (o[f] ?? 0) + v; }
  return o;
}
const etiqueta = (k: string, l: Lectura) => (l === "bloque" ? BLOQUES[k]?.nombre ?? k : l === "candidatura" ? `Encabezada por ${k.toUpperCase()}` : k.toUpperCase());
const colorDe = (k: string, l: Lectura) => (l === "bloque" ? BLOQUES[k]?.color ?? "#9aa0a6" : colorPartido(k));

export default function Historico() {
  const cat = useCatalogo();
  const [cargoId, setCargoId] = useState<CargoId>("presidente");
  const [terr, setTerr] = useState<Terr>(NAC);
  const [lectura, setLectura] = useState<Lectura>("candidatura");
  const [serie, setSerie] = useState<Resultado[] | null>(null);
  const [desde, setDesde] = useState(0);
  const [hasta, setHasta] = useState(0);
  const [aA, setAA] = useState(0);
  const [aB, setAB] = useState(0);
  const [elegidos, setElegidos] = useState<string[] | null>(null);
  const c = cargoDe(cargoId);

  useEffect(() => {
    setSerie(null);
    const qs = new URLSearchParams({ eleccion: cargoId, estado: String(terr.estado), municipio: String(terr.municipio), distrito: String(terr.distrito), seccion: String(terr.seccion), anio_ref: String(aB || 0) });
    api<{ elecciones: Resultado[] }>(`/api/presidencial?${qs}`).then((d) => setSerie(d.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length))).catch(() => setSerie([]));
  }, [cargoId, terr]); // eslint-disable-line react-hooks/exhaustive-deps

  const anios = useMemo(() => (serie ?? []).map((x) => x.anio), [serie]);
  useEffect(() => {
    if (!anios.length) return;
    setDesde((d) => (anios.includes(d) ? d : anios[0])); setHasta((h) => (anios.includes(h) ? h : anios.at(-1)!));
    setAB((b) => (anios.includes(b) ? b : anios.at(-1)!)); setAA((a) => (anios.includes(a) ? a : anios.at(-2) ?? anios[0]));
  }, [anios]);
  useEffect(() => setElegidos(null), [lectura, cargoId]);

  const filas = useMemo(() => (serie ?? []).filter((x) => x.anio >= desde && x.anio <= hasta).map((x) => {
    const s = series(x, lectura), base = Object.values(x.partidos).reduce((a, b) => a + b, 0);
    const o: Record<string, number> = { anio: x.anio };
    for (const [k, v] of Object.entries(s)) o[k] = base ? +((100 * v) / base).toFixed(2) : 0;
    o.__part = x.votos_totales && x.lista_nominal ? +((100 * x.votos_totales) / x.lista_nominal).toFixed(1) : NaN;
    return o;
  }), [serie, desde, hasta, lectura]);
  const claves = useMemo(() => {
    const mx: Record<string, number> = {};
    for (const f of filas) for (const [k, v] of Object.entries(f)) if (k !== "anio" && k !== "__part") mx[k] = Math.max(mx[k] ?? 0, v);
    return Object.entries(mx).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v }));
  }, [filas]);
  const visibles = elegidos ?? claves.filter((x) => x.v >= 5).slice(0, 6).map((x) => x.k);
  function alternar(k: string) { setElegidos((e) => { const b = e ?? visibles; return b.includes(k) ? b.filter((x) => x !== k) : [...b, k]; }); }

  // Año A vs año B
  const rA = serie?.find((x) => x.anio === aA), rB = serie?.find((x) => x.anio === aB);
  const comp = useMemo(() => {
    if (!rA || !rB) return null;
    const sh = (r: Resultado) => { const s = series(r, lectura), b = Object.values(r.partidos).reduce((x, y) => x + y, 0); return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, b ? (100 * v) / b : 0])); };
    const a = sh(rA), b = sh(rB);
    const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? 0) >= 1 || (b[k] ?? 0) >= 1).sort((x, y) => (b[y] ?? 0) - (b[x] ?? 0));
    return { filas: ks.map((k) => ({ k, nombre: etiqueta(k, lectura), A: +(a[k] ?? 0).toFixed(1), B: +(b[k] ?? 0).toFixed(1), d: (b[k] ?? 0) - (a[k] ?? 0) })) };
  }, [rA, rB, lectura]);
  const partA = rA?.votos_totales && rA.lista_nominal ? (100 * rA.votos_totales) / rA.lista_nominal : null;
  const partB = rB?.votos_totales && rB.lista_nominal ? (100 * rB.votos_totales) / rB.lista_nominal : null;
  const iA = rA ? indicadores(porCandidatura(rA.partidos)) : null, iB = rB ? indicadores(porCandidatura(rB.partidos)) : null;
  const lugar = cat ? nombreTerr(terr, cat.estados) : "";
  const tip = { background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 };

  return (
    <>
      <header className="space-y-1.5">
        <p className="label">Resultados</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Evolución y comparación</h1>
        <p className="max-w-3xl" style={{ color: "var(--fg-soft)" }}>Trayectoria histórica de un cargo en un territorio, con el periodo y las fuerzas que elijas, y la comparación directa entre dos elecciones del mismo cargo. Cada elección es independiente: nunca se suman años.</p>
      </header>

      <section className="material p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap gap-2">{CARGOS.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === cargoId} onClick={() => { setCargoId(x.id); setTerr(NAC); }}><x.icon size={14} />{x.nombre}</button>)}</div>
        {cat && <FiltroTerritorio estados={cat.estados} cargo={cargoId} anio={aB || null} valor={terr} onChange={setTerr} />}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <div className="seg" role="group" aria-label="Lectura">{(Object.keys(LECT) as Lectura[]).map((l) => <button key={l} aria-pressed={lectura === l} onClick={() => setLectura(l)} title={LECT[l].d}>{LECT[l].t}</button>)}</div>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{LECT[lectura].d}</p>
        </div>
      </section>

      {!serie ? <Cargando alto={360} /> : serie.length === 0 ? <p className="material p-6">No hay resultados de {c.nombre.toLowerCase()} en {lugar}.</p> : (
        <>
          {/* Línea histórica con periodo y selector de fuerzas */}
          <section className="material p-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="label">{lugar}</p><h2 className="text-xl font-bold pt-1">Trayectoria de {c.nombre.toLowerCase()} · {desde}–{hasta}</h2></div>
              <div className="flex items-end gap-2">
                <label className="space-y-1"><span className="label block">Desde</span>
                  <select className="field !w-auto !py-1.5" value={desde} onChange={(e) => setDesde(Number(e.target.value))}>{anios.filter((a) => a <= hasta).map((a) => <option key={a}>{a}</option>)}</select></label>
                <label className="space-y-1"><span className="label block">Hasta</span>
                  <select className="field !w-auto !py-1.5" value={hasta} onChange={(e) => setHasta(Number(e.target.value))}>{anios.filter((a) => a >= desde).map((a) => <option key={a}>{a}</option>)}</select></label>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fuerzas visibles">
              {claves.slice(0, 16).map(({ k }) => { const on = visibles.includes(k); return (
                <button key={k} className="chip" aria-pressed={false} onClick={() => alternar(k)}
                  style={{ borderColor: on ? colorDe(k, lectura) : undefined, background: on ? `color-mix(in srgb, ${colorDe(k, lectura)} 12%, var(--card-solid))` : undefined, color: on ? "var(--fg)" : "var(--fg-mute)" }}>
                  <span className="grid size-3.5 place-items-center rounded-full" style={{ background: on ? colorDe(k, lectura) : "transparent", border: `1.5px solid ${colorDe(k, lectura)}` }}>{on && <Check size={9} color="#fff" strokeWidth={3} />}</span>
                  {lectura === "candidatura" ? k.toUpperCase() : etiqueta(k, lectura)}
                </button>); })}
            </div>
            <div style={{ height: 360 }}>
              <ResponsiveContainer>
                <LineChart data={filas} margin={{ left: -10, right: 16, top: 8 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="anio" stroke="var(--fg-mute)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--fg-mute)" fontSize={12} unit="%" tickLine={false} axisLine={false} />
                  {aA && aB && aA !== aB && <ReferenceArea x1={Math.min(aA, aB)} x2={Math.max(aA, aB)} fill="var(--accion)" fillOpacity={0.05} />}
                  <Tooltip contentStyle={tip} formatter={(v, n) => [`${v}%`, etiqueta(String(n), lectura)]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => etiqueta(String(v), lectura)} />
                  {visibles.map((k) => <Line key={k} type="linear" dataKey={k} stroke={colorDe(k, lectura)} strokeWidth={2.6} dot={{ r: 3.5 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>% de los votos a partidos de cada elección. Líneas rectas entre elecciones; si una fuerza no compitió en un año, la línea se corta. La franja sombreada marca el par de años que estás comparando abajo.</p>
          </section>

          {/* Año contra año */}
          <section className="material p-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="label">{lugar}</p><h2 className="text-xl font-bold pt-1">Elección contra elección</h2></div>
              <div className="flex items-end gap-2">
                <label className="space-y-1"><span className="label block">Elección A</span>
                  <select className="field !w-auto !py-1.5" value={aA} onChange={(e) => setAA(Number(e.target.value))}>{anios.map((a) => <option key={a}>{a}</option>)}</select></label>
                <ArrowRight size={18} className="mb-2.5" style={{ color: "var(--fg-mute)" }} />
                <label className="space-y-1"><span className="label block">Elección B</span>
                  <select className="field !w-auto !py-1.5" value={aB} onChange={(e) => setAB(Number(e.target.value))}>{anios.map((a) => <option key={a}>{a}</option>)}</select></label>
              </div>
            </div>
            {rA && rB && comp && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Par t="Participación" a={pct(partA)} b={pct(partB)} d={partA !== null && partB !== null ? `${partB - partA >= 0 ? "+" : ""}${(partB - partA).toFixed(1)} pts` : ""} />
                  <Par t="Votos emitidos" a={fmt(rA.votos_totales)} b={fmt(rB.votos_totales)} d={rA.votos_totales && rB.votos_totales ? `${(100 * (rB.votos_totales / rA.votos_totales - 1)).toFixed(1)}%` : ""} />
                  <Par t="Primera fuerza" a={iA?.ganador ? nombreCandidatura(iA.ganador) : "—"} b={iB?.ganador ? nombreCandidatura(iB.ganador) : "—"} ca={iA?.ganador ? colorPartido(iA.ganador) : undefined} cb={iB?.ganador ? colorPartido(iB.ganador) : undefined} />
                  <Par t="Margen de victoria" a={iA?.margen != null ? `${iA.margen.toFixed(1)} pts` : "—"} b={iB?.margen != null ? `${iB.margen.toFixed(1)} pts` : "—"} />
                </div>
                <div className="grid xl:grid-cols-[1.4fr_1fr] gap-5">
                  <div style={{ height: Math.max(220, comp.filas.length * 46) }}>
                    <ResponsiveContainer>
                      <BarChart data={comp.filas} layout="vertical" margin={{ left: 8, right: 24 }} barGap={2} barCategoryGap="22%">
                        <CartesianGrid stroke="var(--line)" horizontal={false} />
                        <XAxis type="number" unit="%" stroke="var(--fg-mute)" fontSize={12} tickLine={false} />
                        <YAxis type="category" dataKey="nombre" width={190} stroke="var(--fg-mute)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tip} formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="A" name={`${aA} (claro)`} fill="#cbd5e1" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {comp.filas.map((f) => <Cell key={f.k} fill={`color-mix(in srgb, ${colorDe(f.k, lectura)} 35%, var(--card-solid))`} />)}
                        </Bar>
                        <Bar dataKey="B" name={`${aB} (intenso)`} fill="#64748b" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {comp.filas.map((f) => <Cell key={f.k} fill={colorDe(f.k, lectura)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-auto">
                    <table className="t">
                      <thead><tr><th>Fuerza</th><th>{aA}</th><th>{aB}</th><th>Cambio</th></tr></thead>
                      <tbody>{[...comp.filas].sort((x, y) => y.d - x.d).map((f) => (
                        <tr key={f.k}><td><span className="inline-block size-2.5 rounded-full mr-2" style={{ background: colorDe(f.k, lectura) }} /><b>{lectura === "candidatura" ? f.k.toUpperCase() : f.nombre}</b></td>
                          <td>{f.A.toFixed(1)}%</td><td>{f.B.toFixed(1)}%</td>
                          <td className="font-bold" style={{ color: f.d >= 0 ? "var(--azul)" : "var(--rose)" }}>{f.d >= 0 ? "▲ +" : "▼ "}{f.d.toFixed(1)} pts</td></tr>))}</tbody>
                    </table>
                    <p className="text-xs pt-2" style={{ color: "var(--fg-mute)" }}>Cambio en puntos porcentuales de B respecto de A. {terr.seccion ? "En una sección, el número puede corresponder a otra geografía si hubo reseccionamiento." : ""}{terr.distrito ? "Los distritos solo se comparan dentro del mismo mapa distrital." : ""}</p>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Par({ t, a, b, d, ca, cb }: { t: string; a: string; b: string; d?: string; ca?: string; cb?: string }) {
  return (
    <div className="material p-4 space-y-1.5">
      <p className="label">{t}</p>
      <p className="text-sm font-semibold" style={{ color: ca ?? "var(--fg-mute)" }}>{a}</p>
      <p className="display text-xl font-bold leading-tight" style={{ color: cb ?? "var(--fg)" }}>{b}</p>
      {d && <p className="text-xs font-bold" style={{ color: d.startsWith("-") ? "var(--rose)" : "var(--azul)" }}>{d}</p>}
    </div>
  );
}
