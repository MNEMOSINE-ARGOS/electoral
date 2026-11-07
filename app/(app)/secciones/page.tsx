"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { MarcaPrep, AvisoSiPrep } from "@/components/Prep";
import { Territorio, type Sel } from "@/components/Territorio";
import { Buscador } from "@/components/Buscador";
import { BotonLimpiar } from "@/components/FiltroTerritorio";
import { EstrategiaSecciones } from "@/components/EstrategiaSecciones";
import { PerfilParticipacion } from "@/components/PerfilParticipacion";
import { PerfilCenso } from "@/components/PerfilCenso";
import { BookOpen, Target } from "lucide-react";
import { Cargando, Kpi } from "@/components/Kpi";
import { Piramide } from "@/components/Piramide";
import { EdadSeccion } from "@/components/EdadSeccion";
import { TendenciaSeccion } from "@/components/TendenciaSeccion";
import { BLOQUES, ENFOQUES, ETIQ_CLASE, clasesDe, nombreCandidatura, type Clase } from "@/lib/analisis";
import { CeldaClase, useEnfoque } from "@/components/Enfoque";
import { Ayuda } from "@/components/Ayuda";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";

type Sec = {
  seccion_id: number; seccion: number; votos_totales: number | null; lista_nominal: number | null; participacion: number | null; ganador: string | null; p_ganador: number | null;
  nep: number | null; ganador_bloque: string | null; margen_bloque: number | null; clase: Clase | null; margen_enfoque: number | null; p_enfoque: number | null; bloques: Record<string, number>;
  prev: { anio: number; ganador: string | null; familia: string | null; participacion: number | null } | null; cambio_ganador: boolean | null; mujeres_pct: number | null; edad_media: number | null; pct_18_29: number | null; pct_65: number | null; anteriores: { anio: number; ganador: string | null; pct: number | null; segundo: string | null; pct2: number | null }[]; confianza: string | null; confiable: boolean;
  tendencia: { veredicto: string; r_nac: number | null; intensidad: string | null } | null;
};
type Resp = { anios_anteriores: number[]; anio_anterior: number | null; corte_lista_nominal: string | null; corte_edad: string | null; secciones: Sec[]; resumen: { total: number; clases: Record<string, number>; ganadores: Record<string, number>; bloques: Record<string, number>; cambiaron: number; comparables: number; participacion: number | null; tendencia?: Record<string, number> } | null };
type Ficha = {
  seccion_id: number; seccion: number; municipio: { nombre: string } | null; aviso: string; corte_edad: string | null; grupos: string[]; piramide: { h: number[]; m: number[]; nb: number } | null;
  genealogia?: { origenes: { seccion: number; tipo: "division" | "fusion" | "parcial"; anio: number | null }[]; destinos: number[] };
  historia: { eleccion: string; anio: number; primero: Lugar | null; segundo: Lugar | null; margen: number | null; votos_totales: number | null; lista_nominal: number | null; participacion: number | null }[];
};
type Lugar = { candidatura: string; votos: number; pct: number };
const ORDEN_FICHA = ["presidente", "senado", "diputados_federales", "gobernador", "diputados_locales_mr", "alcaldes"];
const TEND: Record<string, { t: string; c: string }> = { sigue: { t: "Sigue al país", c: "var(--azul)" }, parcial: { t: "Parcial", c: "#d97706" }, independiente: { t: "Independiente", c: "var(--rose)" }, sin_datos: { t: "Sin datos", c: "var(--fg-mute)" } };
const CARGOS = ["diputados_federales", "presidente", "senado", "alcaldes", "diputados_locales_mr", "gobernador"];

