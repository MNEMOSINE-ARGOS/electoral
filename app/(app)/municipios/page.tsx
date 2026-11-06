"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, type Municipio, type Resultado } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { Territorio, type Sel } from "@/components/Territorio";
import { Cargando } from "@/components/Kpi";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";

type Serie = { clave: string; nivel: string; id: number; anio: number; nombre: string; resultado: Resultado | null };

export default function Comparar() {
  const cat = useCatalogo();
  const [eleccion, setEleccion] = useState("alcaldes");
  const [sel, setSel] = useState<Sel>({ estado: 0, municipio: 0 });
  const [anio, setAnio] = useState<number | null>(null);
  const [specs, setSpecs] = useState<string[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [busca, setBusca] = useState("");
  const [hallados, setHallados] = useState<Municipio[]>([]);
  const [cargando, setCargando] = useState(false);

  const tipos = useMemo(() => [...new Set((cat?.elecciones ?? []).map((e) => e.eleccion))], [cat]);
  const anios = useMemo(() => (cat?.elecciones ?? []).filter((e) => e.eleccion === eleccion).map((e) => e.anio), [cat, eleccion]);
  const aniosU = [...new Set(anios)].sort((a, b) => b - a);
  useEffect(() => { if (aniosU.length && (anio === null || !aniosU.includes(anio))) setAnio(aniosU[0]); }, [aniosU.join(), anio]); // eslint-disable-line
  useEffect(() => { setSpecs([]); setSeries([]); }, [eleccion]);
  useEffect(() => {
    if (busca.trim().length < 2) { setHallados([]); return; }
    const t = setTimeout(() => api<{ municipios: Municipio[] }>(`/api/municipios?buscar=${encodeURIComponent(busca)}`).then((d) => setHallados(d.municipios)), 250);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => {
    if (!specs.length) { setSeries([]); return; }
    setCargando(true);
    api<{ series: Serie[] }>(`/api/comparar?eleccion=${eleccion}&s=${specs.join(",")}`).then((d) => setSeries(d.series)).finally(() => setCargando(false));
  }, [specs, eleccion]);

  function agregar(nivel: "estado" | "municipio", id: number) {
    if (!anio || !id) return;
    const s = `${nivel}:${id}:${anio}`;
    setSpecs((x) => (x.includes(s) || x.length >= 6 ? x : [...x, s]));
  }
  const partidos = useMemo(() => {
    const t = new Map<string, number>();
    for (const s of series) { const r = s.resultado; if (!r) continue; const b = Object.values(r.partidos).reduce((a, c) => a + c, 0); for (const [p, v] of Object.entries(r.partidos)) t.set(p, Math.max(t.get(p) ?? 0, (100 * v) / b)); }
    return [...t.entries()].filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => p);
  }, [series]);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Comparar territorios</h1>
        <p style={{ color: "var(--fg-soft)" }}>Compara el mismo tipo de elección (alcaldes con alcaldes, gobernador con gobernador…) entre municipios, estados o años distintos. Hasta 6 series.</p>
      </header>
      <section className="material p-4 space-y-4">
        <div className="flex flex-wrap gap-2">{tipos.map((t) => <button key={t} className="chip" aria-pressed={t === eleccion} onClick={() => setEleccion(t)}>{nombreEleccion[t] ?? t}</button>)}</div>
        <div className="flex flex-wrap gap-2">{aniosU.map((a) => <button key={a} className="chip" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}</button>)}</div>
        {cat && <Territorio estados={cat.estados} valor={sel} onChange={setSel} permiteNacional={false} />}
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!sel.estado || !anio} onClick={() => (sel.municipio ? agregar("municipio", sel.municipio) : agregar("estado", sel.estado))}><Plus size={16} />Agregar {sel.municipio ? "municipio" : "estado"} {anio}</button>
        </div>
        <div className="space-y-1"><span className="label">o buscar municipio por nombre</span>
          <input className="field" placeholder="Torreón, Saltillo, Guadalajara…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {hallados.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{hallados.map((m) => <button key={m.clave_inegi} className="chip" onClick={() => { agregar("municipio", m.clave_inegi); setBusca(""); }}>{m.nombre} ({m.abreviatura})</button>)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {specs.map((s) => { const x = series.find((z) => z.clave === s); return (
            <span key={s} className="chip" style={{ cursor: "default" }}>{x?.nombre ?? s} · {s.split(":")[2]}
              <button aria-label="Quitar" onClick={() => setSpecs((l) => l.filter((y) => y !== s))}><X size={14} /></button></span>); })}
        </div>
      </section>

      {cargando && <Cargando />}
      {series.length > 0 && !cargando && (
        <section className="material p-4 overflow-x-auto">
          <table className="t">
            <thead><tr><th>Partido</th>{series.map((s) => <th key={s.clave}>{s.nombre}<br />{s.anio}</th>)}</tr></thead>
            <tbody>
              {partidos.map((p) => (
                <tr key={p}><td style={{ color: colorPartido(p), fontWeight: 700 }}>{p}</td>
                  {series.map((s) => { const r = s.resultado; const b = r ? Object.values(r.partidos).reduce((a, c) => a + c, 0) : 0; const v = r?.partidos[p];
                    return <td key={s.clave}>{v ? <><b>{pct((100 * v) / b)}</b> <span style={{ color: "var(--fg-mute)" }}>{fmt(v)}</span></> : "—"}</td>; })}</tr>
              ))}
              <tr><td className="label">Votos totales</td>{series.map((s) => <td key={s.clave}>{fmt(s.resultado?.votos_totales)}</td>)}</tr>
              <tr><td className="label">Participación</td>{series.map((s) => <td key={s.clave}>{pct(s.resultado?.lista_nominal && s.resultado.votos_totales ? (100 * s.resultado.votos_totales) / s.resultado.lista_nominal : null)}</td>)}</tr>
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
