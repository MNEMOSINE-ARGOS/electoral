"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as IcoMapa, LayoutGrid, MapPinned } from "lucide-react";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { useEnfoque, CeldaClase } from "@/components/Enfoque";
import { MapaGeo, cargarGeo } from "@/components/MapaGeo";
import { MosaicoEstados } from "@/components/MosaicoEstados";
import { MapaEntidad } from "@/components/MapaEntidad";
import { FichaUnidad, LeyendaMapa } from "@/components/MapaPiezas";
import { Ayuda } from "@/components/Ayuda";
import { Cargando } from "@/components/Kpi";
import { alcance, colorPartido, nombreEleccion } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";
import { ENFOQUES, ETIQ_CLASE, indicadores, nombreCandidatura, porCandidatura, claseUnidad } from "@/lib/analisis";
import { METRICAS, colorUnidad, leyenda, partidosPresentes, type EntidadGeo, type Metrica, type UnidadMapa } from "@/lib/mapa";
import { AvisoPrep, type PrepMeta } from "@/components/MapaPiezas";

// Mapa nacional: UNA elección (cargo + año) por entidad. Cuatro maneras de colorear (quién ganó, qué tan reñido —desde el partido de
// enfoque—, participación y fuerza de un partido), en mapa o en mosaico de cuadros iguales. La leyenda cuenta entidades y resalta las
// suyas; el panel resume en frases lo que dice el mapa. Las entidades con cartografía del INE (public/geo/entidades.json) se abren
// por municipio, distrito y sección.

type Fila = { id_estado: number; votos_totales: number | null; nulos: number | null; lista_nominal: number | null; confianza: string | null; fuente: string; partidos: Record<string, number> };
const FEDERALES = new Set(["presidente", "senado", "diputados_federales"]);

