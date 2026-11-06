"use client";
import { useEffect, useMemo, useState } from "react";
import { Mars, Venus, Info, X } from "lucide-react";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { Cargando } from "@/components/Kpi";
import { MapaEstados } from "@/components/MapaEstados";
import { fmt, pct } from "@/lib/format";

type Cargo = { eleccion: string; estados: number; oficinas: number; personas_votaron: number; lista_nominal: number; votos_totales: number; nulos: number; recuadros: number; candidaturas: number; ambitos: number; mujeres: number; hombres: number };
type Ambito = { ambito: string; id_estado: number; candidaturas: string; votos: string; materia: string | null };
type Cand = { candidatura_id: string; nombre: string | null; no_candidato: string; genero: string | null; materia: string | null; poder_postulante: string | null; cancelada: boolean; votos: string; lugar: number; pct_ambito: string; votos_oficiales: string | null; candidaturas_ambito: number };

const FED: { id: string; nombre: string; ambito: string; marcas: string }[] = [
  { id: "judicial_scjn", nombre: "Suprema Corte", ambito: "Nacional · 9 ministraturas", marcas: "hasta 9 marcas por persona" },
  { id: "judicial_tribunal_disciplina", nombre: "Tribunal de Disciplina", ambito: "Nacional · 5 magistraturas", marcas: "hasta 5 marcas" },
  { id: "judicial_tepjf_sala_superior", nombre: "TEPJF · Sala Superior", ambito: "Nacional · 2 magistraturas", marcas: "hasta 2 marcas" },
  { id: "judicial_tepjf_sala_regional", nombre: "TEPJF · Salas Regionales", ambito: "Por circunscripción (5)", marcas: "varias marcas" },
  { id: "judicial_tribunales_colegiados", nombre: "Magistraturas de circuito", ambito: "Por circuito y distrito judicial", marcas: "varias marcas" },
  { id: "judicial_juzgados_distrito", nombre: "Juzgados de distrito", ambito: "Por circuito y distrito judicial", marcas: "varias marcas" },
];
const LOC: Record<string, string> = { judicial_local_jueces: "Jueces locales", judicial_local_magistrados: "Magistraturas locales", judicial_local_presidencia_tsj: "Presidencia del TSJ" };
const PODER: Record<string, string> = { PE: "Ejecutivo", PL: "Legislativo", PJ: "Judicial", EF: "En funciones" };
const nacional = (e: string) => ["judicial_scjn", "judicial_tribunal_disciplina", "judicial_tepjf_sala_superior"].includes(e);

