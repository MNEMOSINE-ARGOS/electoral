"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight, MapPin, Scale, Search } from "lucide-react";
import { Buscador, type Opcion } from "@/components/Buscador";
import { SeccionesInline } from "@/components/SeccionesInline";
import { BotonLimpiar } from "@/components/FiltroTerritorio";
import { api, type Resultado } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { MarcaPrep, AvisoSiPrep } from "@/components/Prep";
import { Cargando, Confianza } from "@/components/Kpi";
import { Barra, Waffle } from "@/components/Waffle";
import { CARGOS, cargo as cargoDe, type CargoId } from "@/lib/cargos";
import { alcance, colorPartido } from "@/lib/partidos";
import { BLOQUES, ENFOQUES, ETIQ_CLASE, clasesDe, type Clase, indicadores, nombreCandidatura, pedersen, porBloque, porCandidatura, porFamilia } from "@/lib/analisis";
import { useEnfoque } from "@/components/Enfoque";
import { PisoTecho } from "@/components/PisoTecho";
import { Ayuda } from "@/components/Ayuda";
import { fmt, pct } from "@/lib/format";

type Unidad = {
  id: number; id_estado: number; nombre: string; votos_totales: number | null; lista_nominal: number | null; participacion: number | null;
  ganador: string | null; p_ganador: number | null; segundo: string | null; p_segundo: number | null; margen: number | null; nep: number | null;
  ganador_bloque: string | null; clase: Clase | null; margen_enfoque: number | null; p_enfoque: number | null; confianza: string | null; top: Record<string, number>; votos_partidos: number;
};
type Nivel = "estado" | "distrito" | "distrito_local" | "municipio";
type Terr = { estado: number; distrito: number; municipio: number; seccion: number; nombre: string; ctx: string };
type Lectura = "candidatura" | "boleta" | "alcance" | "bloque";

const NAC: Terr = { estado: 0, distrito: 0, municipio: 0, seccion: 0, nombre: "", ctx: "" };
const CON_DISTRITO = ["presidente", "senado", "diputados_federales", "diputados_locales_mr"];

