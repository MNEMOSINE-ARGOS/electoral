"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { MarcaPrep, AvisoSiPrep } from "@/components/Prep";
import { Cargando, Confianza } from "@/components/Kpi";
import { BLOQUES, ENFOQUES, nombreCandidatura, porBloque, porCandidatura, type Clase } from "@/lib/analisis";
import { CeldaClase, ResumenClases, useEnfoque } from "@/components/Enfoque";
import { Ayuda } from "@/components/Ayuda";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";

type Dist = {
  id_distrito: number; n: number; id_estado: number; secciones: number; votos_totales: number | null; lista_nominal: number | null; participacion: number | null; confianza: string | null;
  ganador: string | null; p_ganador: number | null; segundo: string | null; margen: number | null; nep: number | null; ganador_bloque: string | null; margen_bloque: number | null; clase: Clase | null; margen_enfoque: number | null; p_enfoque: number | null; partidos: Record<string, number>;
};
type Circ = { circunscripcion: number; cabecera: string; estados: string; votos_totales: number | null; lista_nominal: number | null; partidos: Record<string, number> };
type Hist = { anio: number; votos_totales: number | null; lista_nominal: number | null; secciones: number; confianza: string | null; partidos: Record<string, number> };

// Cada cargo se lee en su propia demarcación: diputados federales por distrito (RP por circunscripción), diputados locales por distrito local,
// presidente por distrito solo como lectura territorial. El senado se elige por entidad: se ve en «Mapa de estados».
const CARGOS = ["diputados_federales", "presidente", "diputados_locales_mr"] as const;