export default function Estados() {
  const cat = useCatalogo();
  const { enfoque } = useEnfoque();
  const [eleccion, setEleccion] = useState("presidente");
  const [anio, setAnio] = useState<number | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("ganador");
  const [partido, setPartido] = useState("morena");
  const [vista, setVista] = useState<"mapa" | "mosaico">("mapa");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [resaltar, setResaltar] = useState<string | null>(null);
  const [hoverMos, setHoverMos] = useState<number | null>(null);
  const [geoEnt, setGeoEnt] = useState<EntidadGeo[]>([]);
  const detalle = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/geo/entidades.json").then((r) => (r.ok ? r.json() : [])).then(setGeoEnt).catch(() => {}); cargarGeo("/geo/estados.geojson").catch(() => {}); }, []);

  const tipos = useMemo(() => [...new Set((cat?.elecciones ?? []).map((e) => e.eleccion))], [cat]);
  // Años con datos en la base, más los que solo tienen PREP (preliminar, lib/prep.ts)
  const aniosPrep = useMemo(() => new Set((cat?.prep ?? []).filter((p) => p.eleccion === eleccion).map((p) => p.anio)), [cat, eleccion]);
  const anios = useMemo(() => [...(cat?.elecciones ?? []).filter((e) => e.eleccion === eleccion && !e.extraordinaria).map((e) => e.anio), ...aniosPrep]
    .filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => b - a), [cat, eleccion, aniosPrep]);
  const [prep, setPrep] = useState<Record<number, PrepMeta>>({});
  useEffect(() => { if (anios.length && (anio === null || !anios.includes(anio))) setAnio(anios[0]); }, [anios, anio]);
  useEffect(() => {
    if (anio === null) return;
    setFilas(null);
    api<{ estados: Fila[]; prep?: Record<number, PrepMeta> }>(`/api/estados?eleccion=${eleccion}&anio=${anio}`).then((d) => { setFilas(d.estados); setPrep(d.prep ?? {}); }).catch(() => setFilas([]));
  }, [eleccion, anio]);

  const nombres = useMemo(() => Object.fromEntries((cat?.estados ?? []).map((e) => [e.id_estado, e.nombre_corto])), [cat]);
  const abrev = useMemo(() => Object.fromEntries((cat?.estados ?? []).map((e) => [e.id_estado, (e as { abreviatura?: string }).abreviatura ?? String(e.id_estado)])), [cat]);

  // Cada entidad en el mismo formato que el mapa de una entidad (lib/mapa.ts)
  const unidades = useMemo<UnidadMapa[]>(() => (filas ?? []).map((f) => {
    const base = Object.values(f.partidos).reduce((a, b) => a + b, 0);
    const cand = porCandidatura(f.partidos), ind = indicadores(cand);
    return {
      id: f.id_estado, votos_totales: f.votos_totales, lista_nominal: f.lista_nominal,
      participacion: f.lista_nominal && f.votos_totales ? (100 * f.votos_totales) / f.lista_nominal : null,
      ganador: ind.ganador, p_ganador: ind.pGanador, segundo: ind.segundo, margen: ind.margen, ...claseUnidad(cand, ind.margen, enfoque),
      alc: Object.fromEntries(Object.entries(alcance(f.partidos)).filter(([, v]) => base && v / base >= 0.005).map(([k, v]) => [k, (100 * v) / base])),
    };
  }).filter((u) => u.ganador), [filas, enfoque]);
  const porId = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades]);
  const partidos = useMemo(() => partidosPresentes(unidades), [unidades]);
  useEffect(() => { if (partidos.length && !partidos.includes(partido)) setPartido(partidos[0]); }, [partidos, partido]);
  const colores = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, colorUnidad(u, metrica, partido)])), [unidades, metrica, partido]);
  const ley = useMemo(() => leyenda(unidades, metrica, partido, enfoque), [unidades, metrica, partido, enfoque]);
  const idsResaltados = useMemo(() => {
    if (!resaltar) return null;
    const it = ley.items.find((x) => x.k === resaltar);
    return new Set(unidades.filter((u) => metrica === "ganador" ? u.ganador === resaltar : metrica === "competitividad" ? u.clase === resaltar : colorUnidad(u, metrica, partido) === it?.color).map((u) => u.id));
  }, [resaltar, ley, unidades, metrica, partido]);
  const valorCorto = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id,
    metrica === "participacion" ? pct(u.participacion, 0) : metrica === "partido" ? pct(u.alc[partido] ?? 0, 0)
      : metrica === "competitividad" && enfoque !== "general" && u.margen_enfoque !== null ? `${u.margen_enfoque > 0 ? "+" : ""}${u.margen_enfoque.toFixed(0)}`
      : `${u.margen?.toFixed(0)} pts`])), [unidades, metrica, partido, enfoque]);

  const local = !FEDERALES.has(eleccion);
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const conGeo = (id: number) => geoEnt.find((g) => g.id === id);
  const elegir = (id: number | null) => { setSel(id); };
  const entSel = sel !== null ? conGeo(sel) : undefined;
  const tip = (id: number) => <FichaUnidad nombre={nombres[id] ?? String(id)} u={porId.get(id)} metrica={metrica} partido={partido}
    nota={local ? `Sin elección de ${(nombreEleccion[eleccion] ?? eleccion).toLowerCase()} en ${anio}` : undefined} />;
  const desc = METRICAS.find((m) => m.id === metrica)!.d;

  return (
    <>
      <header className="space-y-1.5">
        <p className="label">Mapa nacional</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold leading-tight">{nombreEleccion[eleccion] ?? eleccion} {anio ?? ""}: el país por entidad</h1>
        <p className="max-w-3xl" style={{ color: "var(--fg-soft)" }}>Elige una elección y cómo colorear. Pasa el cursor sobre una entidad para ver sus números, o sobre la leyenda para encontrar las que comparten color. {geoEnt.length > 0 && <>Las entidades marcadas con <MapPinned size={14} className="inline -mt-0.5" style={{ color: "var(--azul)" }} /> se abren por municipio, distrito y sección.</>}</p>
      </header>

      <section className="material p-4 space-y-3">
        <div className="mapa-ctl"><span className="label">Elección</span>
          <div className="flex flex-wrap gap-1.5">{tipos.map((t) => <button key={t} className="chip" aria-pressed={t === eleccion} onClick={() => setEleccion(t)}>{nombreEleccion[t] ?? t}</button>)}</div></div>
        <div className="mapa-ctl"><span className="label">Año</span>
          <div className="flex flex-wrap gap-1.5">{anios.map((a) => <button key={a} className="chip" aria-pressed={a === anio} onClick={() => setAnio(a)} title={aniosPrep.has(a) ? "Resultados preliminares (PREP), aún no son cómputo oficial" : undefined}>{a}{aniosPrep.has(a) && <span className="chip-prep">PREP</span>}</button>)}</div></div>
        <div className="mapa-ctl"><span className="label">Colorear por</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg" role="group" aria-label="Colorear por">{METRICAS.map((m) => <button key={m.id} type="button" aria-pressed={metrica === m.id} onClick={() => { setMetrica(m.id); setResaltar(null); }}>{m.t}</button>)}</div>
            {metrica === "partido" && <select className="field" aria-label="Partido" style={{ width: "auto" }} value={partido} onChange={(e) => setPartido(e.target.value)}>{partidos.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}</select>}
            {metrica === "competitividad" && <span className="text-xs font-semibold" style={{ color: enf.color }}>{enfoque === "general" ? "Entre las dos primeras fuerzas" : `Desde ${enf.t}`}<Ayuda clave={enfoque === "general" ? "competitividad" : "competitividad_enfoque"} tam={12} /></span>}
          </div></div>
        <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{desc}{metrica === "competitividad" && " Cambia el partido de enfoque en la barra superior."}</p>
      </section>

      {Object.keys(prep).length > 0 && filas && <AvisoPrep meta={Object.values(prep)[0]} donde={Object.keys(prep).map((k) => nombres[Number(k)]).join(", ")} />}
      {local && filas && filas.length > 0 && (
        <p className="aviso text-sm">{nombreEleccion[eleccion] ?? eleccion} es un cargo local: en {anio} votaron <b>{unidades.length} de 32</b> entidades; las demás aparecen en gris. La suma «nacional» de un cargo local no se compara entre años.</p>
      )}

      {!filas ? <Cargando alto={480} /> : unidades.length === 0 ? <p className="material p-6">Sin datos por entidad para esta elección.</p> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="material p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{METRICAS.find((m) => m.id === metrica)!.t}{metrica === "partido" ? ` · ${partido.toUpperCase()}` : ""}</p>
              <div className="seg" role="group" aria-label="Vista">
                <button type="button" aria-pressed={vista === "mapa"} onClick={() => setVista("mapa")}><IcoMapa size={14} className="inline -mt-0.5 mr-1" />Mapa</button>
                <button type="button" aria-pressed={vista === "mosaico"} onClick={() => setVista("mosaico")} title="Un cuadro igual por entidad: se ven las pequeñas"><LayoutGrid size={14} className="inline -mt-0.5 mr-1" />Mosaico</button>
              </div>
            </div>
            {vista === "mapa"
              ? <MapaGeo url="/geo/estados.geojson" idProp="state_code" colores={colores} seleccion={sel} onSelect={elegir} tooltip={tip} etiquetas={abrev} etiquetaMin={700} resaltar={idsResaltados} alto={560} />
              : <MosaicoEstados colores={colores} abrev={abrev} valor={valorCorto} seleccion={sel} onSelect={elegir} tooltip={tip} resaltar={idsResaltados} hover={hoverMos} setHover={setHoverMos} />}
            <LeyendaMapa items={ley.items} escala={ley.escala} unidad={["entidad", "entidades"]} onHover={setResaltar}
              titulo={metrica === "ganador" ? "Entidades ganadas · pasa el cursor para ubicarlas" : metrica === "competitividad" ? (enfoque === "general" ? "Competitividad" : `Desde ${enf.t}`) : undefined} />
          </section>

          <section className="material p-4 space-y-4" ref={detalle}>
            {sel !== null ? (
              <DetalleEntidad nombre={nombres[sel]} u={porId.get(sel)} f={filas.find((x) => x.id_estado === sel)} anio={anio!} geo={!!entSel} esPrep={!!prep[sel]} onCerrar={() => setSel(null)} />
            ) : (
              <Lectura unidades={unidades} nombres={nombres} metrica={metrica} partido={partido} onSel={elegir} conGeo={(id) => !!conGeo(id)} />
            )}
            {geoEnt.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="label">Con mapa por municipio, distrito y sección</p>
                <div className="flex flex-wrap gap-1.5">{geoEnt.map((g) => (
                  <button key={g.id} type="button" className="chip" aria-pressed={sel === g.id} onClick={() => elegir(sel === g.id ? null : g.id)}>
                    <MapPinned size={13} style={{ color: "var(--azul)" }} />{g.nombre}</button>))}</div>
              </div>
            )}
          </section>
        </div>
      )}

      {entSel && anio !== null && porId.has(entSel.id) && <MapaEntidad ent={entSel} eleccion={eleccion} anio={anio} metrica={metrica} partido={partido} />}
      {entSel && anio !== null && !porId.has(entSel.id) && <p className="material p-4 text-sm">{entSel.nombre} no tuvo elección de {(nombreEleccion[eleccion] ?? eleccion).toLowerCase()} en {anio}: elige otro año o cargo para ver su mapa por dentro.</p>}

      <section className="material p-4">
        <p className="label pb-1">Cómo leer este mapa</p>
        <ul className="nota-metodo text-xs" style={{ color: "var(--fg-mute)" }}>
          <li><b>Quién ganó</b>: la candidatura más votada, sumando cada partido a la coalición que lo postuló en esa boleta (lectura analítica, no el registro oficial). El tono va en cuatro pasos según el margen sobre la segunda: menos de 5, 5 a 10, 10 a 20 y 20 puntos o más.</li>
          <li><b>Qué tan reñido</b>: en «General», el margen entre las dos primeras; con un partido de enfoque, si ese partido gana o pierde y por cuánto.</li>
          <li><b>Participación</b>: votos emitidos ÷ lista nominal, en cinco tramos fijos para que dos mapas se comparen entre sí.</li>
          <li><b>Fuerza de un partido</b>: % de los votos que pasaron por el partido, solo o en coalición (alcance). No suma 100% entre partidos.</li>
          <li>El <b>mosaico</b> da a cada entidad el mismo tamaño: el mapa exagera las entidades grandes y poco pobladas (Chihuahua, Sonora) y esconde las pequeñas y muy pobladas (CDMX, Tlaxcala).</li>
          <li>Cómputos oficiales en su fecha de corte, antes de las resoluciones del Tribunal Electoral.</li>
        </ul>
      </section>
    </>
  );
}