export default function Judicial() {
  const cat = useCatalogo();
  const [res, setRes] = useState<{ cargos: Cargo[]; locales: { id_estado: number; eleccion: string; oficinas: string }[] } | null>(null);
  const [eleccion, setEleccion] = useState("judicial_scjn");
  const [estado, setEstado] = useState(0);
  const [ambitos, setAmbitos] = useState<Ambito[] | null>(null);
  const [ambito, setAmbito] = useState<string>("Nacional");
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [mapa, setMapa] = useState<{ id_estado: number; personas_votaron: string; lista_nominal: string }[] | null>(null);
  const [ficha, setFicha] = useState<{ candidato: Cand & { eleccion: string; ambito: string }; estados: { id_estado: number; votos: string; votos_totales: string }[] } | null>(null);

  useEffect(() => { api<typeof res>("/api/judicial?vista=resumen").then(setRes); }, []);
  const local = eleccion.startsWith("judicial_local");
  useEffect(() => {
    setAmbitos(null); setCands(null);
    if (nacional(eleccion)) { setAmbitos([]); setAmbito("Nacional"); return; }
    if ((local || eleccion !== "judicial_tepjf_sala_regional") && !estado) { setAmbitos([]); return; }
    api<{ ambitos: Ambito[] }>(`/api/judicial?vista=ambitos&eleccion=${eleccion}&estado=${eleccion === "judicial_tepjf_sala_regional" ? 0 : estado}`).then((d) => {
      setAmbitos(d.ambitos); setAmbito(d.ambitos[0]?.ambito ?? "");
    });
  }, [eleccion, estado, local]);
  useEffect(() => {
    if (!ambito) { setCands([]); return; }
    setCands(null);
    const est = nacional(eleccion) || eleccion === "judicial_tepjf_sala_regional" ? 0 : estado;
    api<{ candidatos: Cand[] }>(`/api/judicial?vista=candidatos&eleccion=${eleccion}&ambito=${encodeURIComponent(ambito)}&estado=${est}`).then((d) => setCands(d.candidatos));
  }, [eleccion, ambito, estado]);
  useEffect(() => { setMapa(null); api<{ estados: typeof mapa }>(`/api/judicial?vista=estados&eleccion=${eleccion}`).then((d) => setMapa(d.estados)); }, [eleccion]);

  const cargo = res?.cargos.find((c) => c.eleccion === eleccion);
  const scjn = res?.cargos.find((c) => c.eleccion === "judicial_scjn");
  const nombres = useMemo(() => Object.fromEntries((cat?.estados ?? []).map((e) => [e.id_estado, e.nombre_corto])), [cat]);
  const estadosLocales = useMemo(() => [...new Set((res?.locales ?? []).filter((l) => l.eleccion === eleccion).map((l) => l.id_estado))], [res, eleccion]);

  const { colores, titulos } = useMemo(() => {
    const colores: Record<number, string> = {}, titulos: Record<number, string> = {};
    for (const f of mapa ?? []) {
      const p = Number(f.lista_nominal) ? (100 * Number(f.personas_votaron)) / Number(f.lista_nominal) : 0;
      colores[f.id_estado] = `color-mix(in srgb, #7c3aed ${Math.round(12 + 88 * Math.min(1, Math.max(0, (p - 6) / 18)))}%, var(--card-solid))`;
      titulos[f.id_estado] = `${nombres[f.id_estado] ?? f.id_estado}: participación ${pct(p)}`;
    }
    return { colores, titulos };
  }, [mapa, nombres]);
  const genero = useMemo(() => {
    let m = 0, h = 0;
    for (const c of cands ?? []) { if (c.genero === "M") m += Number(c.votos); else if (c.genero === "H") h += Number(c.votos); }
    return { m, h };
  }, [cands]);
  const maxV = Math.max(1, ...(cands ?? []).map((c) => Number(c.votos)));

  async function abrir(c: Cand) { setFicha(await api(`/api/judicial?vista=candidato&id=${encodeURIComponent(c.candidatura_id)}`)); }

  return (
    <>
      <header className="space-y-1.5">
        <p className="label">Poder Judicial</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Elección judicial 2025</h1>
        <p className="max-w-3xl" style={{ color: "var(--fg-soft)" }}>Primera elección por voto popular de jueces, magistraturas y ministraturas (1 de junio de 2025). Se vota por <b>personas</b>, no por partidos, y cada elector marca varias candidaturas: por eso la participación se mide con personas que votaron, y los votos no se comparan con elecciones partidistas ni se suman entre cargos.</p>
      </header>

      {!res ? <Cargando alto={120} /> : scjn && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <K t="Participación nacional" v={pct((100 * scjn.personas_votaron) / scjn.lista_nominal)} n="personas que votaron / lista nominal (boleta de la SCJN)" acento />
          <K t="Personas que votaron" v={fmt(scjn.personas_votaron)} n={`de ${fmt(scjn.lista_nominal)} en la lista`} />
          <K t="Votos nulos (SCJN)" v={pct((100 * scjn.nulos) / scjn.votos_totales)} n="de las marcas registradas" />
          <K t="Recuadros sin usar (SCJN)" v={pct((100 * scjn.recuadros) / scjn.votos_totales)} n="marcas permitidas que no se usaron" />
        </section>
      )}

      <section className="space-y-2">
        <p className="label">Cargos federales</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {FED.map((f) => { const c = res?.cargos.find((x) => x.eleccion === f.id); return (
            <button key={f.id} className="tarjeta-btn" aria-pressed={eleccion === f.id} onClick={() => { setEleccion(f.id); setEstado(0); }}>
              <p className="font-bold text-sm">{f.nombre}</p><p className="text-xs" style={{ color: "var(--fg-mute)" }}>{f.ambito}</p>
              {c && <p className="text-xs pt-2 num"><b>{fmt(c.candidaturas)}</b> candidaturas · {pct((100 * c.personas_votaron) / c.lista_nominal)}</p>}
            </button>); })}
        </div>
        <p className="label pt-2">Cargos locales (19 entidades)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(LOC).map(([id, nom]) => <button key={id} className="chip" aria-pressed={eleccion === id} onClick={() => { setEleccion(id); setEstado(0); }}>{nom}</button>)}
        </div>
      </section>

      <section className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
        <div className="material p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="label">{cargo ? `${fmt(cargo.candidaturas)} candidaturas · ${fmt(cargo.ambitos)} ámbitos` : ""}</p>
              <h2 className="text-xl font-bold pt-1">{FED.find((f) => f.id === eleccion)?.nombre ?? LOC[eleccion]}{ambito && ambito !== "Nacional" ? ` · ${ambito}` : ""}</h2></div>
            <div className="flex flex-wrap gap-2">
              {!nacional(eleccion) && eleccion !== "judicial_tepjf_sala_regional" && (
                <select className="field !w-auto !py-1.5 text-sm" value={estado} onChange={(e) => setEstado(Number(e.target.value))} aria-label="Entidad">
                  <option value={0}>Elige entidad…</option>
                  {(local ? estadosLocales : (cat?.estados ?? []).map((e) => e.id_estado)).map((id) => <option key={id} value={id}>{nombres[id]}</option>)}
                </select>)}
              {ambitos && ambitos.length > 1 && (
                <select className="field !w-auto !py-1.5 text-sm max-w-xs" value={ambito} onChange={(e) => setAmbito(e.target.value)} aria-label="Ámbito">
                  {ambitos.map((a) => <option key={a.ambito + a.id_estado} value={a.ambito}>{a.ambito}{a.materia ? ` · ${a.materia}` : ""} ({a.candidaturas})</option>)}
                </select>)}
            </div>
          </div>
          {!nacional(eleccion) && eleccion !== "judicial_tepjf_sala_regional" && !estado ? <p style={{ color: "var(--fg-mute)" }}>Elige una entidad para ver sus circuitos y distritos judiciales{local ? " (solo las 19 entidades con elección judicial local en la fuente)" : ""}.</p>
            : !cands ? <Cargando alto={300} /> : cands.length === 0 ? <p>Sin candidaturas.</p> : (
              <>
                {(genero.m + genero.h > 0) && (
                  <div className="flex items-center gap-4 rounded-2xl p-3" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
                    <span className="flex items-center gap-1.5" style={{ color: "var(--mujer)" }}><Venus size={22} /><b className="text-lg">{pct((100 * genero.m) / (genero.m + genero.h))}</b></span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden flex"><div style={{ width: `${(100 * genero.m) / (genero.m + genero.h)}%`, background: "var(--mujer)" }} /><div className="flex-1" style={{ background: "var(--hombre)" }} /></div>
                    <span className="flex items-center gap-1.5" style={{ color: "var(--hombre)" }}><b className="text-lg">{pct((100 * genero.h) / (genero.m + genero.h))}</b><Mars size={22} /></span>
                    <span className="text-xs" style={{ color: "var(--fg-mute)" }}>de los votos, por género de la candidatura</span>
                  </div>)}
                <div className="overflow-auto max-h-[620px] space-y-1">
                  {cands.map((c) => (
                    <button key={c.candidatura_id} onClick={() => abrir(c)} className="w-full text-left grid grid-cols-[2.2rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 transition-[background-color,transform] duration-100 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] active:scale-[.995]">
                      <span className="text-center font-bold num" style={{ color: "var(--fg-mute)" }}>{c.lugar}</span>
                      <span className="min-w-0 space-y-1">
                        <span className="flex items-center gap-2 text-sm font-semibold truncate">
                          {c.genero === "M" ? <Venus size={15} style={{ color: "var(--mujer)" }} /> : c.genero === "H" ? <Mars size={15} style={{ color: "var(--hombre)" }} /> : null}
                          <span className="truncate">{c.nombre ?? `Candidatura ${c.no_candidato}`}</span>
                          {c.cancelada && <span className="text-[10px] font-bold px-1.5 rounded" style={{ background: "var(--rose-soft)", color: "var(--rose-deep)" }}>CANCELADA</span>}
                        </span>
                        <span className="block h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>
                          <span className="block h-full rounded-full" style={{ width: `${(100 * Number(c.votos)) / maxV}%`, background: c.genero === "M" ? "var(--mujer)" : c.genero === "H" ? "var(--hombre)" : "#7c3aed" }} /></span>
                        <span className="flex flex-wrap gap-1.5 text-[11px]" style={{ color: "var(--fg-mute)" }}>
                          {c.materia && <span>{c.materia}</span>}
                          {c.poder_postulante && <span>{c.materia ? "· " : ""}postula {c.poder_postulante.split("-").map((p) => PODER[p] ?? p).join(", ")}</span>}
                        </span>
                      </span>
                      <span className="text-right num"><b className="text-sm">{fmt(Number(c.votos))}</b><br /><span className="text-xs" style={{ color: "var(--fg-mute)" }}>{Number(c.pct_ambito).toFixed(2)}%</span></span>
                    </button>
                  ))}
                </div>
                <p className="text-xs flex gap-2" style={{ color: "var(--fg-mute)" }}><Info size={14} className="shrink-0 mt-0.5" /><span>El orden es por votos dentro del ámbito; <b>no es la lista oficial de ganadores</b>, que aplica número de vacantes, paridad de género y especialidad. Cómputo distrital del INE al 9 de junio de 2025, antes de impugnaciones.</span></p>
              </>
            )}
        </div>
        <div className="material p-5 space-y-3">
          <div><p className="label">Participación por entidad</p><h2 className="text-lg font-bold pt-1">Personas que votaron / lista nominal</h2></div>
          {mapa ? <MapaEstados colores={colores} titulos={titulos} seleccion={estado ? [estado] : []} onClick={(id) => !nacional(eleccion) && setEstado(id)} /> : <Cargando alto={300} />}
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Color más intenso = mayor participación. {nacional(eleccion) ? "" : "Toca una entidad para ver sus ámbitos."}</p>
        </div>
      </section>

      {ficha?.candidato && (
        <div className="fixed inset-0 z-50 grid place-items-center p-3" style={{ background: "rgba(2,6,23,.45)" }} onClick={() => setFicha(null)}>
          <div className="material w-full max-w-2xl max-h-[88vh] overflow-auto p-5 space-y-4 entra" style={{ background: "var(--card-solid)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="label">{FED.find((f) => f.id === ficha.candidato.eleccion)?.nombre ?? LOC[ficha.candidato.eleccion]} · {ficha.candidato.ambito}</p>
                <h2 className="text-2xl font-bold pt-1">{ficha.candidato.nombre ?? ficha.candidato.no_candidato}</h2>
                <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Lugar {ficha.candidato.lugar} de {ficha.candidato.candidaturas_ambito} · {fmt(Number(ficha.candidato.votos))} votos ({Number(ficha.candidato.pct_ambito).toFixed(2)}% del ámbito)</p></div>
              <button className="btn btn-ghost" onClick={() => setFicha(null)} aria-label="Cerrar"><X size={16} /></button>
            </div>
            {ficha.estados.length > 1 && (
              <table className="t"><thead><tr><th>Entidad</th><th>Votos</th><th>% de las marcas de la entidad</th></tr></thead>
                <tbody>{[...ficha.estados].sort((a, b) => Number(b.votos) - Number(a.votos)).map((e) => <tr key={e.id_estado}><td>{nombres[e.id_estado]}</td><td>{fmt(Number(e.votos))}</td><td>{pct(Number(e.votos_totales) ? (100 * Number(e.votos)) / Number(e.votos_totales) : null, 2)}</td></tr>)}</tbody></table>)}
            {ficha.candidato.votos_oficiales && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Total oficial publicado por el INE (RESULTADOS): {fmt(Number(ficha.candidato.votos_oficiales))}.</p>}
          </div>
        </div>
      )}
    </>
  );
}

function K({ t, v, n, acento }: { t: string; v: string; n?: string; acento?: boolean }) {
  return (
    <div className="material p-4 space-y-1">
      <p className="label">{t}</p>
      <p className="display text-[1.7rem] font-bold num" style={{ color: acento ? "#7c3aed" : "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
