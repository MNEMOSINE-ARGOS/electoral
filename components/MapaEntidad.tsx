"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, ArrowLeft, MousePointerClick } from "lucide-react";
import { api } from "@/lib/api";
import { type EntidadGeo, type Metrica, type UnidadMapa, type Vista } from "@/lib/mapa";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { nombreCandidatura } from "@/lib/analisis";
import { fmt, pct } from "@/lib/format";
import { useEnfoque, CeldaClase } from "@/components/Enfoque";
import { MapaGeo, cargarGeo } from "@/components/MapaGeo";
import { FichaUnidad, LeyendaMapa, AvisoPrep, type PrepMeta } from "@/components/MapaPiezas";
import { useCapaMapa } from "@/components/useCapaMapa";
import { MarcaPrep } from "@/components/Prep";
import { Ayuda } from "@/components/Ayuda";
import { PanoramaTerritorio } from "@/components/PanoramaTerritorio";

// Mapa de UNA entidad con cartografía del INE (public/geo/<id>/): municipios, distritos federales, distritos locales y secciones.
// Recorrido: entidad → (toca un municipio o distrito) → solo sus secciones, con su tabla, para el análisis fino.
// Métricas y vistas de lib/mapa.ts (las mismas del mapa nacional), dibujadas con useCapaMapa:
//   «Cambio» compara contra otra elección (prop comparar); «Historia» dibuja las últimas cuatro elecciones del cargo.
// Los distritos solo se dibujan en los años en que la cartografía coincide con la distritación (df_desde / dl_desde); por lo mismo,
// «Cambio» e «Historia» por distrito solo usan años dentro de esa vigencia.
// Las secciones son las de la cartografía vigente: las de años anteriores que ya no existen quedan «sin polígono» y se cuentan.

type Nivel = "municipio" | "distrito" | "distrito_local" | "seccion";
type Foco = { tipo: Exclude<Nivel, "seccion">; id: number; nombre: string };
const ARCHIVO: Record<Nivel, string> = { municipio: "municipios", distrito: "distritos_federales", distrito_local: "distritos_locales", seccion: "secciones" };
const UNIDAD: Record<Nivel, [string, string]> = { municipio: ["municipio", "municipios"], distrito: ["distrito federal", "distritos federales"], distrito_local: ["distrito local", "distritos locales"], seccion: ["sección", "secciones"] };
/** Propiedad del GeoJSON de secciones que dice a qué unidad pertenece cada una (ver scripts/geo_entidad.ts) */
const PROP_SECCION: Record<Foco["tipo"], string> = { municipio: "municipio", distrito: "df", distrito_local: "dl" };
const FEDERALES = new Set(["presidente", "senado", "diputados_federales"]);
/** Límites que se pueden dibujar encima de las secciones de un municipio o distrito (de la misma cartografía del INE) */
type Limite = "df" | "dl" | "municipio" | "sector";
const LIMITES: Record<Limite, { t: string; corto: string; archivo: string | null }> = {
  df: { t: "Distritos federales", corto: "DF", archivo: "distritos_federales" },
  dl: { t: "Distritos locales", corto: "DL", archivo: "distritos_locales" },
  municipio: { t: "Municipios", corto: "", archivo: "municipios" },
  // Organización propia (lib/sectores.ts, /api/sectores): no hay polígono del sector, se dibuja con el borde de sus secciones
  sector: { t: "Sectores", corto: "Sector", archivo: null },
};
const LIMITES_DE: Record<Foco["tipo"], Limite[]> = { municipio: ["df", "dl"], distrito: ["dl", "municipio"], distrito_local: ["df", "municipio"] };
type InfoSeccion = { n: string; municipio: number; df: number; dl: number };
/** Filtro del mapa de una entidad, en orden: municipio → distrito local → sección (0 = sin elegir). Lo controla el filtro de la pantalla (components/FiltroMapa). */
export type RutaMapa = { municipio: number; dl: number; seccion: number };
export const RUTA_VACIA: RutaMapa = { municipio: 0, dl: 0, seccion: 0 };
type Sector = { sector: string; secciones: number };
/** Borde de cada sector: tonos distinguibles entre sí, sin verdes (regla de diseño) */
const COLOR_SECTOR = ["#0E71AF", "#D81B60", "#B45309", "#7C3AED", "#0891B2", "#BE185D", "#475569", "#EA580C", "#4338CA", "#92400E", "#9333EA", "#0369A1"];

// ---- Datos: una petición por URL, compartida (la vista Historia y «Cambio» piden las mismas elecciones varias veces) ----
type RespMapa = { unidades: UnidadMapa[]; prep?: PrepMeta; anios?: number[] };
const cacheApi = new Map<string, Promise<RespMapa>>();
const pedir = (url: string) => {
  if (!cacheApi.has(url)) cacheApi.set(url, api<RespMapa>(url).catch((e) => { cacheApi.delete(url); throw e; }));
  return cacheApi.get(url)!;
};
function useDatosMapa(url: string | null) {
  const [r, setR] = useState<RespMapa | null>(null);
  useEffect(() => { setR(null); if (url) pedir(url).then(setR).catch(() => setR({ unidades: [] })); }, [url]);
  return r;
}
const urlMapa = (eleccion: string, anio: number, estado: number, nivel: Nivel, enfoque: string, filtro = "") =>
  `/api/mapa?eleccion=${eleccion}&anio=${anio}&estado=${estado}&nivel=${nivel}&enfoque=${enfoque}${filtro}`;