export default function ResultadosPorCargo() {
  const cat = useCatalogo();
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const clases = clasesDe(enfoque);
  const [cargoId, setCargoId] = useState<CargoId>("presidente");
  const [anio, setAnio] = useState<number | null>(null);
  const [terr, setTerr] = useState<Terr>(NAC);
  const [lectura, setLectura] = useState<Lectura>("candidatura");
  const [serie, setSerie] = useState<Resultado[] | null>(null);
  const [unidades, setUnidades] = useState<{ nivel: Nivel; unidades: Unidad[] } | null>(null);
  const [filtro, setFiltro] = useState("");
  const [orden, setOrden] = useState<"id" | "margen" | "participacion">("id");
  const c = cargoDe(cargoId);
  const [optMun, setOptMun] = useState<Opcion[]>([]);
  const [optDis, setOptDis] = useState<Opcion[]>([]);
  const [optSec, setOptSec] = useState<Opcion[]>([]);

  const [aniosTerr, setAniosTerr] = useState<{ clave: string; anios: number[] } | null>(null);
  const anios = useMemo(() => {
    // En una entidad, solo los años en que ESA entidad votó ese cargo (los cargos locales tienen calendarios propios)
    if (terr.estado && aniosTerr?.clave === `${cargoId}-${terr.estado}`) return aniosTerr.anios;
    const s = new Set((cat?.elecciones ?? []).filter((e) => e.eleccion === cargoId && !e.extraordinaria).map((e) => e.anio));
    return [...s].sort((a, b) => b - a);
  }, [cat, cargoId, terr.estado, aniosTerr]);
  useEffect(() => {
    if (!terr.estado) { setAniosTerr(null); return; }
    api<{ elecciones: Resultado[] }>(`/api/presidencial?eleccion=${cargoId}&estado=${terr.estado}`).then((d) =>
      setAniosTerr({ clave: `${cargoId}-${terr.estado}`, anios: [...new Set(d.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length).map((x) => x.anio))].sort((a, b) => b - a) }));
  }, [cargoId, terr.estado]);
  useEffect(() => { if (anios.length && (anio === null || !anios.includes(anio))) setAnio(anios[0]); }, [anios, anio]);

  // Opciones de los buscadores de territorio (de la elección elegida: cargo + año)
  useEffect(() => {
    if (!terr.estado) { setOptMun([]); return; }
    api<{ municipios: { clave_inegi: number; nombre: string }[] }>(`/api/municipios?estado=${terr.estado}`).then((d) => setOptMun(d.municipios.map((m) => ({ valor: m.clave_inegi, etiqueta: m.nombre }))));
  }, [terr.estado]);
  useEffect(() => {
    if (!terr.estado || !anio || !CON_DISTRITO.includes(cargoId)) { setOptDis([]); return; }
    api<{ opciones: Opcion[] }>(`/api/opciones?tipo=distrito&eleccion=${cargoId}&anio=${anio}&estado=${terr.estado}`).then((d) => {
      setOptDis(d.opciones);
      // Limpieza automática: el distrito elegido no existe en esta elección (otro mapa distrital u otro año)
      setTerr((t) => (t.distrito && !d.opciones.some((o) => o.valor === t.distrito) ? { ...NAC, estado: t.estado } : t));
    });
  }, [terr.estado, anio, cargoId]);
  useEffect(() => {
    if (!terr.estado || !anio) { setOptSec([]); return; }
    const ambito = terr.municipio ? `&municipio=${terr.municipio}` : terr.distrito ? `&distrito=${terr.distrito}` : "";
    api<{ opciones: Opcion[] }>(`/api/opciones?tipo=seccion&eleccion=${cargoId}&anio=${anio}&estado=${terr.estado}${ambito}`).then((d) => {
      setOptSec(d.opciones);
      // Limpieza automática: la sección elegida no existe en esta elección (reseccionamiento u otro año)
      setTerr((t) => (t.seccion && d.opciones.length && !d.opciones.some((o) => o.valor === t.seccion) ? { ...t, seccion: 0, ctx: "" } : t));
    });
  }, [terr.estado, terr.municipio, terr.distrito, anio, cargoId]);

  // Serie del cargo en el territorio (una entrada por año)
  useEffect(() => {
    setSerie(null);
    const qs = new URLSearchParams({ eleccion: cargoId, estado: String(terr.estado), municipio: String(terr.municipio), distrito: String(terr.distrito), seccion: String(terr.seccion), anio_ref: String(anio ?? 0) });
    api<{ elecciones: Resultado[] }>(`/api/presidencial?${qs}`).then((d) => setSerie(d.elecciones)).catch(() => setSerie([]));
  }, [cargoId, terr, anio]);
  // Unidades de elección del año
  useEffect(() => {
    if (anio === null || terr.distrito || terr.municipio || terr.seccion) { setUnidades(null); return; }
    setUnidades(null);
    api<{ nivel: Nivel; unidades: Unidad[] }>(`/api/unidades?cargo=${cargoId}&anio=${anio}&estado=${terr.estado}&enfoque=${enfoque}`).then(setUnidades);
  }, [cargoId, anio, terr, enfoque]);

  const r = serie?.find((x) => x.anio === anio && !x.extraordinaria) ?? null;
  const nombreEstado = (id: number) => cat?.estados.find((e) => e.id_estado === id)?.nombre_corto ?? "";
  const lugar = terr.seccion ? `Sección ${terr.seccion % 10000}${terr.ctx ? ` · ${terr.ctx}` : ""}` : terr.municipio ? terr.nombre : terr.distrito ? `Distrito ${terr.nombre}` : terr.estado ? nombreEstado(terr.estado) : "Nacional";

  function elegirCargo(id: CargoId) { setCargoId(id); setTerr(NAC); setAnio(null); setFiltro(""); }
  function entrar(u: Unidad, nivel: Nivel) {
    if (nivel === "estado") setTerr({ ...NAC, estado: u.id, nombre: u.nombre });
    else if (nivel === "municipio") setTerr({ ...NAC, estado: u.id_estado, municipio: u.id, nombre: u.nombre });
    else setTerr({ ...NAC, estado: u.id_estado, distrito: u.id, nombre: u.nombre });
    setFiltro("");
  }

  // Lectura del año en el territorio
  const barras = useMemo(() => {
    if (!r) return [];
    const base = Object.values(r.partidos).reduce((a, b) => a + b, 0);
    const fuente = lectura === "alcance" ? alcance(r.partidos) : lectura === "bloque" ? porBloque(r.partidos, r.anio) : lectura === "candidatura" ? porCandidatura(r.partidos) : r.partidos;
    return Object.entries(fuente).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      k, v, p: base ? (100 * v) / base : 0, nombre: lectura === "bloque" ? (BLOQUES[k]?.nombre ?? k) : nombreCandidatura(k),
      color: lectura === "bloque" ? (BLOQUES[k]?.color ?? "#9aa0a6") : colorPartido(k),
    }));
  }, [r, lectura]);
  const ind = r ? indicadores(porCandidatura(r.partidos)) : null;
  const prevR = serie && r ? serie.filter((x) => x.anio < r.anio && !x.extraordinaria).at(-1) : undefined;
  const vol = r && prevR ? pedersen(porFamilia(r.partidos), porFamilia(prevR.partidos)) : null;
  const part = r?.votos_totales && r.lista_nominal ? (100 * r.votos_totales) / r.lista_nominal : null;
  const partPrev = prevR?.votos_totales && prevR.lista_nominal ? (100 * prevR.votos_totales) / prevR.lista_nominal : null;

  // Reparto de unidades ganadas
  const reparto = useMemo(() => {
    if (!unidades) return null;
    const us = unidades.unidades.filter((u) => u.ganador);
    const senado = cargoId === "senado" && unidades.nivel === "estado";
    const celdas: { clave: string; titulo: string; id: number; color?: string }[] = [];
    for (const u of us) {
      if (senado) {
        celdas.push({ clave: u.ganador!, titulo: `${u.nombre}: ${u.ganador} (mayoría)`, id: u.id }, { clave: u.ganador!, titulo: `${u.nombre}: ${u.ganador} (mayoría)`, id: u.id });
        if (u.segundo) celdas.push({ clave: u.segundo, titulo: `${u.nombre}: ${u.segundo} (primera minoría)`, id: u.id });
      } else celdas.push({ clave: u.ganador!, titulo: `${u.nombre}: ${u.ganador} ${pct(u.p_ganador)} · margen ${u.margen?.toFixed(1)} pts`, id: u.id });
    }
    const cuenta = new Map<string, number>();
    for (const x of celdas) cuenta.set(x.clave, (cuenta.get(x.clave) ?? 0) + 1);
    const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
    const pos = new Map(orden.map(([k], i) => [k, i]));
    celdas.sort((a, b) => pos.get(a.clave)! - pos.get(b.clave)!);
    const clases: Record<string, number> = {};
    for (const u of us) if (u.clase) clases[u.clase] = (clases[u.clase] ?? 0) + 1;
    return { celdas, orden, clases, total: us.length, senado };
  }, [unidades, cargoId]);

  const lista = useMemo(() => {
    const us = (unidades?.unidades ?? []).filter((u) => !filtro || u.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(filtro.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")));
    const o = [...us];
    if (orden === "margen") o.sort((a, b) => enfoque === "general" ? (a.margen ?? 999) - (b.margen ?? 999) : Math.abs(a.margen_enfoque ?? 999) - Math.abs(b.margen_enfoque ?? 999));
    if (orden === "participacion") o.sort((a, b) => (b.participacion ?? 0) - (a.participacion ?? 0));
    return o;
  }, [unidades, filtro, orden, enfoque]);

  // Serie para el gráfico (por bloque o por partido), una entrada por elección
  const graf = useMemo(() => {
    const filas = (serie ?? []).filter((x) => !x.extraordinaria && Object.keys(x.partidos).length).map((x) => {
      const base = Object.values(x.partidos).reduce((a, b) => a + b, 0);
      const src = lectura === "bloque" ? porBloque(x.partidos, x.anio) : lectura === "alcance" ? alcance(x.partidos) : lectura === "candidatura" ? porFamilia(x.partidos) : x.partidos;
      const o: Record<string, number> = { anio: x.anio };
      for (const [k, v] of Object.entries(src)) o[k] = base ? +((100 * v) / base).toFixed(1) : 0;
      return o;
    });
    const mx: Record<string, number> = {};
    for (const f of filas) for (const [k, v] of Object.entries(f)) if (k !== "anio") mx[k] = Math.max(mx[k] ?? 0, v);
    const claves = Object.entries(mx).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
    return { filas, claves };
  }, [serie, lectura]);

  const nivelTxt: Record<Nivel, string> = { estado: "Entidades", distrito: "Distritos federales", distrito_local: "Distritos locales", municipio: "Municipios" };
  const tituloReparto = reparto?.senado ? "Escaños de mayoría y primera minoría (aprox.)" : unidades ? `${nivelTxt[unidades.nivel]} ${unidades.nivel === "estado" ? "ganadas" : "ganados"}` : "";

  return (
    <>
      <header className="space-y-1.5">
        <p className="label">Resultados por cargo</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold">{c.nombre} {anio ?? ""}</h1>
        <p className="max-w-3xl" style={{ color: "var(--fg-soft)" }}>{c.regla}</p>
      </header>

      {/* 1. Cargo */}
      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5" aria-label="Cargo">
        {CARGOS.map((x) => (
          <button key={x.id} className="tarjeta-btn" aria-pressed={x.id === cargoId} onClick={() => elegirCargo(x.id)}>
            <x.icon size={18} style={{ color: x.id === cargoId ? "var(--accion)" : "var(--fg-mute)" }} />
            <p className="font-bold text-sm pt-2">{x.nombre}</p>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>por {x.unidad}</p>
          </button>
        ))}
        <Link href="/judicial" className="tarjeta-btn">
          <Scale size={18} style={{ color: "#7c3aed" }} />
          <p className="font-bold text-sm pt-2">Poder Judicial</p>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>2025, por persona</p>
        </Link>
      </section>

      {/* 2. Año y territorio */}
      <section className="material p-4 md:p-5 space-y-4 relative z-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1">Año</span>
          {anios.map((a) => <button key={a} className="chip" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}<MarcaPrep eleccion={cargoId} anio={a} /></button>)}
        </div>
        <AvisoSiPrep eleccion={cargoId} anio={anio} />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="label flex items-center gap-1.5"><MapPin size={13} /> Territorio</p>
            <BotonLimpiar visible={!!(terr.estado || terr.distrito || terr.municipio || terr.seccion)} onClick={() => { setTerr(NAC); setFiltro(""); }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Buscador etiqueta="Entidad" todos="Todo el país" valor={terr.estado} ancho="min-w-0"
              opciones={(cat?.estados ?? []).map((e) => ({ valor: e.id_estado, etiqueta: e.nombre_corto, sub: e.abreviatura }))}
              onChange={(v, o) => setTerr({ ...NAC, estado: v, nombre: o?.etiqueta ?? "" })} />
            {CON_DISTRITO.includes(cargoId) && (
              <Buscador etiqueta={cargoId === "diputados_locales_mr" ? "Distrito local" : "Distrito federal"} todos="Todos los distritos" valor={terr.distrito} ancho="min-w-0"
                deshabilitado={!terr.estado} placeholder={terr.estado ? "Todos los distritos" : "Elige una entidad"} opciones={optDis}
                onChange={(v) => setTerr({ ...NAC, estado: terr.estado, distrito: v, nombre: v ? `${cat?.estados.find((e) => e.id_estado === terr.estado)?.abreviatura}-${v % 100}` : "" })} />
            )}
            <Buscador etiqueta="Municipio" todos="Todos los municipios" valor={terr.municipio} ancho="min-w-0"
              deshabilitado={!terr.estado} placeholder={terr.estado ? "Todos los municipios" : "Elige una entidad"} opciones={optMun}
              onChange={(v, o) => setTerr({ ...NAC, estado: terr.estado, municipio: v, nombre: o?.etiqueta ?? "" })} />
            <Buscador etiqueta="Sección" todos="Todas las secciones" valor={terr.seccion} ancho="min-w-0"
              deshabilitado={!terr.estado} placeholder={terr.estado ? "Todas las secciones" : "Elige una entidad"} opciones={optSec}
              onChange={(v, o) => setTerr({ ...terr, seccion: v, ctx: o?.sub ?? terr.nombre })} />
          </div>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Escribe para buscar. Distrito y municipio son alternativos (un distrito puede abarcar varios municipios); la sección se busca dentro de lo elegido.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <nav className="migas" aria-label="Ruta">
            <button onClick={() => setTerr(NAC)}>Nacional</button>
            {terr.estado > 0 && <><ChevronRight size={14} style={{ color: "var(--fg-mute)" }} /><button onClick={() => setTerr({ ...NAC, estado: terr.estado })}>{nombreEstado(terr.estado)}</button></>}
            {(terr.distrito > 0 || terr.municipio > 0) && <><ChevronRight size={14} style={{ color: "var(--fg-mute)" }} /><button onClick={() => setTerr({ ...terr, seccion: 0 })}>{terr.municipio ? terr.nombre : `Distrito ${terr.nombre}`}</button></>}
            {terr.seccion > 0 && <><ChevronRight size={14} style={{ color: "var(--fg-mute)" }} /><span>Sección {terr.seccion % 10000}</span></>}
          </nav>
          <div className="flex items-center gap-1">
          <div className="seg" role="group" aria-label="Lectura">
            <button aria-pressed={lectura === "candidatura"} onClick={() => setLectura("candidatura")} title="Suma cada partido a la coalición (candidatura) que lo postuló, inferida de la boleta">Candidatura</button>
            <button aria-pressed={lectura === "boleta"} onClick={() => setLectura("boleta")} title="Cada partido y cada coalición como aparecen en la boleta">Boleta</button>
            <button aria-pressed={lectura === "alcance"} onClick={() => setLectura("alcance")} title="Votos del partido más los de las coaliciones que integra (no suma 100%)">Alcance</button>
            <button aria-pressed={lectura === "bloque"} onClick={() => setLectura("bloque")} title="Agrupación analítica por bloques políticos de cada elección">Bloques</button>
          </div>
          <Ayuda clave={`lectura_${lectura}`} />
          </div>
        </div>
      </section>

      {/* 3. Resultado del territorio en el año */}
      {!serie ? <Cargando alto={240} /> : !r ? (
        <p className="material p-6">No hay resultados de {c.nombre.toLowerCase()} {anio} en {lugar}.{c.ambito === "local" && !terr.estado ? " En cargos locales cada estado vota en su propio año: elige una entidad o un año en que haya votado." : ""}</p>
      ) : (
        <section className="grid xl:grid-cols-[1.15fr_1fr] gap-4 entra" key={`${cargoId}-${anio}-${lugar}`}>
          <div className="material p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="label">{lugar} · {anio}</p><h2 className="text-xl font-bold pt-1">Votación {lectura === "bloque" ? "por bloque" : lectura === "alcance" ? "por alcance de partido" : lectura === "candidatura" ? "por candidatura" : "por opción en la boleta"}</h2></div>
              <Confianza nivel={r.confianza} />
            </div>
            <div className="space-y-3">{barras.slice(0, 10).map((b) => <Barra key={b.k} etiqueta={b.nombre} pct={b.p} color={b.color} valor={fmt(b.v)} />)}</div>
            {lectura === "candidatura" && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Candidatura: cada partido se suma a la coalición más amplia que lo incluye en la boleta (p. ej. Morena + PT + PVEM). Es una inferencia de la boleta, no el registro oficial de candidaturas.</p>}
            {lectura === "alcance" && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Alcance: votos del partido más los de cada coalición que integra. No suma 100% ni reparte votos.</p>}
            {lectura === "bloque" && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Bloques: agrupación analítica de las coaliciones de cada elección (no oficial).</p>}
            {c.ambito === "local" && !terr.estado && <p className="text-xs" style={{ color: "var(--warn)" }}>Vista nacional de un cargo local: suma de las entidades que eligieron {c.nombre.toLowerCase()} en {anio}; cada una votó con su propio calendario y coaliciones.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            <Dato ayuda="participacion" t="Participación" v={pct(part)} n={partPrev !== null && part !== null ? `${part - partPrev >= 0 ? "+" : ""}${(part - partPrev).toFixed(1)} pts vs ${prevR!.anio}` : `lista nominal ${fmt(r.lista_nominal)}`} acento />
            <Dato ayuda="votos_emitidos" t="Votos emitidos" v={fmt(r.votos_totales)} n={r.nulos !== null && r.votos_totales ? `nulos ${pct((100 * r.nulos) / r.votos_totales)}` : undefined} />
            <Dato ayuda="primera_fuerza" t="Primera fuerza" v={ind?.ganador ? nombreCandidatura(ind.ganador) : "—"} n={ind?.pGanador ? `${pct(ind.pGanador)} de los votos a candidaturas` : undefined} color={ind?.ganador ? colorPartido(ind.ganador) : undefined} />
            <Dato ayuda="margen" t="Margen de victoria" v={ind?.margen !== null && ind?.margen !== undefined ? `${ind.margen.toFixed(1)} pts` : "—"} n={ind?.segundo ? `sobre ${nombreCandidatura(ind.segundo)}` : undefined} />
            <Dato ayuda="nep" t="Fuerzas que compiten" v={ind?.nep ? ind.nep.toFixed(1) : "—"} n={ind?.nep ? (ind.nep < 1.6 ? "una fuerza domina" : ind.nep < 2.4 ? "competencia entre dos fuerzas" : ind.nep < 3.2 ? "competencia entre tres fuerzas" : "voto muy repartido") : undefined} />
            <Dato ayuda="volatilidad" t="Voto que cambió de partido" v={vol !== null ? `${vol.toFixed(0)}%` : "—"} n={prevR ? `de los votos, respecto de ${prevR.anio}` : "sin elección previa"} />
            <p className="col-span-2 text-xs" style={{ color: "var(--fg-mute)" }}>Fuente: {r.fuentes.join(", ")}</p>
          </div>
        </section>
      )}

      {/* 3b. Piso y techo histórico (últimas 10 elecciones del cargo en el territorio) */}
      {serie && serie.length > 0 && <PisoTecho serie={serie} cargoId={cargoId} cargoNombre={c.nombre} lugar={lugar} terr={terr} local={c.ambito === "local"} />}

      {/* 4. Unidades de elección: quién ganó cada distrito / entidad / municipio */}
      {!terr.distrito && !terr.municipio && !terr.seccion && (
        !unidades ? <Cargando alto={300} /> : unidades.unidades.length === 0 ? null : (
          <section className="grid xl:grid-cols-[1fr_1.35fr] gap-4">
            <div className="material p-5 space-y-4">
              <div><p className="label">{lugar} · {anio}</p><h2 className="text-xl font-bold pt-1">{tituloReparto}</h2></div>
              {reparto && <>
                <Waffle celdas={reparto.celdas} columnas={reparto.celdas.length > 400 ? 40 : reparto.celdas.length > 100 ? 25 : 16} tam={reparto.celdas.length > 400 ? 9 : 13}
                  onClick={(id) => { const u = unidades.unidades.find((x) => x.id === id); if (u) entrar(u, unidades.nivel); }} />
                <div className="space-y-1.5">{reparto.orden.slice(0, 8).map(([k, n]) => (
                  <p key={k} className="flex justify-between text-sm"><span><span className="inline-block size-2.5 rounded-sm mr-2" style={{ background: colorPartido(k) }} /><b>{nombreCandidatura(k)}</b></span><span className="num"><b>{n}</b> <span style={{ color: "var(--fg-mute)" }}>de {reparto.celdas.length}</span></span></p>))}</div>
                <div>
                  <p className="label pb-1.5">Competitividad de las {unidades.nivel === "estado" ? "entidades" : "unidades"}{enfoque !== "general" && <> desde <span style={{ color: enf.color }}>{enf.t}</span></>}<Ayuda clave={enfoque === "general" ? "competitividad" : "competitividad_enfoque"} /></p>
                  <div className="flex h-3 rounded-full overflow-hidden">{clases.map((c) => <div key={c.k} style={{ width: `${(100 * (reparto.clases[c.k] ?? 0)) / reparto.total}%`, background: c.color }} title={`${c.t}: ${reparto.clases[c.k] ?? 0}`} />)}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">{clases.filter((c) => enfoque === "general" || reparto.clases[c.k]).map((c) => <span key={c.k}><b style={{ color: c.color }}>{reparto.clases[c.k] ?? 0}</b> {c.t.toLowerCase()} <span style={{ color: "var(--fg-mute)" }}>({c.d})</span></span>)}</div>
                  {enfoque !== "general" && <p className="text-xs pt-1.5" style={{ color: "var(--fg-mute)" }}>Desde {enf.t}: su candidatura (sola o en la coalición que lo incluye) contra la mejor rival. Cambia el enfoque en la barra superior.</p>}
                </div>
                <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
                  {reparto.senado ? "Aproximación: 2 escaños a la opción más votada y 1 a la segunda en cada entidad; la asignación real depende de las fórmulas registradas. " : ""}
                  El ganador es la candidatura más votada (partido o coalición, inferida de la boleta); el escaño o cargo lo asume el partido que indique el convenio de coalición. Toca un cuadro para entrar.</p>
              </>}
            </div>
            <div className="material p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{nivelTxt[unidades.nivel]} · {lista.length}</h2>
                <div className="flex items-center gap-2">
                  <label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-mute)" }} />
                    <input className="field !py-1.5 !pl-8 text-sm !w-44" placeholder="Buscar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} /></label>
                  <div className="seg"><button aria-pressed={orden === "id"} onClick={() => setOrden("id")}>Clave</button><button aria-pressed={orden === "margen"} onClick={() => setOrden("margen")}>Más reñidas</button><button aria-pressed={orden === "participacion"} onClick={() => setOrden("participacion")}>Participación</button></div>
                </div>
              </div>
              <div className="overflow-auto max-h-[520px]">
                <table className="t">
                  <thead><tr><th>{unidades.nivel === "estado" ? "Entidad" : unidades.nivel === "municipio" ? "Municipio" : "Distrito"}</th><th>Primera fuerza</th><th>Segunda</th><th>{enfoque === "general" ? <>Margen<Ayuda clave="margen" /></> : <><span style={{ color: enf.color }}>{enf.t}</span><Ayuda clave="competitividad_enfoque" /></>}</th><th>Particip.<Ayuda clave="participacion" /></th><th /></tr></thead>
                  <tbody>
                    {lista.slice(0, 600).map((u) => (
                      <tr key={u.id} className="cursor-pointer" onClick={() => entrar(u, unidades.nivel)}>
                        <td className="font-semibold">{u.nombre}</td>
                        <td><span className="font-bold" style={{ color: u.ganador ? colorPartido(u.ganador) : undefined }}>{u.ganador ? nombreCandidatura(u.ganador) : "—"}</span> <span className="num">{pct(u.p_ganador)}</span></td>
                        <td style={{ color: "var(--fg-soft)" }}>{u.segundo ? nombreCandidatura(u.segundo) : "—"} <span className="num">{pct(u.p_segundo)}</span></td>
                        <td className="whitespace-nowrap">{enfoque === "general" ? (u.clase ? <span className="font-semibold" style={{ color: ETIQ_CLASE[u.clase].color }}>{u.margen?.toFixed(1)}</span> : "—")
                          : u.clase ? <span title={ETIQ_CLASE[u.clase].d}><span className="font-semibold" style={{ color: ETIQ_CLASE[u.clase].color }}>{ETIQ_CLASE[u.clase].t}</span>{u.margen_enfoque !== null && <span className="num text-xs" style={{ color: "var(--fg-mute)" }}> {pct(u.p_enfoque)} · {u.margen_enfoque > 0 ? "+" : ""}{u.margen_enfoque.toFixed(1)}</span>}</span> : "—"}</td>
                        <td>{pct(u.participacion)}</td>
                        <td><ChevronRight size={15} style={{ color: "var(--fg-mute)" }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lista.length > 600 && <p className="text-xs p-2" style={{ color: "var(--fg-mute)" }}>Se muestran 600 de {lista.length}; usa la búsqueda o elige una entidad.</p>}
              </div>
            </div>
          </section>
        )
      )}

      {(terr.distrito > 0 || terr.municipio > 0) && !terr.seccion && anio && (
        <SeccionesInline eleccion={cargoId} anio={anio} municipio={terr.municipio} distrito={terr.distrito} lugar={lugar}
          onElegir={(id) => setTerr({ ...terr, seccion: id, ctx: terr.nombre })}
          enlace={`/secciones?eleccion=${cargoId}&anio=${anio}&${terr.distrito ? `distrito=${terr.distrito}` : `municipio=${terr.municipio}`}&estado=${terr.estado}`} />
      )}

      {/* 5. Trayectoria del cargo en el territorio */}
      {serie && graf.filas.length > 1 && (
        <section className="material p-5 space-y-3">
          <div><p className="label">{lugar}</p><h2 className="text-xl font-bold pt-1">Trayectoria de {c.nombre.toLowerCase()} · % de votos {lectura === "candidatura" ? "por candidatura, según el partido que la encabeza" : lectura === "bloque" ? "por bloque" : "a partidos"}</h2></div>
          <div style={{ height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={graf.filas} margin={{ left: -10, right: 12, top: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="anio" stroke="var(--fg-mute)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--fg-mute)" fontSize={12} unit="%" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 }} formatter={(v) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {graf.claves.map((k) => <Line key={k} type="linear" dataKey={k} name={lectura === "bloque" ? BLOQUES[k]?.nombre ?? k : lectura === "candidatura" ? `Encabezada por ${k.toUpperCase()}` : nombreCandidatura(k)} stroke={lectura === "bloque" ? BLOQUES[k]?.color : colorPartido(k)} strokeWidth={2.4} dot={{ r: 3 }} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="t">
              <thead><tr><th>Año</th><th>Primera fuerza</th><th>Margen</th><th>Fuerzas que compiten</th><th>Voto que cambió</th><th>Participación</th><th>Votos</th></tr></thead>
              <tbody>{[...(serie ?? [])].filter((x) => !x.extraordinaria).reverse().map((x, i, arr) => {
                const ix = indicadores(porCandidatura(x.partidos)), ant = arr[i + 1];
                const v = ant ? pedersen(porFamilia(x.partidos), porFamilia(ant.partidos)) : null;
                return (
                  <tr key={x.anio} className="cursor-pointer" onClick={() => setAnio(x.anio)} style={{ background: x.anio === anio ? "color-mix(in srgb, var(--accion) 7%, transparent)" : undefined }}>
                    <td className="font-bold">{x.anio}</td>
                    <td><span className="font-bold" style={{ color: ix.ganador ? colorPartido(ix.ganador) : undefined }}>{ix.ganador ? nombreCandidatura(ix.ganador) : "—"}</span> {pct(ix.pGanador)}</td>
                    <td>{ix.margen?.toFixed(1) ?? "—"}</td><td>{ix.nep?.toFixed(1) ?? "—"}</td><td>{v !== null ? `${v.toFixed(0)}%` : "—"}</td>
                    <td>{pct(x.votos_totales && x.lista_nominal ? (100 * x.votos_totales) / x.lista_nominal : null)}</td><td>{fmt(x.votos_totales)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Cada fila es una elección distinta: los votos nunca se suman entre años. Líneas rectas entre elecciones (no se inventan valores intermedios). «Fuerzas que compiten»: cuántas candidaturas tienen peso real (1 = una domina, 2 = pelean dos, 3 o más = voto repartido). «Voto que cambió»: qué parte de los votos pasó de un partido a otro respecto de la elección anterior (0% = igual, 100% = todo cambió); se mide por el partido que encabeza cada candidatura.{terr.distrito ? " Distrito: solo elecciones con el mismo mapa distrital." : ""}</p>
        </section>
      )}
    </>
  );
}

function Dato({ t, v, n, acento, color, ayuda }: { t: string; v: string; n?: string; acento?: boolean; color?: string; ayuda?: string }) {
  return (
    <div className="material p-4 space-y-1">
      <p className="label">{t}{ayuda && <Ayuda clave={ayuda} />}</p>
      <p className="display text-[1.7rem] font-bold num" style={{ color: color ?? (acento ? "var(--accion)" : "var(--fg)") }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