/** Frases con lo que dice el mapa, más el ranking por margen. */
function Lectura({ unidades, nombres, metrica, partido, onSel, conGeo }: {
  unidades: UnidadMapa[]; nombres: Record<number, string>; metrica: Metrica; partido: string; onSel: (id: number) => void; conGeo: (id: number) => boolean;
}) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const n = unidades.length;
  const gan = new Map<string, number>();
  for (const u of unidades) if (u.ganador) gan.set(u.ganador, (gan.get(u.ganador) ?? 0) + 1);
  const [g1, c1] = [...gan].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const porMargen = [...unidades].sort((a, b) => (a.margen ?? 99) - (b.margen ?? 99));
  const conPart = unidades.filter((u) => u.participacion !== null).sort((a, b) => b.participacion! - a.participacion!);
  const vt = unidades.reduce((a, u) => a + (u.votos_totales ?? 0), 0), ln = unidades.reduce((a, u) => a + (u.lista_nominal ?? 0), 0);
  const gana = enfoque !== "general" ? unidades.filter((u) => (u.margen_enfoque ?? -1) >= 0).length : 0;
  const cerca = enfoque !== "general" ? unidades.filter((u) => u.clase === "reñida_pierde" || u.clase === "alcance").length : 0;
  const fuerte = metrica === "partido" ? [...unidades].sort((a, b) => (b.alc[partido] ?? 0) - (a.alc[partido] ?? 0)) : [];
  return (
    <>
      <div className="space-y-2">
        <p className="label">Lo que dice el mapa</p>
        <ul className="mapa-frases">
          {g1 && <li><span className="mapa-ley-c" style={{ background: colorPartido(g1) }} /><span><b>{nombreCandidatura(g1)}</b> ganó en <b>{c1} de {n}</b> entidades.</span></li>}
          {porMargen[0] && <li><span className="mapa-ley-c" style={{ background: ETIQ_CLASE["reñida"].color }} /><span>La más reñida: <button className="mapa-link" onClick={() => onSel(porMargen[0].id)}>{nombres[porMargen[0].id]}</button>, por <b>{porMargen[0].margen?.toFixed(1)} puntos</b>.</span></li>}
          {porMargen.at(-1) && n > 1 && <li><span className="mapa-ley-c" style={{ background: ETIQ_CLASE.bastion.color }} /><span>La más holgada: <button className="mapa-link" onClick={() => onSel(porMargen.at(-1)!.id)}>{nombres[porMargen.at(-1)!.id]}</button>, por <b>{porMargen.at(-1)!.margen?.toFixed(1)} puntos</b>.</span></li>}
          {conPart.length > 1 && <li><span className="mapa-ley-c" style={{ background: "var(--azul)" }} /><span>Votó más <button className="mapa-link" onClick={() => onSel(conPart[0].id)}>{nombres[conPart[0].id]}</button> ({pct(conPart[0].participacion)}) y menos <button className="mapa-link" onClick={() => onSel(conPart.at(-1)!.id)}>{nombres[conPart.at(-1)!.id]}</button> ({pct(conPart.at(-1)!.participacion)}). En conjunto, {pct(ln ? (100 * vt) / ln : null)}.</span></li>}
          {enfoque !== "general" && <li><span className="mapa-ley-c" style={{ background: enf.color }} /><span>Desde <b style={{ color: enf.color }}>{enf.t}</b>: gana en <b>{gana}</b>{cerca ? <> y queda a menos de 10 puntos en <b>{cerca}</b></> : null}.</span></li>}
          {metrica === "partido" && fuerte[0] && <li><span className="mapa-ley-c" style={{ background: colorPartido(partido) }} /><span>{partido.toUpperCase()} pesa más en <button className="mapa-link" onClick={() => onSel(fuerte[0].id)}>{nombres[fuerte[0].id]}</button> ({pct(fuerte[0].alc[partido] ?? 0)}) y menos en {nombres[fuerte.at(-1)!.id]} ({pct(fuerte.at(-1)!.alc[partido] ?? 0)}).</span></li>}
        </ul>
      </div>
      <div className="space-y-1.5">
        <p className="label">De la más reñida a la más holgada · toca una</p>
        <div className="overflow-auto max-h-[420px]">
          <table className="t">
            <thead><tr><th>Entidad</th><th>Ganó</th><th>Margen</th><th>{enfoque === "general" ? "Competencia" : enf.t}</th><th>Particip.</th></tr></thead>
            <tbody>{porMargen.map((u) => (
              <tr key={u.id} className="cursor-pointer" onClick={() => onSel(u.id)}>
                <td className="font-semibold whitespace-nowrap">{nombres[u.id]}{conGeo(u.id) && <MapPinned size={12} className="inline ml-1 -mt-0.5" style={{ color: "var(--azul)" }} aria-label="con mapa detallado" />}</td>
                <td><span className="mapa-ley-c inline-block mr-1 align-middle" style={{ background: u.ganador ? colorPartido(u.ganador) : undefined }} /><b style={{ color: u.ganador ? colorPartido(u.ganador) : undefined }}>{u.ganador ? nombreCandidatura(u.ganador) : "—"}</b></td>
                <td className="num">{u.margen?.toFixed(1) ?? "—"}</td>
                <td><CeldaClase clase={u.clase} margenEnfoque={u.margen_enfoque} pEnfoque={u.p_enfoque} /></td>
                <td className="num">{pct(u.participacion)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function DetalleEntidad({ nombre, u, f, anio, geo, esPrep, onCerrar }: { nombre: string; u: UnidadMapa | undefined; f: Fila | undefined; anio: number; geo: boolean; esPrep: boolean; onCerrar: () => void }) {
  if (!u || !f) return (
    <div className="space-y-2"><h2 className="text-xl font-bold">{nombre}</h2><p className="text-sm" style={{ color: "var(--fg-mute)" }}>Sin elección este año.</p>
      <button className="chip" onClick={onCerrar}>Ver todas las entidades</button></div>);
  const cand = Object.entries(porCandidatura(f.partidos)).sort((a, b) => b[1] - a[1]);
  const base = cand.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div><p className="label">{anio}{esPrep && <span className="chip-prep">PREP · preliminar</span>}</p><h2 className="text-2xl font-bold">{nombre}</h2></div>
        <button className="chip" onClick={onCerrar}>Ver todas</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="mapa-kpi"><small>Margen<Ayuda clave="margen" tam={11} /></small><b className="num">{u.margen?.toFixed(1)}</b><small>puntos</small></div>
        <div className="mapa-kpi"><small>Participación<Ayuda clave="participacion" tam={11} /></small><b className="num">{pct(u.participacion)}</b><small>{fmt(f.votos_totales)} votos</small></div>
        <div className="mapa-kpi"><small>Competencia</small><b className="text-sm"><CeldaClase clase={u.clase} margenEnfoque={u.margen_enfoque} pEnfoque={u.p_enfoque} /></b><small>lista {fmt(f.lista_nominal)}</small></div>
      </div>
      <div className="space-y-1.5">
        <p className="label">Votos por candidatura</p>
        {cand.slice(0, 8).map(([p, v], i) => (
          <div key={p} className="text-xs">
            <div className="flex justify-between gap-2"><b style={i === 0 ? { color: colorPartido(p) } : undefined}>{nombreCandidatura(p)}</b><span className="num">{fmt(v)} · {pct((100 * v) / base)}</span></div>
            <div className="h-2 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}><div className="h-2 rounded-full mapa-crece" style={{ width: `${(100 * v) / base}%`, background: colorPartido(p) }} /></div>
          </div>))}
      </div>
      {geo && <p className="text-sm font-semibold" style={{ color: "var(--azul)" }}><MapPinned size={14} className="inline -mt-0.5 mr-1" />Su mapa por municipio, distrito y sección está abajo.</p>}
    </div>
  );
}