const porIdDe = (r: RespMapa | null) => (r ? new Map(r.unidades.map((u) => [u.id, u])) : null);

/** Desde qué año vale la cartografía de un nivel (los distritos cambian; municipios y secciones no se limitan aquí). */
const vigenteDesde = (ent: EntidadGeo, nivel: Nivel) => nivel === "distrito" ? ent.df_desde : nivel === "distrito_local" ? ent.dl_desde : null;

export function MapaEntidad({ ent, eleccion, anio, metrica, partido, vista, comparar, onSalir, resumen, ruta = RUTA_VACIA, onRuta }: {
  ent: EntidadGeo; eleccion: string; anio: number; metrica: Metrica; partido: string; vista: Vista; comparar: number | null;
  /** municipio → distrito local → sección elegidos en el filtro de la pantalla; tocar el mapa los actualiza con onRuta */ ruta?: RutaMapa; onRuta?: (r: RutaMapa) => void;
  /** el mapa se abrió en el lugar del nacional: «México» en la ruta regresa a él */ onSalir?: () => void;
  /** resumen de la entidad (lo arma el mapa nacional) que se ve a la derecha mientras no se pase el cursor por el mapa */ resumen?: ReactNode;
}) {
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
  // Un distrito local abierto desde el filtro vale con cualquier cargo (se dibuja con la cartografía vigente); abierto desde el mapa, solo si su capa es válida
  useEffect(() => { if (!valido(nivel)) setNivel("municipio"); if (foco && !valido(foco.tipo) && !(foco.tipo === "distrito_local" && ruta.dl === foco.id)) setFoco(null); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFoco(null); }, [ent.id]);
  // El filtro manda: municipio (con o sin distrito local) o, sin municipio, distrito local
  useEffect(() => {
    if (ruta.municipio) cargarGeo(`/geo/${ent.id}/municipios.geojson`).then((g) => {
      const f = g.features.find((x) => Number(x.properties.id) === ruta.municipio);
      setFoco({ tipo: "municipio", id: ruta.municipio, nombre: String(f?.properties.nombre ?? ruta.municipio) });
    });
    else if (ruta.dl) setFoco({ tipo: "distrito_local", id: ruta.dl, nombre: `Distrito ${ruta.dl % 100}` });
    else setFoco((f) => (f && f.tipo !== "distrito" ? null : f));
  }, [ruta.municipio, ruta.dl, ent.id]);
  /** Cerrar el municipio o distrito: también limpia el filtro */
  const cerrarFoco = () => { setFoco(null); onRuta?.(RUTA_VACIA); };

  const [nombres, setNombres] = useState<Record<number, string>>({});
  const [conPoligono, setConPoligono] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [resaltar, setResaltar] = useState<string | null>(null);
  const caja = useRef<HTMLElement>(null);

  const url = `/geo/${ent.id}/${ARCHIVO[nivel]}.geojson`;
  const resp = useDatosMapa(urlMapa(eleccion, anio, ent.id, nivel, enfoque));
  const desde = vigenteDesde(ent, nivel);
  const comparaValida = comparar !== null && (desde === null || comparar >= desde);
  const respPrev = useDatosMapa(metrica === "cambio" && comparaValida ? urlMapa(eleccion, comparar!, ent.id, nivel, enfoque) : null);
  const datos = resp?.unidades ?? null;
  const prep = resp?.prep ?? null;
  useEffect(() => { setSel(null); }, [eleccion, anio, nivel]);
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

  const porId = useMemo(() => porIdDe(resp) ?? new Map<number, UnidadMapa>(), [resp]);
  const prev = useMemo(() => metrica !== "cambio" || comparar === null ? null : comparaValida ? porIdDe(respPrev) : new Map<number, UnidadMapa>(), [metrica, comparar, comparaValida, respPrev]);
  const enMapa = useMemo(() => (datos ?? []).filter((u) => conPoligono.has(u.id)), [datos, conPoligono]);
  const capa = useCapaMapa({ unidades: enMapa, metrica, partido, enfoque, vista, prev, resaltar });
  const sinPoligono = (datos ?? []).length - enMapa.length;
  const etiquetas = useMemo(() => nivel === "seccion" ? undefined : nivel === "municipio" ? nombres
    : Object.fromEntries(Object.entries(nombres).map(([k, v]) => [k, v.replace("Distrito ", "")])), [nivel, nombres]);
  const s = sel !== null ? porId.get(sel) : undefined;
  const abreFoco = nivel !== "seccion";
  const etqComparar = comparar !== null ? `${comparar}` : undefined;
  const ficha = (id: number, completo = false) => <FichaUnidad nombre={nombres[id] ?? String(id)} u={porId.get(id)} metrica={metrica} partido={partido}
    prev={prev?.get(id) ?? null} comparar={etqComparar} completo={completo} />;

  const abrir = (id: number | null) => {
    if (id === null) return;
    if (nivel === "seccion") { setSel(id); return; }
    if (onRuta && nivel === "municipio") onRuta({ ...RUTA_VACIA, municipio: id });
    else if (onRuta && nivel === "distrito_local") onRuta({ ...RUTA_VACIA, dl: id });
    else setFoco({ tipo: nivel, id, nombre: nombres[id] ?? String(id) });
    caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section ref={caja} className="material p-4 space-y-4 scroll-mt-20" aria-labelledby="mapa-ent-t">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <nav aria-label="Ruta del mapa" className="mapa-ruta">
            {onSalir ? <button type="button" onClick={onSalir}>México</button> : <span className="label">Cartografía del INE</span>}
            <ChevronRight size={12} aria-hidden />
            {foco ? <button type="button" onClick={cerrarFoco}>{ent.nombre}</button> : <span aria-current="page">{ent.nombre}</span>}
            {foco && <><ChevronRight size={12} aria-hidden /><span aria-current="page">{foco.nombre}</span></>}
            {foco?.tipo === "municipio" && ruta.dl > 0 && <><ChevronRight size={12} aria-hidden /><span aria-current="page">Distrito local {ruta.dl % 100}</span></>}
          </nav>
          <h2 id="mapa-ent-t" className="text-2xl font-bold">
            {foco ? `${foco.tipo === "municipio" ? `${foco.nombre}${ruta.dl ? `, distrito local ${ruta.dl % 100}` : ""}` : `${ent.nombre}, ${UNIDAD[foco.tipo][0]} ${foco.nombre.replace("Distrito ", "")}`} sección por sección` : `${ent.nombre} por dentro`}
            <span className="font-normal" style={{ color: "var(--fg-mute)" }}> · {nombreEleccion[eleccion] ?? eleccion} {anio}</span>
          </h2>
        </div>
        {foco ? (
          <button type="button" className="btn btn-gris" onClick={cerrarFoco}><ArrowLeft size={15} />Volver a {ent.nombre}</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
          {onSalir && <button type="button" className="btn btn-gris" onClick={onSalir}><ArrowLeft size={15} />Todo el país</button>}
          <div className="seg" role="group" aria-label="Nivel del mapa">
            {niveles.map((n) => <button key={n.id} type="button" aria-pressed={nivel === n.id} disabled={!!n.no} title={n.no} onClick={() => setNivel(n.id)}
              style={n.no ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>{n.t}</button>)}
          </div>
          </div>
        )}
      </div>

      {prep && <AvisoPrep meta={prep} />}
      {metrica === "cambio" && comparar !== null && !comparaValida && !foco && (
        <p className="aviso text-sm">En {comparar} los {UNIDAD[nivel][1]} eran otra distritación (esta vale desde {desde}): no se comparan. Usa municipios o secciones, o compara contra un año desde {desde}.</p>)}
      {foco ? (
        <MapaFoco key={`${foco.tipo}-${foco.id}`} ent={ent} foco={foco} padre={nivel === foco.tipo ? porId.get(foco.id) : undefined}
          dl={foco.tipo === "municipio" ? ruta.dl : 0} seccion={ruta.seccion} onSeccion={onRuta ? (sec) => onRuta({ ...ruta, municipio: foco.tipo === "municipio" ? foco.id : ruta.municipio, seccion: sec ?? 0 }) : undefined} eleccion={eleccion} anio={anio} metrica={metrica} partido={partido} vista={vista} comparar={comparar} anios={resp?.anios ?? []} />
      ) : (
        <>
          {niveles.filter((n) => n.no).map((n) => <p key={n.id} className="text-xs" style={{ color: "var(--fg-mute)" }}>{n.t}: {n.no}</p>)}
          {vista === "historia" ? (
            <Historia ent={ent} url={url} nivel={nivel} eleccion={eleccion} anio={anio} anios={resp?.anios ?? []} metrica={metrica} partido={partido}
              nombre={(id) => nombres[id] ?? String(id)} contorno={nivel === "seccion" ? `/geo/${ent.id}/municipios.geojson` : null} unidad={UNIDAD[nivel]} />
          ) : (
            <>
              {abreFoco && <p className="mapa-pista"><MousePointerClick size={15} aria-hidden />Toca un {UNIDAD[nivel][0]} para abrirlo solo, sección por sección.</p>}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div>
                  {datos === null ? <div className="skeleton w-full" style={{ aspectRatio: "800 / 560" }} /> : (
                    <MapaGeo key={url} url={url} colores={capa.colores} circulos={capa.circulos} bordes={capa.bordes} seleccion={sel} onSelect={abrir} resaltar={capa.resaltados}
                      etiquetas={vista === "areas" ? etiquetas : undefined} etiquetaMin={nivel === "municipio" ? 2600 : 900}
                      contorno={nivel === "seccion" ? `/geo/${ent.id}/municipios.geojson` : null} tooltip={(id) => ficha(id)} />
                  )}
                </div>
                <div className="space-y-4">
                  {s && sel !== null ? (
                    <div className="mapa-detalle space-y-2">
                      {ficha(sel, true)}
                      <button type="button" className="chip" onClick={() => setSel(null)}>Quitar selección</button>
                    </div>
                  ) : (
                    <>
                      {resumen}
                      <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Pasa el cursor sobre el mapa para ver cada {UNIDAD[nivel][0]}{abreFoco ? "." : "; tócala para fijarla aquí."}</p>
                    </>
                  )}
                  <LeyendaMapa {...capa.ley} unidad={UNIDAD[nivel]} onHover={setResaltar}
                    titulo={metrica === "competitividad" ? (enfoque === "general" ? "Competitividad" : `Desde ${enfoque.toUpperCase()}`) : undefined} />
                  {datos && datos.length === 0 && <p className="text-sm">Sin datos de {nombreEleccion[eleccion] ?? eleccion} {anio} a nivel de {UNIDAD[nivel][1]} en {ent.nombre}.</p>}
                </div>
              </div>
            </>
          )}
          <ul className="nota-metodo text-xs" style={{ color: "var(--fg-mute)" }}>
            <li>Polígonos de la Base Geográfica Digital del INE ({ent.secciones.toLocaleString("es-MX")} secciones). Resultados: {prep ? "actas contabilizadas de mayoría relativa, sin las especiales de representación proporcional; las actas sin sección (voto anticipado, prisión preventiva) cuentan solo en su distrito" : "cómputos oficiales"}; el ganador es por candidatura (cada partido sumado a su coalición en esa boleta), una lectura analítica.</li>
            {nivel === "seccion" && <li>La cartografía es la vigente: el INE resecciona cada año. {sinPoligono > 0 ? `${fmtN(sinPoligono)} secciones con resultados en ${anio} ya no existen en esta cartografía y no se dibujan.` : `Todas las secciones con resultados en ${anio} tienen polígono.`} Las que aparecen en gris no tienen resultados en esta elección.</li>}
            {(nivel === "distrito" || nivel === "distrito_local") && <li>{UNIDAD[nivel][1][0].toUpperCase() + UNIDAD[nivel][1].slice(1)} según la distritación vigente desde {desde}.</li>}
            <li>Arrastra para mover; rueda, doble clic o + / − para acercar. <Ayuda clave="mapa_entidad" tam={12} /></li>
          </ul>
        </>
      )}
    </section>
  );
}

/** Vista «Historia»: el mismo territorio en las últimas cuatro elecciones del cargo (hasta el año elegido), misma escala.
 *  Con la métrica «Cambio», cada mapa se compara con el anterior de la fila. */
function Historia({ ent, url, nivel, eleccion, anio, anios, metrica, partido, nombre, contorno, filtro, filtroQS = "", unidad }: {
  ent: EntidadGeo; url: string; nivel: Nivel; eleccion: string; anio: number; anios: number[]; metrica: Metrica; partido: string;
  nombre: (id: number) => string; contorno?: string | null; filtro?: { prop: string; valor: number; y?: { prop: string; valor: number } } | null; filtroQS?: string; unidad: [string, string];
}) {
  const desde = vigenteDesde(ent, nivel);
  const validos = anios.filter((a) => a <= anio && (desde === null || a >= desde));
  const ultimos = validos.slice(-4);
  if (!anios.length) return <div className="skeleton w-full" style={{ aspectRatio: "800 / 500" }} />;
  return (
    <div className="space-y-2">
      <p className="text-sm" style={{ color: "var(--fg-soft)" }}>
        {nombreEleccion[eleccion] ?? eleccion} en {ent.nombre}: {ultimos.length < 2 ? "solo hay una elección" : `las ${ultimos.length} últimas`} {desde !== null ? `desde ${desde} (distritación vigente)` : ""}. Misma escala en todos; el recuadro marca el año elegido.
        {metrica === "cambio" && " Con «Cambio», cada mapa se compara con el anterior de la fila (el primero no tiene con qué)."}
      </p>
      <div className="mapa-multi">
        {ultimos.map((a, i) => (
          <MapaMini key={a} ent={ent} url={url} nivel={nivel} eleccion={eleccion} anio={a} anterior={i > 0 ? ultimos[i - 1] : null} actual={a === anio}
            metrica={metrica} partido={partido} nombre={nombre} contorno={contorno} filtro={filtro} filtroQS={filtroQS} unidad={unidad} />))}
      </div>
    </div>
  );
}

function MapaMini({ ent, url, nivel, eleccion, anio, anterior, actual, metrica, partido, nombre, contorno, filtro, filtroQS, unidad }: {
  ent: EntidadGeo; url: string; nivel: Nivel; eleccion: string; anio: number; anterior: number | null; actual: boolean; metrica: Metrica; partido: string;
  nombre: (id: number) => string; contorno?: string | null; filtro?: { prop: string; valor: number } | null; filtroQS: string; unidad: [string, string];
}) {
  const { enfoque } = useEnfoque();
  const r = useDatosMapa(urlMapa(eleccion, anio, ent.id, nivel, enfoque, filtroQS));
  const rp = useDatosMapa(metrica === "cambio" && anterior !== null ? urlMapa(eleccion, anterior, ent.id, nivel, enfoque, filtroQS) : null);
  const porId = useMemo(() => porIdDe(r) ?? new Map<number, UnidadMapa>(), [r]);
  const prev = useMemo(() => metrica !== "cambio" ? null : anterior === null ? new Map<number, UnidadMapa>() : porIdDe(rp), [metrica, anterior, rp]);
  const capa = useCapaMapa({ unidades: r?.unidades ?? [], metrica, partido, enfoque, vista: "areas", prev });
  const gan = useMemo(() => {
    const m = new Map<string, number>(); for (const u of r?.unidades ?? []) if (u.ganador) m.set(u.ganador, (m.get(u.ganador) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 2);
  }, [r]);
  return (
    <div data-actual={actual || undefined} className="space-y-1">
      <p className="text-sm font-bold">{anio}<MarcaPrep eleccion={eleccion} anio={anio} />{anterior !== null && metrica === "cambio" && <span className="font-normal text-xs" style={{ color: "var(--fg-mute)" }}> frente a {anterior}</span>}</p>
      {!r ? <div className="skeleton w-full" style={{ aspectRatio: "800 / 560" }} /> : (
        <MapaGeo url={url} filtro={filtro} colores={capa.colores} bordes={capa.bordes} contorno={contorno} simple alto={420}
          tooltip={(id) => <FichaUnidad nombre={nombre(id)} u={porId.get(id)} metrica={metrica} partido={partido} prev={prev?.get(id) ?? null} comparar={anterior ? String(anterior) : undefined} />} />
      )}
      <p className="text-xs" style={{ color: "var(--fg-soft)" }}>
        {gan.map(([p, n]) => <span key={p} className="mr-2"><span className="mapa-ley-c inline-block align-middle mr-1" style={{ background: colorPartido(p) }} />{nombreCandidatura(p)} {n}</span>)}
        <span style={{ color: "var(--fg-mute)" }}>· {fmt(r?.unidades.length ?? 0)} {unidad[1]}{capa.ley.nota && metrica !== "ganador" ? ` · ${capa.ley.nota}` : ""}</span>
      </p>
    </div>
  );
}

/** Un municipio o distrito solo: sus secciones en el mapa (encuadrado en él, con el número de cada sección) y en una tabla. */
function MapaFoco({ ent, foco, padre, eleccion, anio, metrica, partido, vista, comparar, anios, dl = 0, seccion = 0, onSeccion }: {
  ent: EntidadGeo; foco: Foco; padre: UnidadMapa | undefined; eleccion: string; anio: number; metrica: Metrica; partido: string;
  vista: Vista; comparar: number | null; anios: number[];
  /** dentro de un municipio, solo las secciones de este distrito local (cartografía vigente) */ dl?: number;
  /** sección elegida en el filtro de la pantalla; tocar una sección la avisa con onSeccion */ seccion?: number; onSeccion?: (id: number | null) => void;
}) {
  const { enfoque } = useEnfoque();
  const [info, setInfo] = useState<Record<number, InfoSeccion>>({});
  const [nomMun, setNomMun] = useState<Record<number, string>>({});
  const [sel, setSelLocal] = useState<number | null>(seccion || null);
  useEffect(() => { setSelLocal(seccion || null); }, [seccion]);
  const setSel = (id: number | null) => { setSelLocal(id); onSeccion?.(id); };
  const [resaltar, setResaltar] = useState<string | null>(null);
  const [orden, setOrden] = useState<"margen" | "seccion" | "participacion">("margen");
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [sectorDe, setSectorDe] = useState<Record<number, string>>({});
  const [limite, setLimite] = useState<Limite | null>(LIMITES_DE[foco.tipo][0]);
  useEffect(() => {
    setSectores([]); setSectorDe({});
    if (foco.tipo !== "municipio") return;
    api<{ secciones: Record<number, string>; sectores: Sector[] }>(`/api/sectores?municipio=${foco.id}`)
      .then((d) => { setSectores(d.sectores); setSectorDe(d.secciones); if (d.sectores.length) setLimite("sector"); }).catch(() => {});
  }, [foco.tipo, foco.id]);
  const opciones: Limite[] = [...LIMITES_DE[foco.tipo], ...(sectores.length ? ["sector" as const] : [])];
  const idxSector = useMemo(() => new Map(sectores.map((x, i) => [x.sector, i])), [sectores]);
  /** Grupo de una sección para el límite elegido (los sectores vienen de lib/sectores; distritos y municipios, de la cartografía) */
  const grupoDe = (l: Limite, id: number): number | undefined => l === "sector" ? idxSector.get(sectorDe[id]) : info[id]?.[l];
  const [grupoHover, setGrupoHover] = useState<number | null>(null);
  const prop = PROP_SECCION[foco.tipo];
  const url = `/geo/${ent.id}/secciones.geojson`;
  // Distrito local: se arma con la cartografía vigente (vale con cualquier cargo y año): se piden las secciones de la entidad y se recortan
  const geografico = foco.tipo === "distrito_local";
  const filtroQS = geografico ? "" : `&${foco.tipo}=${foco.id}`;

  // Distrito: «Cambio» solo contra años de la misma distritación (las secciones de un distrito de otra era no son las mismas)
  const desdeFoco = vigenteDesde(ent, foco.tipo);
  const comparaValida = comparar !== null && (desdeFoco === null || comparar >= desdeFoco);
  const resp = useDatosMapa(urlMapa(eleccion, anio, ent.id, "seccion", enfoque, filtroQS));
  const respPrev = useDatosMapa(metrica === "cambio" && comparaValida ? urlMapa(eleccion, comparar!, ent.id, "seccion", enfoque, filtroQS) : null);
  // Con distrito local: solo las secciones del municipio que caen en él (la lista de la base se recorta con la cartografía)
  const [infoDe, setInfoDe] = useState("");
  const recorta = dl > 0 || geografico;
  const datos = resp && (!recorta || infoDe === `${foco.id}-${dl}`) ? (recorta ? resp.unidades.filter((u) => info[u.id]) : resp.unidades) : null;
  useEffect(() => {
    cargarGeo(url).then((g) => { setInfoDe(`${foco.id}-${dl}`); setInfo(Object.fromEntries(g.features.filter((f) => Number(f.properties[prop]) === foco.id && (!dl || Number(f.properties.dl) === dl)).map((f) => {
      const p = f.properties as { id: number; seccion: number; municipio: number; df: number; dl: number };
      return [p.id, { n: String(p.seccion), municipio: p.municipio, df: p.df, dl: p.dl }];
    }))); });
  }, [url, prop, foco.id, dl]);
  useEffect(() => {
    cargarGeo(`/geo/${ent.id}/municipios.geojson`).then((g) => setNomMun(Object.fromEntries(g.features.map((f) => [Number(f.properties.id), String(f.properties.nombre)]))));
  }, [ent.id]);
  const numeros = useMemo(() => Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.n])), [info]);
  /** Nombre de un grupo del límite elegido (DF 6, DL 9, Torreón, Sector 8A) */
  const nombreGrupo = (l: Limite, v: number) => l === "municipio" ? (nomMun[v] ?? String(v)) : l === "sector" ? `Sector ${sectores[v]?.sector ?? "?"}` : `${LIMITES[l].corto} ${v % 100}`;
  const grupos = useMemo(() => {
    if (!limite) return null;
    if (limite === "sector") {
      const asignacion = Object.fromEntries(Object.keys(info).map((k) => [k, grupoDe("sector", Number(k))]).filter(([, v]) => v !== undefined)) as Record<number, number>;
      return { prop: "sector", asignacion, etiquetas: Object.fromEntries(sectores.map((x, i) => [i, x.sector])),
        colores: Object.fromEntries(sectores.map((_, i) => [i, COLOR_SECTOR[i % COLOR_SECTOR.length]])) };
    }
    const vs = [...new Set(Object.values(info).map((x) => x[limite]))];
    return { prop: limite, etiquetas: Object.fromEntries(vs.map((v) => [v, nombreGrupo(limite, v)])) };
  }, [limite, info, nomMun, sectores, sectorDe]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtro = useMemo(() => ({ prop, valor: foco.id, ...(dl ? { y: { prop: "dl", valor: dl } } : {}) }), [prop, foco.id, dl]);
  const porId = useMemo(() => porIdDe(resp) ?? new Map<number, UnidadMapa>(), [resp]);
  const prev = useMemo(() => metrica !== "cambio" || comparar === null ? null : comparaValida ? porIdDe(respPrev) : new Map<number, UnidadMapa>(), [metrica, comparar, comparaValida, respPrev]);
  const enMapa = useMemo(() => (datos ?? []).filter((u) => numeros[u.id] !== undefined), [datos, numeros]);
  const capa = useCapaMapa({ unidades: enMapa, metrica, partido, enfoque, vista, prev, resaltar });
  const idsResaltados = useMemo(() => grupoHover !== null && limite
    ? new Set(Object.keys(info).map(Number).filter((id) => grupoDe(limite, id) === grupoHover)) : capa.resaltados, [grupoHover, limite, info, capa.resaltados, sectorDe, idxSector]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resumen por grupo (p. ej. cada distrito dentro del municipio): secciones, votos, participación y secciones ganadas por candidatura
  const porGrupo = useMemo(() => {
    if (!limite) return [];
    const m = new Map<number, { v: number; n: number; vt: number; ln: number; faltan: number; alcanzables: number; gan: Map<string, number> }>();
    for (const u of limite === "sector" ? datos ?? [] : enMapa) {
      const v = grupoDe(limite, u.id); if (v === undefined) continue;
      const g = m.get(v) ?? { v, n: 0, vt: 0, ln: 0, faltan: 0, alcanzables: 0, gan: new Map() };
      g.n++; g.vt += u.votos_totales ?? 0; g.ln += u.lista_nominal ?? 0;
      if (u.ganador) g.gan.set(u.ganador, (g.gan.get(u.ganador) ?? 0) + 1);
      if (u.faltan != null && (u.margen_enfoque ?? -99) >= -15) { g.faltan += u.faltan; g.alcanzables++; }
      m.set(v, g);
    }
    return [...m.values()].sort((a, b) => a.v - b.v);
  }, [limite, enMapa, info, datos, sectorDe, idxSector]); // eslint-disable-line react-hooks/exhaustive-deps
  const nPoligonos = Object.keys(numeros).length;
  const sinPoligono = (datos ?? []).length - enMapa.length;
  const sinDatos = nPoligonos - enMapa.length;
  const margenDe = (u: UnidadMapa) => enfoque !== "general" ? u.margen_enfoque : u.margen;
  const cambio = (u: UnidadMapa) => { const a = prev?.get(u.id); return a?.ganador && u.ganador ? (u.alc[partido] ?? 0) - (a.alc[partido] ?? 0) : null; };
  const filas = useMemo(() => [...(datos ?? [])].sort((a, b) =>
    orden === "seccion" ? (a.id % 10000) - (b.id % 10000)
      : orden === "participacion" ? (b.participacion ?? -1) - (a.participacion ?? -1)
      : enfoque !== "general" ? Math.abs(a.margen_enfoque ?? 999) - Math.abs(b.margen_enfoque ?? 999) : (a.margen ?? 999) - (b.margen ?? 999)),
  [datos, orden, enfoque]);
  const s = sel !== null ? porId.get(sel) : undefined;
  const nombre = (id: number) => {
    const x = info[id];
    const sec = sectorDe[id] ? sectores[idxSector.get(sectorDe[id])!] : undefined;
    const extra = x ? (foco.tipo === "municipio" ? [`DF ${x.df % 100}`, `DL ${x.dl % 100}`, sec ? `Sector ${sec.sector}` : ""] : [nomMun[x.municipio], foco.tipo === "distrito" ? `DL ${x.dl % 100}` : `DF ${x.df % 100}`]).filter(Boolean).join(" · ") : "";
    return `Sección ${x?.n ?? id % 10000}${extra ? ` · ${extra}` : ""}`;
  };
  const etqComparar = comparar !== null ? String(comparar) : undefined;
  const conObjetivos = enfoque !== "general";

  return (
    <>
      {metrica === "cambio" && comparar !== null && !comparaValida && (
        <p className="aviso text-sm">En {comparar} este distrito era de otra distritación (esta vale desde {desdeFoco}): no se compara. Abre un municipio, o compara contra un año desde {desdeFoco}.</p>)}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Límites</span>
        <div className="seg" role="group" aria-label="Límites dibujados encima">
          <button type="button" aria-pressed={limite === null} onClick={() => setLimite(null)}>Ninguno</button>
          {opciones.map((l) => <button key={l} type="button" aria-pressed={limite === l} onClick={() => setLimite(l)}>{LIMITES[l].t}</button>)}
        </div>
      </div>
      {vista === "historia" ? (
        <Historia ent={ent} url={url} nivel={foco.tipo === "municipio" ? "seccion" : foco.tipo} eleccion={eleccion} anio={anio} anios={anios} metrica={metrica} partido={partido}
          nombre={nombre} filtro={filtro} filtroQS={filtroQS} unidad={UNIDAD.seccion}
          contorno={limite && LIMITES[limite].archivo ? `/geo/${ent.id}/${LIMITES[limite].archivo}.geojson` : null} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            {datos === null ? <div className="skeleton w-full" style={{ aspectRatio: "800 / 560" }} /> : (
              <MapaGeo key={`${foco.tipo}-${foco.id}`} url={url} filtro={filtro} grupos={grupos} contorno={limite && LIMITES[limite].archivo ? `/geo/${ent.id}/${LIMITES[limite].archivo}.geojson` : null}
                colores={capa.colores} circulos={capa.circulos} bordes={capa.bordes} seleccion={sel} onSelect={setSel} resaltar={idsResaltados}
                etiquetas={vista === "areas" ? numeros : undefined} etiquetaMin={420}
                tooltip={(id) => <FichaUnidad nombre={nombre(id)} u={porId.get(id)} metrica={metrica} partido={partido} prev={prev?.get(id) ?? null} comparar={etqComparar} nota="Sin resultados de esta elección en esta sección" />} />
            )}
          </div>
          <div className="space-y-4">
            {padre && (
              <div className="mapa-detalle">
                <p className="label pb-1">Todo {foco.tipo === "municipio" ? "el municipio" : "el distrito"}</p>
                <FichaUnidad nombre={foco.nombre} u={padre} metrica={metrica} partido={partido} completo />
              </div>
            )}
            {s && sel !== null ? (
              <div className="mapa-detalle space-y-2" style={{ boxShadow: "inset 3px 0 0 var(--accion)" }}>
                <FichaUnidad nombre={nombre(sel)} u={s} metrica={metrica} partido={partido} prev={prev?.get(sel) ?? null} comparar={etqComparar} />
                <button type="button" className="chip" onClick={() => setSel(null)}>Quitar selección</button>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Toca una sección en el mapa o en la tabla para fijarla aquí.</p>
            )}
            <LeyendaMapa {...capa.ley} unidad={UNIDAD.seccion} onHover={setResaltar}
              titulo={metrica === "competitividad" ? (enfoque === "general" ? "Competitividad" : `Desde ${enfoque.toUpperCase()}`) : undefined} />
          </div>
        </div>
      )}

      <PanoramaTerritorio ent={ent} foco={foco} padre={padre} secciones={datos} eleccion={eleccion} anio={anio} />

      {limite && porGrupo.length > 0 && (
        <div className="space-y-2">
          <p className="font-bold">{LIMITES[limite].t} dentro de {foco.tipo === "municipio" ? foco.nombre : "este distrito"} <span className="font-normal text-sm" style={{ color: "var(--fg-mute)" }}>· pasa el cursor por una fila para ubicarlo</span></p>
          <div className="overflow-auto">
            <table className="t">
              <thead><tr><th>{limite === "municipio" ? "Municipio" : limite === "sector" ? "Sector" : "Distrito"}</th><th>Secciones</th><th>Votos</th><th>Particip.</th>
                {conObjetivos && <th title={`Secciones que ${enfoque.toUpperCase()} pierde por 15 puntos o menos, y votos que le faltan en conjunto`}>Al alcance · votos que faltan</th>}<th>Secciones ganadas</th></tr></thead>
              <tbody>{porGrupo.map((g) => {
                const gan = [...g.gan].sort((a, b) => b[1] - a[1]);
                return (
                  <tr key={g.v} onPointerEnter={() => setGrupoHover(g.v)} onPointerLeave={() => setGrupoHover(null)} tabIndex={0}
                    onFocus={() => setGrupoHover(g.v)} onBlur={() => setGrupoHover(null)}
                    style={grupoHover === g.v ? { background: "color-mix(in srgb, var(--fg) 6%, transparent)" } : undefined}>
                    <td className="font-semibold whitespace-nowrap">{limite === "sector" && <span className="mapa-ley-c inline-block mr-1.5 align-middle" style={{ background: COLOR_SECTOR[g.v % COLOR_SECTOR.length] }} />}{nombreGrupo(limite, g.v)}</td>
                    <td className="num">{fmtN(g.n)}</td>
                    <td className="num">{fmtN(g.vt)}</td>
                    <td className="num">{pct(g.ln ? (100 * g.vt) / g.ln : null)}</td>
                    {conObjetivos && <td className="num">{g.alcanzables ? <><b>{g.alcanzables}</b> · <span style={{ color: "var(--rose)" }}>{fmtN(g.faltan)}</span></> : "—"}</td>}
                    <td className="min-w-[220px]">
                      <div className="mapa-barra" style={{ height: 9 }} aria-hidden>{gan.map(([p, n]) => <i key={p} style={{ flexGrow: n, background: colorPartido(p) }} />)}</div>
                      <span className="text-xs" style={{ color: "var(--fg-soft)" }}>{gan.slice(0, 3).map(([p, n]) => `${nombreCandidatura(p)} ${n}`).join(" · ")}</span>
                    </td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          {limite === "sector" ? <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Sectores: organización propia (no es una división del INE), cargada desde el archivo de secciones de Torreón 2024. Las secciones creadas después de 2024 heredan el sector de la sección de la que salieron; las de 2024 que ya no existen cuentan en su sector aunque no tengan polígono.</p> :
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Solo la parte de cada {limite === "municipio" ? "municipio" : "distrito"} que cae {foco.tipo === "municipio" ? "en este municipio" : "en este distrito"}, según la cartografía vigente ({limite === "df" ? `distritación federal vigente desde ${ent.df_desde}` : limite === "dl" ? `distritación local vigente desde ${ent.dl_desde}` : "límites municipales del INE"}). Votos y participación suman las secciones con polígono: no es el resultado oficial del distrito completo.</p>}
        </div>
      )}

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
              <thead><tr><th>Sección</th><th>Ganó</th><th>%</th><th>{enfoque === "general" ? "Margen" : `Margen ${enfoque.toUpperCase()}`}</th><th>{enfoque === "general" ? "Competencia" : `Desde ${enfoque.toUpperCase()}`}</th>
                {conObjetivos && <th>Le faltan</th>}{prev && <th>Cambio {partido.toUpperCase()}</th>}<th>Particip.</th><th>Votos</th></tr></thead>
              <tbody>{filas.map((u) => {
                const m = margenDe(u), c = prev ? cambio(u) : null;
                return (
                  <tr key={u.id} className="cursor-pointer" onClick={() => setSel(u.id === sel ? null : u.id)} aria-selected={u.id === sel}
                    style={u.id === sel ? { background: "color-mix(in srgb, var(--accion) 10%, transparent)" } : undefined}>
                    <td className="font-semibold num whitespace-nowrap">{u.id % 10000}{limite && grupoDe(limite, u.id) !== undefined && <span className="text-xs font-normal" style={{ color: "var(--fg-mute)" }}> · {nombreGrupo(limite, grupoDe(limite, u.id)!)}</span>}{numeros[u.id] === undefined && <span className="text-xs font-normal" style={{ color: "var(--fg-mute)" }} title="No existe en la cartografía vigente"> · sin polígono</span>}</td>
                    <td><span className="mapa-ley-c inline-block mr-1 align-middle" style={{ background: u.ganador ? colorPartido(u.ganador) : undefined }} />{u.ganador ? nombreCandidatura(u.ganador) : "—"}</td>
                    <td className="num">{pct(u.p_ganador)}</td>
                    <td className="num">{m === null ? "—" : `${enfoque !== "general" && m > 0 ? "+" : ""}${m.toFixed(1)}`}</td>
                    <td><CeldaClase clase={u.clase} /></td>
                    {conObjetivos && <td className="num" style={{ color: u.faltan != null ? "var(--rose)" : undefined }}>{u.faltan != null ? fmtN(u.faltan) : "—"}</td>}
                    {prev && <td className="num" style={{ color: c === null ? "var(--fg-mute)" : c >= 0 ? "var(--azul)" : "var(--rose)" }}>{c === null ? "sin comp." : `${c > 0 ? "+" : ""}${c.toFixed(1)}`}</td>}
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
        {conObjetivos && <li>«Le faltan»: votos de la candidatura ganadora − votos de la de {enfoque.toUpperCase()} + 1, en esa sección (no cuenta la participación nueva ni el voto que se pierda).</li>}
        <li>Las casillas especiales reciben votos de otras secciones: la participación de una sección puede pasar de 100%. El ganador es por candidatura (lectura analítica).</li>
      </ul>
    </>
  );
}
const fmtN = (n: number) => n.toLocaleString("es-MX");