export default function Secciones() {
  const cat = useCatalogo();
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const ultimo = useRef("");
  const [modo, setModo] = useState<"municipio" | "distrito">("municipio");
  const [eleccion, setEleccion] = useState("diputados_federales");
  const [anio, setAnio] = useState<number | null>(null);
  const [sel, setSel] = useState<Sel>({ estado: 5, municipio: 5035 });
  const [distritos, setDistritos] = useState<{ id_distrito: number; n: number }[]>([]);
  const [distrito, setDistrito] = useState(0);
  const [d, setD] = useState<Resp | null>(null);
  const [clase, setClase] = useState<string>("");
  const [secSel, setSecSel] = useState(0);
  const [vista, setVista] = useState<"lectura" | "estrategia">("lectura");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState("");

  const local = eleccion.startsWith("diputados_locales");
  // Parámetros de enlace (desde «Distritos»)
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("distrito")) { setModo("distrito"); setEleccion(p.get("eleccion") || "diputados_federales"); setSel({ estado: Number(p.get("estado")), municipio: 0 }); setDistrito(Number(p.get("distrito"))); setAnio(Number(p.get("anio"))); }
  }, []);
  const anios = useMemo(() => (cat?.elecciones ?? []).filter((e) => e.eleccion === eleccion && !e.extraordinaria && e.anio >= (local || eleccion === "gobernador" || eleccion === "alcaldes" ? 2015 : 1994)).map((e) => e.anio).filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => b - a), [cat, eleccion, local]);
  useEffect(() => { if (anios.length && (anio === null || !anios.includes(anio))) setAnio(anios[0]); }, [anios, anio]);
  useEffect(() => {
    if (modo !== "distrito" || !sel.estado || anio === null) { setDistritos([]); return; }
    api<{ distritos: { id_distrito: number; n: number }[] }>(`/api/distritos?eleccion=${eleccion}&anio=${anio}&estado=${sel.estado}`).then((r) => { setDistritos(r.distritos); setDistrito((x) => (r.distritos.some((y) => y.id_distrito === x) ? x : (r.distritos[0]?.id_distrito ?? 0))); });
  }, [modo, sel.estado, eleccion, anio]);
  useEffect(() => {
    if (anio === null) return;
    const territorio = modo === "municipio" ? (sel.municipio ? `municipio=${sel.municipio}` : "") : distrito ? `distrito=${distrito}` : "";
    if (!territorio) { setD(null); return; }
    // Cambiar solo el enfoque conserva la sección elegida; cambiar territorio o elección la limpia
    const clave = `${eleccion}|${anio}|${territorio}`;
    setD(null); setError(""); setClase("");
    if (clave !== ultimo.current) { setSecSel(0); ultimo.current = clave; }
    api<Resp>(`/api/secciones?eleccion=${eleccion}&anio=${anio}&${territorio}&enfoque=${enfoque}`).then(setD).catch((e) => setError(e.message));
  }, [modo, sel.municipio, distrito, eleccion, anio, enfoque]);

  async function abrir(id: number) { setFicha(null); setFicha(await api<Ficha>(`/api/seccion?id=${id}`)); }
  const filas = (d?.secciones ?? []).filter((s) => (!clase || s.clase === clase) && (!secSel || s.seccion_id === secSel));
  const r = d?.resumen;
  const filtrado = !!(clase || secSel);
  // Con filtros activos, indicadores, bloques y el perfil de edad se calculan solo con las secciones filtradas
  const rf = useMemo(() => {
    if (!r) return null;
    if (!filtrado) return r;
    const o = { total: filas.length, clases: {} as Record<string, number>, ganadores: {} as Record<string, number>, bloques: {} as Record<string, number>, cambiaron: 0, comparables: 0, participacion: null as number | null };
    let vt = 0, ln = 0;
    for (const x of filas) {
      if (x.clase) o.clases[x.clase] = (o.clases[x.clase] ?? 0) + 1;
      if (x.ganador_bloque) o.ganadores[x.ganador_bloque] = (o.ganadores[x.ganador_bloque] ?? 0) + 1;
      for (const [b, v] of Object.entries(x.bloques)) o.bloques[b] = (o.bloques[b] ?? 0) + v;
      if (x.cambio_ganador !== null) { o.comparables++; if (x.cambio_ganador) o.cambiaron++; }
      vt += x.votos_totales ?? 0; ln += x.lista_nominal ?? 0;
    }
    o.participacion = ln ? +((100 * vt) / ln).toFixed(1) : null;
    return o;
  }, [r, filas, filtrado]);
  const totB = rf ? Object.values(rf.bloques).reduce((a, b) => a + b, 0) : 0;
  // Estado inicial de la pantalla (Torreón, diputaciones federales, el año más reciente): «Limpiar filtros» regresa aquí
  const sucio = eleccion !== "diputados_federales" || modo !== "municipio" || sel.estado !== 5 || sel.municipio !== 5035 || !!distrito || !!clase || !!secSel
    || vista !== "lectura" || (anio !== null && anios.length > 0 && anio !== anios[0]);
  function limpiar() {
    setEleccion("diputados_federales"); setAnio(null); setModo("municipio"); setSel({ estado: 5, municipio: 5035 }); setDistrito(0);
    setClase(""); setSecSel(0); setVista("lectura"); setFicha(null);
  }

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Lectura por sección</h1>
        <p style={{ color: "var(--fg-soft)" }}>Radiografía de cada sección dentro de un municipio o un distrito: quién ganó, por cuánto, qué tan reñida es, participación, composición por sexo y si cambió de ganador frente a la elección anterior del mismo cargo.</p>
      </header>
      <section className="material p-4 space-y-3">
        <div className="flex justify-end -mb-1"><BotonLimpiar visible={sucio} onClick={limpiar} /></div>
        <div className="flex flex-wrap gap-2">{CARGOS.map((t) => <button key={t} className="chip" aria-pressed={t === eleccion} onClick={() => { setEleccion(t); setAnio(null); if (t.startsWith("diputados") === false) setModo("municipio"); }}>{nombreEleccion[t] ?? t}</button>)}</div>
        <div className="flex flex-wrap gap-2">{anios.map((a) => <button key={a} className="chip" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}<MarcaPrep eleccion={eleccion} anio={a} /></button>)}</div>
        <AvisoSiPrep eleccion={eleccion} anio={anio} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Demarcación">
          <button className="chip" aria-pressed={modo === "municipio"} onClick={() => setModo("municipio")}>Por municipio</button>
          {(eleccion === "diputados_federales" || eleccion === "presidente" || local) && <button className="chip" aria-pressed={modo === "distrito"} onClick={() => setModo("distrito")}>Por distrito {local ? "local" : "federal"}</button>}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          {cat && <Territorio estados={cat.estados} valor={sel} onChange={(s) => setSel(s)} permiteNacional={false} conMunicipio={modo === "municipio"} />}
          {modo === "distrito" && <Buscador etiqueta={local ? "Distrito local" : "Distrito federal"} ancho="w-56" todos={null} valor={distrito} placeholder="Escribe el número…"
            opciones={distritos.map((x) => ({ valor: x.id_distrito, etiqueta: `Distrito ${x.n}` }))} onChange={(v) => setDistrito(v)} />}
        </div>
      </section>

      {error && <p role="alert" style={{ color: "var(--bad)" }}>{error}</p>}
      {!d && !error && (modo === "distrito" ? !!distrito : !!sel.municipio) && <Cargando alto={320} />}
      {d && r && anio && (
        <div className="seg" role="tablist" aria-label="Vista">
          <button role="tab" aria-pressed={vista === "lectura"} onClick={() => setVista("lectura")}><BookOpen size={14} className="inline -mt-0.5 mr-1.5" />Lectura de {anio}</button>
          <button role="tab" aria-pressed={vista === "estrategia"} onClick={() => setVista("estrategia")}><Target size={14} className="inline -mt-0.5 mr-1.5" />Comparación y estrategia</button>
        </div>
      )}
      {d && r && anio && vista === "estrategia" && cat && (
        <EstrategiaSecciones eleccion={eleccion} anio={anio} municipio={modo === "municipio" ? sel.municipio : 0} distrito={modo === "distrito" ? distrito : 0}
          elecciones={cat.elecciones} estado={sel.estado} />
      )}
      {d && !r && <p className="material p-6">No hay resultados por sección para esta combinación. Prueba otro año o cargo.</p>}
      {d && r && vista === "lectura" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi titulo="Secciones" valor={String(rf!.total)} nota={filtrado ? `de ${r.total} (con filtro)` : undefined} acento />
            <Kpi ayuda="participacion" titulo="Participación" valor={pct(rf!.participacion)} nota="votos entre lista nominal" />
            <Kpi ayuda="cambio_ganador" titulo="Cambiaron de ganador" valor={rf!.comparables ? pct((100 * rf!.cambiaron) / rf!.comparables, 0) : "—"} nota={d.anio_anterior ? `contra ${d.anio_anterior} (${rf!.comparables} comparables)` : "sin elección anterior"} />
            {enfoque === "general" ? <Kpi ayuda="reñidas" titulo="Muy reñidas" valor={String(rf!.clases["reñida"] ?? 0)} nota="margen menor a 5 puntos" />
              : <Kpi ayuda="competitividad_enfoque" titulo={`Reñidas para ${enf.t}`} valor={String((rf!.clases["reñida_gana"] ?? 0) + (rf!.clases["reñida_pierde"] ?? 0))} nota={`gana ${rf!.clases["reñida_gana"] ?? 0} · pierde ${rf!.clases["reñida_pierde"] ?? 0} (por menos de 5 pts)`} />}
          </div>
          <section className="material p-4 space-y-3">
            <p className="label">Fuerza por bloque (votos a partidos, suma de secciones)</p>
            <div className="flex h-4 rounded-full overflow-hidden">{Object.entries(rf!.bloques).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} style={{ width: `${(100 * v) / totB}%`, background: BLOQUES[k]?.color }} title={`${BLOQUES[k]?.nombre}: ${pct((100 * v) / totB)}`} />)}</div>
            <div className="flex flex-wrap gap-4 text-sm">{Object.entries(rf!.bloques).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k}><b style={{ color: BLOQUES[k]?.color }}>{pct((100 * v) / totB)}</b> {BLOQUES[k]?.nombre} · gana en {rf!.ganadores[k] ?? 0} secc.</span>)}</div>
            {(() => { const t: Record<string, number> = {}; for (const x of filas) if (x.tendencia) t[x.tendencia.veredicto] = (t[x.tendencia.veredicto] ?? 0) + 1; const n = (t.sigue ?? 0) + (t.parcial ?? 0) + (t.independiente ?? 0); return n ? (
              <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Frente al país (todas sus elecciones): {(["sigue", "parcial", "independiente"] as const).map((k, i) => <span key={k}>{i ? " · " : ""}<b style={{ color: TEND[k].c }}>{TEND[k].t}</b> {t[k] ?? 0} ({pct((100 * (t[k] ?? 0)) / n, 0)})</span>)}{t.sin_datos ? ` · sin datos ${t.sin_datos}` : ""}</p>) : null; })()}
            <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filtrar por competitividad">
              <Buscador etiqueta="Sección" ancho="w-56" todos="Todas" valor={secSel}
                opciones={(d?.secciones ?? []).map((x) => ({ valor: x.seccion_id, etiqueta: String(x.seccion) }))}
                onChange={(v) => setSecSel(v)} />
              <button className="chip self-end" aria-pressed={!clase} onClick={() => setClase("")}>Todas</button>
              {enfoque !== "general" && <span className="text-sm font-bold self-end pb-1.5" style={{ color: enf.color }}>Desde {enf.t}:</span>}
              {clasesDe(enfoque).filter((c) => enfoque === "general" || r.clases[c.k]).map((c) => <button key={c.k} className="chip" aria-pressed={clase === c.k} onClick={() => setClase(c.k)} title={c.d}>{c.t} · {r.clases[c.k] ?? 0}</button>)}
            </div>
          </section>
          {!!secSel && <EdadSeccion seccionId={secSel} corteInicial={d.corte_edad} />}
          {!!secSel && <TendenciaSeccion seccionId={secSel} />}
          {anio && <PerfilParticipacion secciones={filas} universo={(d?.secciones ?? []).filter((s) => !clase || s.clase === clase)} resaltar={secSel} onElegir={setSecSel} corte={d.corte_edad} anio={anio} filtro={filtrado ? [clase ? ETIQ_CLASE[clase as Clase].t : "", secSel ? `sección ${secSel % 10000}` : ""].filter(Boolean).join(" · ") : ""} />}
          {anio && sel.estado > 0 && <PerfilCenso secciones={(d?.secciones ?? []).filter((s) => !clase || s.clase === clase)} estado={sel.estado} anio={anio} resaltar={secSel} onElegir={setSecSel}
            nombreEstado={cat?.estados.find((e) => e.id_estado === sel.estado)?.nombre_corto ?? "el estado"} />}
          <section className="material p-4 overflow-auto max-h-[560px]">
            <table className="t">
              <thead><tr><th>Sección</th><th>Ganador</th><th>Bloque<Ayuda clave="bloque" /></th><th>Margen<Ayuda clave="margen" /></th><th>{enfoque === "general" ? <>Clase<Ayuda clave="competitividad" /></> : <>Clase · <span style={{ color: enf.color }}>{enf.t}</span><Ayuda clave="competitividad_enfoque" /></>}</th><th>Particip.<Ayuda clave="participacion" /></th><th>Lista nominal</th><th>% mujeres<Ayuda clave="mujeres" /></th><th>Edad media<Ayuda clave="edad_media" /></th><th>18–29<Ayuda clave="jovenes" /></th><th>65+<Ayuda clave="mayores" /></th>{(d.anios_anteriores ?? []).map((a) => <th key={a}>Ganó en {a}</th>)}<th>Continuidad<Ayuda clave="continuidad" /></th><th >Frente al país<Ayuda clave="frente_al_pais" /></th></tr></thead>
              <tbody>
                {filas.map((s) => (
                  <tr key={s.seccion_id} style={{ cursor: "pointer" }} onClick={() => abrir(s.seccion_id)} title="Ver ficha de la sección">
                    <td className="font-bold">{s.seccion}{!s.confiable && " ⚠"}</td>
                    <td><span style={{ color: s.ganador ? colorPartido(s.ganador) : undefined, fontWeight: 700 }}>{s.ganador ? nombreCandidatura(s.ganador) : "—"}</span> {pct(s.p_ganador)}</td>
                    <td style={{ color: s.ganador_bloque ? BLOQUES[s.ganador_bloque]?.color : undefined, fontWeight: 600 }}>{s.ganador_bloque ? BLOQUES[s.ganador_bloque]?.nombre : "—"}</td>
                    <td>{s.margen_bloque === null ? "—" : s.margen_bloque.toFixed(1)}</td>
                    <td><CeldaClase clase={s.clase} margenEnfoque={s.margen_enfoque} pEnfoque={s.p_enfoque} /></td>
                    <td>{pct(s.participacion)}</td><td>{fmt(s.lista_nominal)}</td><td>{pct(s.mujeres_pct)}</td><td>{s.edad_media?.toFixed(1) ?? "—"}</td><td>{pct(s.pct_18_29)}</td><td>{pct(s.pct_65)}</td>
                    {(d.anios_anteriores ?? []).map((a) => { const x = s.anteriores?.find((y) => y.anio === a); return (
                      <td key={a} className="whitespace-nowrap">{x?.ganador ? <><span className="font-semibold" style={{ color: colorPartido(x.ganador) }}>{nombreCandidatura(x.ganador)}</span> <span className="num">{x.pct?.toFixed(1)}%</span>
                        {x.segundo && <span className="block text-[11px]" style={{ color: "var(--fg-mute)" }}>2º {nombreCandidatura(x.segundo)} {x.pct2?.toFixed(1)}%</span>}</> : <span style={{ color: "var(--fg-mute)" }}>sin dato</span>}</td>); })}
                    <td>{(() => {
                      // Continuidad en las tres elecciones (actual + dos anteriores): ¿la misma fuerza ganó todas?
                      const ks = [s.ganador, ...(s.anteriores ?? []).map((y) => y.ganador)].filter(Boolean) as string[];
                      if (ks.length < 2) return <span style={{ color: "var(--fg-mute)" }}>—</span>;
                      const comun = ks.map((k) => new Set(k.split("-"))).reduce((a, b2) => new Set([...a].filter((t) => b2.has(t))));
                      return comun.size ? <span className="font-semibold" style={{ color: "var(--azul)" }}>Misma fuerza{ks.length === 3 ? " 3 veces" : ""}</span> : <b style={{ color: "var(--rose)" }}>Alternancia</b>;
                    })()}</td>
                    <td className="whitespace-nowrap">{s.tendencia ? <span style={{ color: TEND[s.tendencia.veredicto]?.c, fontWeight: 700 }}>{TEND[s.tendencia.veredicto]?.t}{s.tendencia.r_nac !== null && s.tendencia.veredicto !== "sin_datos" && <span className="num font-normal" style={{ color: "var(--fg-mute)" }}> {s.tendencia.r_nac.toFixed(2)}</span>}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs pt-2" style={{ color: "var(--fg-mute)" }}>Lista nominal por sexo del corte {d.corte_lista_nominal ?? "—"} (el más cercano anterior a la jornada; no existe antes de 2017). «Ganó en …»: ganador (y segundo lugar) de las dos elecciones anteriores del mismo cargo, por candidatura. «Continuidad»: «Misma fuerza» si hay un partido presente en todos los ganadores; «Alternancia» si no; «Frente al país»: si los cambios de la sección entre elecciones del mismo cargo siguen los del país (correlación; detalle al elegir la sección); margen y clase se miden entre las dos candidaturas más votadas (con partido de enfoque, la clase se mide desde su candidatura contra la mejor rival: % del partido y ventaja + o desventaja −); participación mayor a 100% ocurre donde hay casilla especial (votan personas de otras secciones); una sección que no existía antes queda «sin comparación». ⚠ = la sección no es confiable (no territorial o fuera del catálogo).</p>
          </section>
        </>
      )}

      {ficha && (
        <div className="fixed inset-0 z-50 grid place-items-center p-3" style={{ background: "rgba(2,6,23,.45)" }} onClick={() => setFicha(null)}>
          <div className="material w-full max-w-3xl max-h-[90vh] overflow-auto p-5 space-y-4" style={{ background: "var(--card-solid)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold">Sección {ficha.seccion}</h2><p style={{ color: "var(--fg-soft)" }}>{ficha.municipio?.nombre ?? ""}</p>
              {ficha.genealogia && (ficha.genealogia.origenes.length > 0 || ficha.genealogia.destinos.length > 0) && (
                <p className="text-xs pt-1" style={{ color: "var(--fg-mute)" }}>
                  {ficha.genealogia.origenes.filter((o) => o.tipo === "division").map((o) => `Nació${o.anio ? ` en ${o.anio}` : ""} de la división de la sección ${o.seccion}. `).join("")}
                  {ficha.genealogia.origenes.filter((o) => o.tipo === "fusion").map((o) => `Absorbió a la sección ${o.seccion}${o.anio ? ` (${o.anio})` : ""}. `).join("")}
                  {ficha.genealogia.origenes.filter((o) => o.tipo === "parcial").map((o) => `Recibió parte de la sección ${o.seccion}${o.anio ? ` (${o.anio})` : ""}. `).join("")}
                  {ficha.genealogia.destinos.length > 0 && `Ya no existe: su territorio pasó a ${ficha.genealogia.destinos.length === 1 ? "la sección" : "las secciones"} ${ficha.genealogia.destinos.join(", ")}. `}
                  Fuente: histórico de secciones del INE.
                </p>)}</div>
              <button className="btn btn-ghost" onClick={() => setFicha(null)} aria-label="Cerrar"><X size={16} /></button></div>
            {ficha.piramide ? <div><p className="label pb-2">Lista nominal por edad y sexo · corte {ficha.corte_edad}</p><Piramide grupos={ficha.grupos} h={ficha.piramide.h} m={ficha.piramide.m} nb={ficha.piramide.nb} /></div> : <p className="text-sm" style={{ color: "var(--fg-mute)" }}>Sin lista nominal por edad para esta sección (puede ser una sección nueva o ya inexistente).</p>}
            <div className="space-y-4">
              <div><p className="label">Historial electoral de la sección</p><p className="text-xs pt-0.5" style={{ color: "var(--fg-mute)" }}>Por candidatura (cada partido sumado a la coalición que lo postuló); porcentajes sobre los votos a candidaturas.</p></div>
              {ORDEN_FICHA.filter((e) => ficha.historia.some((h) => h.eleccion === e)).map((e) => (
                <div key={e} className="space-y-1.5">
                  <h3 className="text-base font-bold flex items-center gap-2"><span className="inline-block h-4 w-1 rounded-full" style={{ background: "var(--accion)" }} />{nombreEleccion[e] ?? e}</h3>
                  <div className="overflow-auto"><table className="t">
                    <thead><tr><th>Año</th><th>1er lugar</th><th>2º lugar</th><th>Margen</th><th>Votos</th><th>Participación</th></tr></thead>
                    <tbody>{ficha.historia.filter((h) => h.eleccion === e).sort((a, b) => b.anio - a.anio).map((h) => (
                      <tr key={h.anio}>
                        <td className="font-bold">{h.anio}</td>
                        <td>{h.primero ? <><span className="font-bold" style={{ color: colorPartido(h.primero.candidatura) }}>{nombreCandidatura(h.primero.candidatura)}</span> <span className="num">{h.primero.pct.toFixed(1)}%</span></> : "—"}</td>
                        <td>{h.segundo ? <><span className="font-semibold" style={{ color: colorPartido(h.segundo.candidatura) }}>{nombreCandidatura(h.segundo.candidatura)}</span> <span className="num">{h.segundo.pct.toFixed(1)}%</span></> : "—"}</td>
                        <td className="num">{h.margen !== null ? `${h.margen.toFixed(1)} pts` : "—"}</td>
                        <td className="num">{fmt(h.votos_totales)}</td>
                        <td className="num">{h.participacion !== null ? pct(h.participacion, 0) : "—"}</td>
                      </tr>))}</tbody>
                  </table></div>
                </div>
              ))}
            </div>
            <TendenciaSeccion seccionId={ficha.seccion_id} />
            <p className="text-xs" style={{ color: "var(--warn)" }}>{ficha.aviso} Cada fila es una elección distinta; no se suman.</p>
          </div>
        </div>
      )}
    </>
  );
}