export default function Distritos() {
  const cat = useCatalogo();
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const [eleccion, setEleccion] = useState<string>("diputados_federales");
  const [anio, setAnio] = useState<number | null>(null);
  const [estado, setEstado] = useState(0);
  const [lista, setLista] = useState<Dist[] | null>(null);
  const [circ, setCirc] = useState<{ circunscripciones: Circ[]; aviso: string } | null>(null);
  const [sel, setSel] = useState<Dist | null>(null);
  const [hist, setHist] = useState<{ historia: Hist[]; municipios: { clave_inegi: number; nombre: string; secciones: string; votos_totales: string }[]; aviso: string } | null>(null);

  const local = eleccion.startsWith("diputados_locales");
  const anios = useMemo(() => (cat?.elecciones ?? []).filter((e) => e.eleccion === eleccion && !e.extraordinaria && e.anio >= (local ? 2015 : 1994)).map((e) => e.anio).filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => b - a), [cat, eleccion, local]);
  useEffect(() => { if (anios.length && (anio === null || !anios.includes(anio))) setAnio(anios[0]); }, [anios, anio]);
  useEffect(() => {
    if (anio === null) return;
    setLista(null); setSel(null); setHist(null);
    api<{ distritos: Dist[] }>(`/api/distritos?eleccion=${eleccion}&anio=${anio}${estado ? `&estado=${estado}` : ""}&enfoque=${enfoque}`).then((d) => setLista(d.distritos));
  }, [eleccion, anio, estado, enfoque]);
  useEffect(() => {
    if (anio === null || local) { setCirc(null); return; }
    api<{ circunscripciones: Circ[]; aviso: string }>(`/api/circunscripciones?eleccion=${eleccion}&anio=${anio}`).then(setCirc);
  }, [eleccion, anio, local]);
  useEffect(() => {
    if (!sel || anio === null) return;
    setHist(null);
    api<typeof hist>(`/api/distrito?eleccion=${eleccion}&anio=${anio}&id=${sel.id_distrito}`).then(setHist);
  }, [sel, eleccion, anio]);

  const estados = cat?.estados ?? [];
  const nombreEst = (id: number) => estados.find((e) => e.id_estado === id)?.abreviatura ?? String(id);
  const resumen = useMemo(() => {
    const g: Record<string, number> = {}, c: Record<string, number> = {};
    for (const d of lista ?? []) { if (d.ganador_bloque) g[d.ganador_bloque] = (g[d.ganador_bloque] ?? 0) + 1; if (d.clase) c[d.clase] = (c[d.clase] ?? 0) + 1; }
    return { g, c };
  }, [lista]);

  const serieHist = useMemo(() => (hist?.historia ?? []).map((h) => {
    const b = porBloque(h.partidos, h.anio), t = Object.values(b).reduce((x, y) => x + y, 0);
    const o: Record<string, number | string> = { anio: h.anio };
    for (const [k, v] of Object.entries(b)) o[k] = t ? +((100 * v) / t).toFixed(1) : 0;
    return o;
  }), [hist]);
  const bloquesHist = useMemo(() => [...new Set(serieHist.flatMap((r) => Object.keys(r).filter((k) => k !== "anio")))], [serieHist]);

  return (
    <>
      <header className="space-y-1">
        <p className="label">Territorio</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Distritos y circunscripciones</h1>
        <p style={{ color: "var(--fg-soft)" }}>Cada cargo se lee en su demarcación: diputados federales por distrito (300) y, para la lista plurinominal, por circunscripción (5); diputados locales por distrito local; presidente por distrito solo como lectura territorial. El Senado se elige por entidad (ver «Resultados por cargo» o «Mapa nacional»).</p>
      </header>
      <section className="material p-4 space-y-3">
        <div className="flex flex-wrap gap-2">{CARGOS.map((t) => <button key={t} className="chip" aria-pressed={t === eleccion} onClick={() => { setEleccion(t); setAnio(null); }}>{nombreEleccion[t]}{t === "presidente" ? " (por distrito)" : ""}</button>)}</div>
        <div className="flex flex-wrap gap-2">{anios.map((a) => <button key={a} className="chip" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}<MarcaPrep eleccion={eleccion} anio={a} /></button>)}</div>
        <AvisoSiPrep eleccion={eleccion} anio={anio} />
        <label className="space-y-1 block max-w-xs"><span className="label">Estado</span>
          <select className="field" value={estado} onChange={(e) => setEstado(Number(e.target.value))}><option value={0}>{local ? "Elige un estado" : "Todos"}</option>{estados.map((e) => <option key={e.id_estado} value={e.id_estado}>{e.nombre_corto}</option>)}</select></label>
        {local && !estado && <p className="text-sm" style={{ color: "var(--warn)" }}>Los distritos locales son de cada estado y los años de elección varían por estado: elige un estado.</p>}
      </section>

      {circ && circ.circunscripciones.length > 0 && !estado && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Circunscripciones plurinominales · {anio}</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
            {circ.circunscripciones.map((c) => {
              const b = porBloque(c.partidos, anio!), t = Object.values(b).reduce((x, y) => x + y, 0);
              return (
                <div key={c.circunscripcion} className="material p-4 space-y-2">
                  <p className="label">{c.circunscripcion}ª · {c.cabecera}</p>
                  <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{c.estados}</p>
                  <div className="flex h-3 rounded-full overflow-hidden" role="img" aria-label="Reparto por bloque">{Object.entries(b).sort((x, y) => y[1] - x[1]).map(([k, v]) => <div key={k} style={{ width: `${(100 * v) / t}%`, background: BLOQUES[k]?.color }} title={`${BLOQUES[k]?.nombre}: ${pct((100 * v) / t)}`} />)}</div>
                  {Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => <p key={k} className="text-xs flex justify-between"><span style={{ color: BLOQUES[k]?.color, fontWeight: 700 }}>{BLOQUES[k]?.nombre}</span><b>{pct((100 * v) / t)}</b></p>)}
                  <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Participación {pct(c.lista_nominal && c.votos_totales ? (100 * c.votos_totales) / c.lista_nominal : null)}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{circ.aviso} La circunscripción reparte los diputados de RP; no tiene boleta propia.</p>
        </section>
      )}

      {!lista ? <Cargando alto={360} /> : lista.length === 0 ? <p className="material p-6">Sin distritos para esta elección{local && !estado ? " (elige un estado)" : ""}.</p> : (
        <>
          <section className="material p-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(resumen.g).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k}><b style={{ color: BLOQUES[k]?.color }}>{n}</b> {BLOQUES[k]?.nombre}</span>)}
              <span style={{ color: "var(--fg-mute)" }}>·</span>
              <ResumenClases conteo={resumen.c} />
            </div>
            <div className="overflow-auto max-h-[460px]">
              <table className="t">
                <thead><tr><th>Distrito</th><th>Ganador</th><th>Bloque</th><th>Margen (pts)<Ayuda clave="margen" /></th><th>{enfoque === "general" ? <>Competitividad<Ayuda clave="competitividad" /></> : <>Competitividad · <span style={{ color: enf.color }}>{enf.t}</span><Ayuda clave="competitividad_enfoque" /></>}</th><th>Fuerzas que compiten<Ayuda clave="nep" /></th><th>Participación<Ayuda clave="participacion" /></th><th>Secciones</th><th /></tr></thead>
                <tbody>
                  {lista.map((d) => (
                    <tr key={d.id_distrito} style={{ background: sel?.id_distrito === d.id_distrito ? "var(--rose-soft)" : undefined, cursor: "pointer" }} onClick={() => setSel(d)}>
                      <td className="font-bold">{nombreEst(d.id_estado)}-{d.n}</td>
                      <td><span style={{ color: d.ganador ? colorPartido(d.ganador) : undefined, fontWeight: 700 }}>{d.ganador ? nombreCandidatura(d.ganador) : "—"}</span> {pct(d.p_ganador)}</td>
                      <td>{d.ganador_bloque && <span style={{ color: BLOQUES[d.ganador_bloque]?.color, fontWeight: 600 }}>{BLOQUES[d.ganador_bloque]?.nombre}</span>}</td>
                      <td>{d.margen_bloque === null ? "—" : d.margen_bloque.toFixed(1)}</td>
                      <td><CeldaClase clase={d.clase} margenEnfoque={d.margen_enfoque} pEnfoque={d.p_enfoque} /></td>
                      <td>{d.nep ? d.nep.toFixed(1) : "—"}</td><td>{pct(d.participacion)}</td><td>{d.secciones}</td>
                      <td><Link className="chip" href={`/secciones?eleccion=${eleccion}&anio=${anio}&distrito=${d.id_distrito}&estado=${d.id_estado}`} onClick={(e) => e.stopPropagation()}>Secciones</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Ganador = candidatura más votada (cada partido sumado a la coalición que lo postuló en ese distrito, inferida de la boleta); margen y competitividad se miden entre las dos primeras candidaturas (con un partido de enfoque, la competitividad se mide desde su candidatura contra la mejor rival). El bloque es la agrupación analítica del ganador. Los votos de la sección 0 (extranjero, voto anticipado) no se asignan a ningún distrito.</p>
          </section>

          {sel && (
            <section className="material p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Distrito {nombreEst(sel.id_estado)}-{sel.n} · {anio}</h2><Confianza nivel={sel.confianza} /></div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  {Object.entries(porCandidatura(sel.partidos)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, v]) => { const t = Object.values(sel.partidos).reduce((x, y) => x + y, 0); return (
                    <div key={p} className="text-xs"><div className="flex justify-between"><b>{nombreCandidatura(p)}</b><span>{fmt(v)} · {pct((100 * v) / t)}</span></div>
                      <div className="h-2 rounded-full" style={{ background: "var(--rose-soft)" }}><div className="h-2 rounded-full" style={{ width: `${(100 * v) / t}%`, background: colorPartido(p) }} /></div></div>); })}
                </div>
                <div className="space-y-2">
                  <p className="label">Municipios que lo integran</p>
                  <div className="max-h-44 overflow-auto text-sm space-y-0.5">{(hist?.municipios ?? []).map((m) => <p key={m.clave_inegi} className="flex justify-between"><span>{m.nombre ?? m.clave_inegi}</span><span style={{ color: "var(--fg-mute)" }}>{m.secciones} secc. · {fmt(Number(m.votos_totales))}</span></p>)}</div>
                </div>
              </div>
              {hist && serieHist.length > 1 && (
                <>
                  <p className="label">Historia del distrito por bloque (mismo mapa distrital)</p>
                  <div style={{ height: 240 }}><ResponsiveContainer><LineChart data={serieHist}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="anio" stroke="var(--fg-mute)" fontSize={12} /><YAxis unit="%" stroke="var(--fg-mute)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--line)", borderRadius: 12 }} formatter={(v) => `${v}%`} /><Legend />
                    {bloquesHist.map((b) => <Line key={b} dataKey={b} name={BLOQUES[b]?.nombre ?? b} stroke={BLOQUES[b]?.color} strokeWidth={2.4} dot={{ r: 3 }} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div>
                </>
              )}
              {hist && <p className="text-xs" style={{ color: "var(--warn)" }}>{hist.aviso}</p>}
            </section>
          )}
        </>
      )}
    </>
  );
}

