"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ArrowLeft, MousePointerClick } from "lucide-react";
import { api } from "@/lib/api";
import { colorUnidad, leyenda, type EntidadGeo, type Metrica, type UnidadMapa } from "@/lib/mapa";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { nombreCandidatura } from "@/lib/analisis";
import { pct } from "@/lib/format";
import { useEnfoque, CeldaClase } from "@/components/Enfoque";
import { MapaGeo, cargarGeo } from "@/components/MapaGeo";
import { FichaUnidad, LeyendaMapa } from "@/components/MapaPiezas";
import { Ayuda } from "@/components/Ayuda";

// Mapa de UNA entidad con cartografía del INE (public/geo/<id>/): municipios, distritos federales, distritos locales y secciones.
// Recorrido: entidad → (toca un municipio o distrito) → solo sus secciones, con su tabla, para el análisis fino.
// Los distritos solo se dibujan en los años en que la cartografía coincide con la distritación (df_desde / dl_desde).
// Las secciones son las de la cartografía vigente: las de años anteriores que ya no existen quedan «sin polígono» y se cuentan.

type Nivel = "municipio" | "distrito" | "distrito_local" | "seccion";
type Foco = { tipo: Exclude<Nivel, "seccion">; id: number; nombre: string };
const ARCHIVO: Record<Nivel, string> = { municipio: "municipios", distrito: "distritos_federales", distrito_local: "distritos_locales", seccion: "secciones" };
const UNIDAD: Record<Nivel, [string, string]> = { municipio: ["municipio", "municipios"], distrito: ["distrito federal", "distritos federales"], distrito_local: ["distrito local", "distritos locales"], seccion: ["sección", "secciones"] };
/** Propiedad del GeoJSON de secciones que dice a qué unidad pertenece cada una (ver scripts/geo_entidad.ts) */
const PROP_SECCION: Record<Foco["tipo"], string> = { municipio: "municipio", distrito: "df", distrito_local: "dl" };
const FEDERALES = new Set(["presidente", "senado", "diputados_federales"]);

/** Ids de las unidades que comparten la categoría de la leyenda bajo el cursor. */
function useResaltados(resaltar: string | null, unidades: UnidadMapa[], metrica: Metrica, partido: string, items: { k: string; color: string }[]) {
  return useMemo(() => {
    if (!resaltar) return null;
    const it = items.find((x) => x.k === resaltar);
    return new Set(unidades.filter((u) => metrica === "ganador" ? u.ganador === resaltar : metrica === "competitividad" ? u.clase === resaltar
      : colorUnidad(u, metrica, partido) === it?.color).map((u) => u.id));
  }, [resaltar, unidades, metrica, partido, items]);
}

