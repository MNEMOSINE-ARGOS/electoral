"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Check } from "lucide-react";
import { api, type Resultado } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { Cargando } from "@/components/Kpi";
import { ElegirDetalle, FiltroTerritorio, SIN_FILTRO, claveTerr, nombreCorto, nombreTerr, territorios, type FiltroT, type Terr } from "@/components/FiltroTerritorio";
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
/** % de los votos a partidos de cada fuerza en una elección, según la lectura */
function porcentajes(r: Resultado, l: Lectura): Record<string, number> {
  const s = series(r, l), b = Object.values(r.partidos).reduce((x, y) => x + y, 0);
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, b ? (100 * v) / b : 0]));
}
const participacion = (r?: Resultado) => (r?.votos_totales && r.lista_nominal ? (100 * r.votos_totales) / r.lista_nominal : null);
const consulta = (cargoId: string, t: Terr, ref: number) => new URLSearchParams({ eleccion: cargoId, estado: String(t.estado), municipio: String(t.municipio), distrito: String(t.distrito), seccion: String(t.seccion), anio_ref: String(ref || 0) });

export default function Historico() {
  const cat = useCatalogo();
  const [cargoId, setCargoId] = useState<CargoId>("presidente");
  const et = (a: number) => String(a); // el año va solo, sin «PREP» (decisión del usuario)
  const [filtro, setFiltro] = useState<FiltroT>(SIN_FILTRO);
  const [iDet, setIDet] = useState(0);
  const ts = useMemo(() => territorios(filtro, cat?.estados ?? []), [filtro, cat]);
  const terr = ts[Math.min(iDet, ts.length - 1)];
  const claveTs = ts.map(claveTerr).join("|");
  // Con dos o más territorios: la serie de cada uno (cada territorio es su propia serie; nunca se suman)
  const [lado, setLado] = useState<Record<string, Resultado[]> | null>(null);
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
    api<{ elecciones: Resultado[] }>(`/api/presidencial?${consulta(cargoId, terr, aB)}`).then((d) => setSerie(d.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length))).catch(() => setSerie([]));
  }, [cargoId, claveTerr(terr)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ts.length < 2) { setLado(null); return; }
    let vivo = true;
    setLado(null);
    Promise.all(ts.map((t) => api<{ elecciones: Resultado[] }>(`/api/presidencial?${consulta(cargoId, t, aB)}`)
      .then((d) => [claveTerr(t), d.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length)] as const)
      .catch(() => [claveTerr(t), [] as Resultado[]] as const)))
      .then((r) => { if (vivo) setLado(Object.fromEntries(r)); });
    return () => { vivo = false; };
  }, [cargoId, claveTs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setIDet(0), [claveTs]);

  // Años: con varios territorios, la unión de los años de todas las series
  const anios = useMemo(() => (lado ? [...new Set(Object.values(lado).flatMap((s) => s.map((x) => x.anio)))].sort((a, b) => a - b) : (serie ?? []).map((x) => x.anio)), [serie, lado]);
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
    const a = porcentajes(rA, lectura), b = porcentajes(rB, lectura);
    const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? 0) >= 1 || (b[k] ?? 0) >= 1).sort((x, y) => (b[y] ?? 0) - (b[x] ?? 0));
    return { filas: ks.map((k) => ({ k, nombre: etiqueta(k, lectura), A: +(a[k] ?? 0).toFixed(1), B: +(b[k] ?? 0).toFixed(1), d: (b[k] ?? 0) - (a[k] ?? 0) })) };
  }, [rA, rB, lectura]);
  const partA = participacion(rA), partB = participacion(rB);
  const iA = rA ? indicadores(porCandidatura(rA.partidos)) : null, iB = rB ? indicadores(porCandidatura(rB.partidos)) : null;
  const lugar = cat ? nombreTerr(terr, cat.estados) : "";

  // Lado a lado: líneas por territorio (misma lectura, periodo y fuerzas) y A contra B con una columna por territorio
  const ladoFilas = useMemo(() => !lado ? [] : ts.map((t) => ({ t, filas: (lado[claveTerr(t)] ?? []).filter((x) => x.anio >= desde && x.anio <= hasta).map((x) => {
    const o: Record<string, number> = { anio: x.anio };
    for (const [k, v] of Object.entries(porcentajes(x, lectura))) o[k] = +v.toFixed(2);
    return o;
  }) })), [lado, ts, desde, hasta, lectura]);
  const ladoAB = useMemo(() => {
    if (!lado) return null;
    const cols = ts.map((t) => {
      const s = lado[claveTerr(t)] ?? [], a = s.find((x) => x.anio === aA), b = s.find((x) => x.anio === aB);
      return { t, a: a ? porcentajes(a, lectura) : null, b: b ? porcentajes(b, lectura) : null, pa: participacion(a), pb: participacion(b) };
    });
    const ks = [...new Set(cols.flatMap((c) => [...Object.keys(c.a ?? {}), ...Object.keys(c.b ?? {})]))]
      .filter((k) => cols.some((c) => (c.a?.[k] ?? 0) >= 1 || (c.b?.[k] ?? 0) >= 1))
      .sort((x, y) => Math.max(...cols.map((c) => c.b?.[y] ?? 0)) - Math.max(...cols.map((c) => c.b?.[x] ?? 0)));
    return { cols, ks };
  }, [lado, ts, aA, aB, lectura]);
  const tip = { background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 };

  return (
    <>
      <header className="space-y-1.5">
        <p className="label">Resultados</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Evolución y comparación</h1>
        <p className="max-w-3xl" style={{ color: "var(--fg-soft)" }}>Trayectoria histórica de un cargo en un territorio, con el periodo y las fuerzas que elijas, y la comparación directa entre dos elecciones del mismo cargo. Cada elección es independiente: nunca se suman años.</p>
      </header>

      <section className="material p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap gap-2">{CARGOS.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === cargoId} onClick={() => { setCargoId(x.id); setFiltro(SIN_FILTRO); }}><x.icon size={14} />{x.nombre}</button>)}</div>
        {cat && <FiltroTerritorio estados={cat.estados} cargo={cargoId} anio={aB || null} valor={filtro} onChange={setFiltro} />}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <div className="seg" role="group" aria-label="Lectura">{(Object.keys(LECT) as Lectura[]).map((l) => <button key={l} aria-pressed={lectura === l} onClick={() => setLectura(l)} title={LECT[l].d}>{LECT[l].t}</button>)}</div>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{LECT[lectura].d}</p>
        </div>
      </section>

      {ts.length > 1 && cat && (
        !lado ? <Cargando alto={300} /> : (
          <section className="material p-5 space-y-4">
            <div><p className="label">Lado a lado · {ts.length} territorios</p><h2 className="text-xl font-bold pt-1">Trayectoria de {c.nombre.toLowerCase()} · {desde}–{hasta}</h2></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {ladoFilas.map(({ t, filas: fs }) => (
                <div key={claveTerr(t)} className="rounded-xl p-3 space-y-1 min-w-0" style={{ border: "1px solid var(--line)" }}>
                  <p className="text-sm font-bold truncate" title={nombreTerr(t, cat.estados)}>{nombreCorto(t, cat.estados)}</p>
                  {fs.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: "var(--fg-mute)" }}>Sin resultados en el periodo</p> : (
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer>
                        <LineChart data={fs} margin={{ left: -18, right: 8, top: 6 }}>
                          <CartesianGrid stroke="var(--line)" vertical={false} />
                          <XAxis dataKey="anio" stroke="var(--fg-mute)" fontSize={11} tickLine={false} />
                          <YAxis stroke="var(--fg-mute)" fontSize={11} unit="%" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={tip} formatter={(v, n) => [`${v}%`, etiqueta(String(n), lectura)]} />
                          {visibles.map((k) => <Line key={k} type="linear" dataKey={k} stroke={colorDe(k, lectura)} strokeWidth={2.2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />)}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{visibles.map((k) => <span key={k} className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: colorDe(k, lectura) }} />{etiqueta(k, lectura)}</span>)}</div>
            {ladoAB && aA !== aB && (
              <div className="overflow-x-auto">
                <p className="label pb-1.5">Elección {aA} contra {aB} · cambio en puntos</p>
                <table className="t">
                  <thead><tr><th>Fuerza</th>{ladoAB.cols.map(({ t }) => <th key={claveTerr(t)}>{nombreCorto(t, cat.estados)}</th>)}</tr></thead>
                  <tbody>
                    {ladoAB.ks.map((k) => (
                      <tr key={k}>
                        <td className="whitespace-nowrap"><span className="inline-block size-2.5 rounded-full mr-2" style={{ background: colorDe(k, lectura) }} /><b>{lectura === "candidatura" ? k.toUpperCase() : etiqueta(k, lectura)}</b></td>
                        {ladoAB.cols.map(({ t, a, b }) => {
                          if (!a || !b) return <td key={claveTerr(t)} style={{ color: "var(--fg-mute)" }}>sin {!a ? aA : aB}</td>;
                          const va = a[k] ?? 0, vb = b[k] ?? 0, d = vb - va;
                          return (
                            <td key={claveTerr(t)} className="whitespace-nowrap"><span className="num text-xs" style={{ color: "var(--fg-mute)" }}>{va.toFixed(1)} → {vb.toFixed(1)}%</span>{" "}
                              <b style={{ color: d >= 0 ? "var(--azul)" : "var(--rose)" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</b></td>);
                        })}
                      </tr>
                    ))}
                    <tr><td className="label">Participación</td>{ladoAB.cols.map(({ t, pa, pb }) => (
                      <td key={claveTerr(t)} className="whitespace-nowrap">{pa !== null && pb !== null ? <><span className="num text-xs" style={{ color: "var(--fg-mute)" }}>{pa.toFixed(1)} → {pb.toFixed(1)}%</span>{" "}
                        <b style={{ color: pb - pa >= 0 ? "var(--azul)" : "var(--rose)" }}>{pb - pa >= 0 ? "+" : ""}{(pb - pa).toFixed(1)}</b></> : "—"}</td>))}</tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Cada territorio es su propia serie: sus votos nunca se suman entre territorios ni entre años. % de los votos a partidos de cada elección, con la misma lectura, periodo, fuerzas y elecciones A y B que se eligen abajo. Un territorio sin esa elección queda «sin» ese año; un distrito solo se compara dentro de su mapa distrital y una sección puede haber cambiado de geografía entre años (reseccionamiento).</p>
          </section>
        )
      )}
      {cat && <ElegirDetalle ts={ts} i={Math.min(iDet, ts.length - 1)} onChange={setIDet} estados={cat.estados} />}

      {!serie ? <Cargando alto={360} /> : serie.length === 0 ? <p className="material p-6">No hay resultados de {c.nombre.toLowerCase()} en {lugar}.</p> : (
        <>
          {/* Línea histórica con periodo y selector de fuerzas */}
          <section className="material p-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="label">{lugar}</p><h2 className="text-xl font-bold pt-1">Trayectoria de {c.nombre.toLowerCase()} · {desde}–{hasta}</h2></div>
              <div className="flex items-end gap-2">
                <label className="space-y-1"><span className="label block">Desde</span>
                  <select className="field !w-auto !py-1.5" value={desde} onChange={(e) => setDesde(Number(e.target.value))}>{anios.filter((a) => a <= hasta).map((a) => <option key={a} value={a}>{et(a)}</option>)}</select></label>
                <label className="space-y-1"><span className="label block">Hasta</span>
                  <select className="field !w-auto !py-1.5" value={hasta} onChange={(e) => setHasta(Number(e.target.value))}>{anios.filter((a) => a >= desde).map((a) => <option key={a} value={a}>{et(a)}</option>)}</select></label>
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
                  <select className="field !w-auto !py-1.5" value={aA} onChange={(e) => setAA(Number(e.target.value))}>{anios.map((a) => <option key={a} value={a}>{et(a)}</option>)}</select></label>
                <ArrowRight size={18} className="mb-2.5" style={{ color: "var(--fg-mute)" }} />
                <label className="space-y-1"><span className="label block">Elección B</span>
                  <select className="field !w-auto !py-1.5" value={aB} onChange={(e) => setAB(Number(e.target.value))}>{anios.map((a) => <option key={a} value={a}>{et(a)}</option>)}</select></label>
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