export function MapaEntidad({ ent, eleccion, anio, metrica, partido }: { ent: EntidadGeo; eleccion: string; anio: number; metrica: Metrica; partido: string }) {
  const { enfoque } = useEnfoque();
  const niveles = useMemo(() => {
    const n: { id: Nivel; t: string; no?: string }[] = [{ id: "municipio", t: "Municipios" }];
    if (FEDERALES.has(eleccion)) n.push({ id: "distrito", t: "Distritos federales", no: ent.df_desde && anio >= ent.df_desde ? undefined : `La cartografía es de la distritación vigente desde ${ent.df_desde ?? "—"}; en ${anio} los distritos eran otros.` });
    if (eleccion.startsWith("diputados_locales")) n.push({ id: "distrito_local", t: "Distritos locales", no: ent.dl_desde && anio >= ent.dl_desde ? undefined : `La cartografía es de la distritación local vigente desde ${ent.dl_desde ?? "—"}; en ${anio} los distritos eran otros.` });
    n.push({ id: "seccion", t: "Secciones" });
    return n;
  }, [eleccion, anio, ent]);
  const [nivel, setNivel] = useState<Nivel>("municipio");
  const [foco, setFoco] = useState<Foco | null>(null);
  const valido = (id: Nivel) => niveles.some((n) => n.id === id && !n.no);
  useEffect(() => { if (!valido(nivel)) setNivel("municipio"); if (foco && !valido(foco.tipo)) setFoco(null); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFoco(null); }, [ent.id]);

  const [datos, setDatos] = useState<UnidadMapa[] | null>(null);
  const [nombres, setNombres] = useState<Record<number, string>>({});
  const [conPoligono, setConPoligono] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [resaltar, setResaltar] = useState<string | null>(null);
  const caja = useRef<HTMLElement>(null);

  const url = `/geo/${ent.id}/${ARCHIVO[nivel]}.geojson`;
  useEffect(() => {
    setDatos(null); setSel(null);
    api<{ unidades: UnidadMapa[] }>(`/api/mapa?eleccion=${eleccion}&anio=${anio}&estado=${ent.id}&nivel=${nivel}&enfoque=${enfoque}`).then((d) => setDatos(d.unidades)).catch(() => setDatos([]));
  }, [eleccion, anio, ent.id, nivel, enfoque]);
  useEffect(() => {
    cargarGeo(url).then((g) => {
      const n: Record<number, string> = {};
      for (const f of g.features) {
        const p = f.properties as { id: number; nombre?: string; n?: number; seccion?: number };
        n[p.id] = nivel === "municipio" ? String(p.nombre) : nivel === "seccion" ? `Sección ${p.seccion}` : `Distrito ${p.n}`;
      }
      setNombres(n); setConPoligono(new Set(Object.keys(n).map(Number)));
    });
  }, [url, nivel]);

  const porId = useMemo(() => new Map((datos ?? []).map((u) => [u.id, u])), [datos]);
  const colores = useMemo(() => Object.fromEntries((datos ?? []).map((u) => [u.id, colorUnidad(u, metrica, partido)])), [datos, metrica, partido]);
  const enMapa = useMemo(() => (datos ?? []).filter((u) => conPoligono.has(u.id)), [datos, conPoligono]);
  const ley = useMemo(() => leyenda(enMapa, metrica, partido, enfoque), [enMapa, metrica, partido, enfoque]);
  const idsResaltados = useResaltados(resaltar, enMapa, metrica, partido, ley.items);
  const sinPoligono = (datos ?? []).length - enMapa.length;
  const etiquetas = useMemo(() => nivel === "seccion" ? undefined : nivel === "municipio" ? nombres
    : Object.fromEntries(Object.entries(nombres).map(([k, v]) => [k, v.replace("Distrito ", "")])), [nivel, nombres]);
  const s = sel !== null ? porId.get(sel) : undefined;
  const abreFoco = nivel !== "seccion";

  const abrir = (id: number | null) => {
    if (id === null) return;
    if (nivel === "seccion") { setSel(id); return; }
    setFoco({ tipo: nivel, id, nombre: nombres[id] ?? String(id) });
    caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section ref={caja} className="material p-4 space-y-4 scroll-mt-20" aria-labelledby="mapa-ent-t">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <nav aria-label="Ruta del mapa" className="mapa-ruta">
            <span className="label">Cartografía del INE</span>
            <ChevronRight size={12} aria-hidden />
            {foco ? <button type="button" onClick={() => setFoco(null)}>{ent.nombre}</button> : <span aria-current="page">{ent.nombre}</span>}
            {foco && <><ChevronRight size={12} aria-hidden /><span aria-current="page">{foco.nombre}</span></>}
          </nav>
          <h2 id="mapa-ent-t" className="text-2xl font-bold">
            {foco ? `${foco.tipo === "municipio" ? foco.nombre : `${ent.nombre}, ${UNIDAD[foco.tipo][0]} ${foco.nombre.replace("Distrito ", "")}`} sección por sección` : `${ent.nombre} por dentro`}
            <span className="font-normal" style={{ color: "var(--fg-mute)" }}> · {nombreEleccion[eleccion] ?? eleccion} {anio}</span>
          </h2>
        </div>
        {foco ? (
          <button type="button" className="btn btn-gris" onClick={() => setFoco(null)}><ArrowLeft size={15} />Volver a {ent.nombre}</button>
        ) : (
          <div className="seg" role="group" aria-label="Nivel del mapa">
            {niveles.map((n) => <button key={n.id} type="button" aria-pressed={nivel === n.id} disabled={!!n.no} title={n.no} onClick={() => setNivel(n.id)}
              style={n.no ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>{n.t}</button>)}
          </div>
        )}
      </div>

      {foco ? (
        <MapaFoco ent={ent} foco={foco} padre={porId.get(foco.id)} eleccion={eleccion} anio={anio} metrica={metrica} partido={partido} />
      ) : (
        <>
          {niveles.filter((n) => n.no).map((n) => <p key={n.id} className="text-xs" style={{ color: "var(--fg-mute)" }}>{n.t}: {n.no}</p>)}
          {abreFoco && (
            <p className="mapa-pista"><MousePointerClick size={15} aria-hidden />Toca un {UNIDAD[nivel][0]} para abrirlo solo, sección por sección.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div>
              {datos === null ? <div className="skeleton w-full" style={{ aspectRatio: "800 / 560" }} /> : (
                <MapaGeo key={url} url={url} colores={colores} seleccion={sel} onSelect={abrir} resaltar={idsResaltados}
                  etiquetas={etiquetas} etiquetaMin={nivel === "municipio" ? 2600 : 900}
                  contorno={nivel === "seccion" ? `/geo/${ent.id}/municipios.geojson` : null}
                  tooltip={(id) => <FichaUnidad nombre={nombres[id] ?? String(id)} u={porId.get(id)} metrica={metrica} partido={partido} />} />
              )}
            </div>
            <div className="space-y-4">
              {s && sel !== null ? (
                <div className="mapa-detalle space-y-2">
                  <FichaUnidad nombre={nombres[sel] ?? String(sel)} u={s} metrica={metrica} partido={partido} />
                  <button type="button" className="chip" onClick={() => setSel(null)}>Quitar selección</button>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Pasa el cursor sobre el mapa para ver cada {UNIDAD[nivel][0]}{abreFoco ? "." : "; tócala para fijarla aquí."}</p>
              )}
              <LeyendaMapa items={ley.items} escala={ley.escala} unidad={UNIDAD[nivel]} onHover={setResaltar}
                titulo={metrica === "competitividad" ? (enfoque === "general" ? "Competitividad" : `Desde ${enfoque.toUpperCase()}`) : undefined} />
              {datos && datos.length === 0 && <p className="text-sm">Sin datos de {nombreEleccion[eleccion] ?? eleccion} {anio} a nivel de {UNIDAD[nivel][1]} en {ent.nombre}.</p>}
            </div>
          </div>
          <ul className="nota-metodo text-xs" style={{ color: "var(--fg-mute)" }}>
            <li>Polígonos de la Base Geográfica Digital del INE ({ent.secciones.toLocaleString("es-MX")} secciones). Resultados: cómputos oficiales; el ganador es por candidatura (cada partido sumado a su coalición en esa boleta), una lectura analítica.</li>
            {nivel === "seccion" && <li>La cartografía es la vigente: el INE resecciona cada año. {sinPoligono > 0 ? `${fmtN(sinPoligono)} secciones con resultados en ${anio} ya no existen en esta cartografía y no se dibujan.` : `Todas las secciones con resultados en ${anio} tienen polígono.`} Las que aparecen en gris no tienen resultados en esta elección.</li>}
            {(nivel === "distrito" || nivel === "distrito_local") && <li>{UNIDAD[nivel][1][0].toUpperCase() + UNIDAD[nivel][1].slice(1)} según la distritación vigente desde {nivel === "distrito" ? ent.df_desde : ent.dl_desde}.</li>}
            <li>Arrastra para mover; rueda, doble clic o + / − para acercar. <Ayuda clave="mapa_entidad" tam={12} /></li>
          </ul>
        </>
      )}
    </section>
  );
}

/** Un municipio o distrito solo: sus secciones en el mapa (encuadrado en él, con el número de cada sección) y en una tabla. */
function MapaFoco({ ent, foco, padre, eleccion, anio, metrica, partido }: {
  ent: EntidadGeo; foco: Foco; padre: UnidadMapa | undefined; eleccion: string; anio: number; metrica: Metrica; partido: string;
}) {
  const { enfoque } = useEnfoque();
  const [datos, setDatos] = useState<UnidadMapa[] | null>(null);
  const [numeros, setNumeros] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [resaltar, setResaltar] = useState<string | null>(null);
  const [orden, setOrden] = useState<"margen" | "seccion" | "participacion">("margen");
  const prop = PROP_SECCION[foco.tipo];
  const url = `/geo/${ent.id}/secciones.geojson`;

  useEffect(() => {
    setDatos(null); setSel(null);
    api<{ unidades: UnidadMapa[] }>(`/api/mapa?eleccion=${eleccion}&anio=${anio}&estado=${ent.id}&nivel=seccion&${foco.tipo}=${foco.id}&enfoque=${enfoque}`)
      .then((d) => setDatos(d.unidades)).catch(() => setDatos([]));
  }, [eleccion, anio, ent.id, foco.tipo, foco.id, enfoque]);
  useEffect(() => {
    cargarGeo(url).then((g) => setNumeros(Object.fromEntries(g.features
      .filter((f) => Number(f.properties[prop]) === foco.id).map((f) => [Number(f.properties.id), String(f.properties.seccion)]))));
  }, [url, prop, foco.id]);

  const filtro = useMemo(() => ({ prop, valor: foco.id }), [prop, foco.id]);
  const porId = useMemo(() => new Map((datos ?? []).map((u) => [u.id, u])), [datos]);
  const colores = useMemo(() => Object.fromEntries((datos ?? []).map((u) => [u.id, colorUnidad(u, metrica, partido)])), [datos, metrica, partido]);
  const enMapa = useMemo(() => (datos ?? []).filter((u) => numeros[u.id] !== undefined), [datos, numeros]);
  const ley = useMemo(() => leyenda(enMapa, metrica, partido, enfoque), [enMapa, metrica, partido, enfoque]);
  const idsResaltados = useResaltados(resaltar, enMapa, metrica, partido, ley.items);
  const nPoligonos = Object.keys(numeros).length;
  const sinPoligono = (datos ?? []).length - enMapa.length;
  const sinDatos = nPoligonos - enMapa.length;
  const margenDe = (u: UnidadMapa) => enfoque !== "general" ? u.margen_enfoque : u.margen;
  const filas = useMemo(() => [...(datos ?? [])].sort((a, b) =>
    orden === "seccion" ? (a.id % 10000) - (b.id % 10000)
      : orden === "participacion" ? (b.participacion ?? -1) - (a.participacion ?? -1)
      : enfoque !== "general" ? Math.abs(a.margen_enfoque ?? 999) - Math.abs(b.margen_enfoque ?? 999) : (a.margen ?? 999) - (b.margen ?? 999)),
  [datos, orden, enfoque]);
  const s = sel !== null ? porId.get(sel) : undefined;
  const nombre = (id: number) => `Sección ${numeros[id] ?? id % 10000}`;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          {datos === null ? <div className="skeleton w-full" style={{ aspectRatio: "800 / 560" }} /> : (
            <MapaGeo key={`${foco.tipo}-${foco.id}`} url={url} filtro={filtro} colores={colores} seleccion={sel} onSelect={setSel} resaltar={idsResaltados}
              etiquetas={numeros} etiquetaMin={420}
              tooltip={(id) => <FichaUnidad nombre={nombre(id)} u={porId.get(id)} metrica={metrica} partido={partido} nota="Sin resultados de esta elección en esta sección" />} />
          )}
        </div>
        <div className="space-y-4">
          {padre && (
            <div className="mapa-detalle">
              <p className="label pb-1">Todo {foco.tipo === "municipio" ? "el municipio" : "el distrito"}</p>
              <FichaUnidad nombre={foco.nombre} u={padre} metrica={metrica} partido={partido} />
            </div>
          )}
          {s && sel !== null ? (
            <div className="mapa-detalle space-y-2" style={{ boxShadow: "inset 3px 0 0 var(--accion)" }}>
              <FichaUnidad nombre={nombre(sel)} u={s} metrica={metrica} partido={partido} />
              <button type="button" className="chip" onClick={() => setSel(null)}>Quitar selección</button>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Toca una sección en el mapa o en la tabla para fijarla aquí.</p>
          )}
          <LeyendaMapa items={ley.items} escala={ley.escala} unidad={UNIDAD.seccion} onHover={setResaltar}
            titulo={metrica === "competitividad" ? (enfoque === "general" ? "Competitividad" : `Desde ${enfoque.toUpperCase()}`) : undefined} />
        </div>
      </div>

      {datos && datos.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">Sus {fmtN(datos.length)} secciones</p>
            <div className="seg" role="group" aria-label="Ordenar">
              <button type="button" aria-pressed={orden === "margen"} onClick={() => setOrden("margen")}>{enfoque === "general" ? "Más reñidas" : `Más cerradas para ${enfoque.toUpperCase()}`}</button>
              <button type="button" aria-pressed={orden === "participacion"} onClick={() => setOrden("participacion")}>Más participación</button>
              <button type="button" aria-pressed={orden === "seccion"} onClick={() => setOrden("seccion")}>Por número</button>
            </div>
          </div>
          <div className="overflow-auto max-h-[460px]">
            <table className="t">
              <thead><tr><th>Sección</th><th>Ganó</th><th>%</th><th>{enfoque === "general" ? "Margen" : `Margen ${enfoque.toUpperCase()}`}</th><th>{enfoque === "general" ? "Competencia" : `Desde ${enfoque.toUpperCase()}`}</th><th>Particip.</th><th>Votos</th></tr></thead>
              <tbody>{filas.map((u) => {
                const m = margenDe(u);
                return (
                  <tr key={u.id} className="cursor-pointer" onClick={() => setSel(u.id === sel ? null : u.id)} aria-selected={u.id === sel}
                    style={u.id === sel ? { background: "color-mix(in srgb, var(--accion) 10%, transparent)" } : undefined}>
                    <td className="font-semibold num">{u.id % 10000}{numeros[u.id] === undefined && <span className="text-xs font-normal" style={{ color: "var(--fg-mute)" }} title="No existe en la cartografía vigente"> · sin polígono</span>}</td>
                    <td><span className="mapa-ley-c inline-block mr-1 align-middle" style={{ background: u.ganador ? colorPartido(u.ganador) : undefined }} />{u.ganador ? nombreCandidatura(u.ganador) : "—"}</td>
                    <td className="num">{pct(u.p_ganador)}</td>
                    <td className="num">{m === null ? "—" : `${enfoque !== "general" && m > 0 ? "+" : ""}${m.toFixed(1)}`}</td>
                    <td><CeldaClase clase={u.clase} /></td>
                    <td className="num">{pct(u.participacion)}</td>
                    <td className="num">{fmtN(u.votos_totales ?? 0)}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
        </div>
      )}
      {datos && datos.length === 0 && <p className="text-sm">Sin resultados por sección de {nombreEleccion[eleccion] ?? eleccion} {anio} en {foco.nombre}.</p>}

      <ul className="nota-metodo text-xs" style={{ color: "var(--fg-mute)" }}>
        <li>Secciones de la cartografía vigente del INE con el número de cada una (se ve al acercar). {sinPoligono > 0 && `${fmtN(sinPoligono)} secciones con resultados en ${anio} ya no existen en esta cartografía: están en la tabla, marcadas «sin polígono», pero no en el mapa. `}{sinDatos > 0 && `${fmtN(sinDatos)} secciones del mapa no tienen resultados en esta elección (en gris).`}</li>
        {foco.tipo !== "municipio" && <li>El distrito se arma con las secciones que le asigna la cartografía; los resultados, con las que le asigna la base para {anio}.</li>}
        <li>Las casillas especiales reciben votos de otras secciones: la participación de una sección puede pasar de 100%. El ganador es por candidatura (lectura analítica).</li>
      </ul>
    </>
  );
}
const fmtN = (n: number) => n.toLocaleString("es-MX");
