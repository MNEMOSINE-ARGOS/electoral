"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { colorUnidad, leyenda, type EntidadGeo, type Metrica, type UnidadMapa } from "@/lib/mapa";
import { nombreEleccion } from "@/lib/partidos";
import { useEnfoque } from "@/components/Enfoque";
import { MapaGeo, cargarGeo } from "@/components/MapaGeo";
import { FichaUnidad, LeyendaMapa } from "@/components/MapaPiezas";
import { Ayuda } from "@/components/Ayuda";

// Mapa de UNA entidad con cartografía del INE (public/geo/<id>/): municipios, distritos federales, distritos locales y secciones.
// Los distritos solo se dibujan en los años en que la cartografía coincide con la distritación (df_desde / dl_desde).
// Las secciones son las de la cartografía vigente: las de años anteriores que ya no existen quedan «sin polígono» y se cuentan.

type Nivel = "municipio" | "distrito" | "distrito_local" | "seccion";
const ARCHIVO: Record<Nivel, string> = { municipio: "municipios", distrito: "distritos_federales", distrito_local: "distritos_locales", seccion: "secciones" };
const UNIDAD: Record<Nivel, [string, string]> = { municipio: ["municipio", "municipios"], distrito: ["distrito federal", "distritos federales"], distrito_local: ["distrito local", "distritos locales"], seccion: ["sección", "secciones"] };
const FEDERALES = new Set(["presidente", "senado", "diputados_federales"]);

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
  useEffect(() => { if (!niveles.some((n) => n.id === nivel && !n.no)) setNivel("municipio"); }, [niveles, nivel]);

  const [datos, setDatos] = useState<UnidadMapa[] | null>(null);
  const [nombres, setNombres] = useState<Record<number, string>>({});
  const [conPoligono, setConPoligono] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [resaltar, setResaltar] = useState<string | null>(null);
  const [municipios, setMunicipios] = useState<{ id: number; nombre: string }[]>([]);
  const [zoomMun, setZoomMun] = useState<number | null>(null);

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
  useEffect(() => {
    cargarGeo(`/geo/${ent.id}/municipios.geojson`).then((g) => setMunicipios(g.features.map((f) => ({ id: Number(f.properties.id), nombre: String(f.properties.nombre) })).sort((a, b) => a.nombre.localeCompare(b.nombre))));
  }, [ent.id]);

  const porId = useMemo(() => new Map((datos ?? []).map((u) => [u.id, u])), [datos]);
  const colores = useMemo(() => Object.fromEntries((datos ?? []).map((u) => [u.id, colorUnidad(u, metrica, partido)])), [datos, metrica, partido]);
  const enMapa = useMemo(() => (datos ?? []).filter((u) => conPoligono.has(u.id)), [datos, conPoligono]);
  const ley = useMemo(() => leyenda(enMapa, metrica, partido, enfoque), [enMapa, metrica, partido, enfoque]);
  const sinPoligono = (datos ?? []).length - enMapa.length;
  const idsResaltados = useMemo(() => {
    if (!resaltar) return null;
    const i = ley.items.findIndex((x) => x.k === resaltar);
    return new Set(enMapa.filter((u) => {
      if (metrica === "ganador") return u.ganador === resaltar;
      if (metrica === "competitividad") return u.clase === resaltar;
      return colorUnidad(u, metrica, partido) === ley.items[i]?.color;
    }).map((u) => u.id));
  }, [resaltar, ley, enMapa, metrica, partido]);
  const etiquetas = useMemo(() => nivel === "seccion" ? undefined : nivel === "municipio" ? nombres
    : Object.fromEntries(Object.entries(nombres).map(([k, v]) => [k, v.replace("Distrito ", "")])), [nivel, nombres]);
  const actual = niveles.find((n) => n.id === nivel);
  const s = sel !== null ? porId.get(sel) : undefined;

  return (
    <section className="material p-4 space-y-4" aria-labelledby="mapa-ent-t">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <p className="label">Cartografía del INE</p>
          <h2 id="mapa-ent-t" className="text-2xl font-bold">{ent.nombre} por dentro · {nombreEleccion[eleccion] ?? eleccion} {anio}</h2>
        </div>
        <div className="seg" role="group" aria-label="Nivel del mapa">
          {niveles.map((n) => <button key={n.id} type="button" aria-pressed={nivel === n.id} disabled={!!n.no} title={n.no} onClick={() => setNivel(n.id)}
            style={n.no ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>{n.t}</button>)}
        </div>
      </div>
      {niveles.filter((n) => n.no).map((n) => <p key={n.id} className="text-xs" style={{ color: "var(--fg-mute)" }}>{n.t}: {n.no}</p>)}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          {nivel === "seccion" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="zoom-mun" style={{ color: "var(--fg-soft)" }}>Acercar a</label>
              <select id="zoom-mun" className="field" style={{ width: "auto" }} value={zoomMun ?? ""} onChange={(e) => setZoomMun(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Toda la entidad</option>
                {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
              <span className="text-xs" style={{ color: "var(--fg-mute)" }}>o usa la rueda del ratón / doble clic</span>
            </div>
          )}
          {datos === null ? <div className="skeleton w-full" style={{ aspectRatio: "800 / 560" }} /> : (
            <MapaGeo key={`${url}-${nivel === "seccion" ? zoomMun ?? "" : ""}`} url={url} colores={colores} seleccion={sel} onSelect={setSel} resaltar={idsResaltados}
              etiquetas={etiquetas}
              etiquetaMin={nivel === "municipio" ? 2600 : 900}
              contorno={nivel === "seccion" ? `/geo/${ent.id}/municipios.geojson` : null} encuadrar={nivel === "seccion" ? zoomMun : null}
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
            <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Pasa el cursor sobre el mapa para ver cada {UNIDAD[nivel][0]}; tócalo para fijarlo aquí.</p>
          )}
          <LeyendaMapa items={ley.items} escala={ley.escala} unidad={UNIDAD[nivel]} onHover={setResaltar}
            titulo={metrica === "competitividad" ? (enfoque === "general" ? "Competitividad" : `Desde ${enfoque.toUpperCase()}`) : undefined} />
          {datos && datos.length === 0 && <p className="text-sm">Sin datos de {nombreEleccion[eleccion] ?? eleccion} {anio} a nivel de {UNIDAD[nivel][1]} en {ent.nombre}.</p>}
        </div>
      </div>
      <ul className="nota-metodo text-xs" style={{ color: "var(--fg-mute)" }}>
        <li>Polígonos de la Base Geográfica Digital del INE ({ent.secciones.toLocaleString("es-MX")} secciones). Resultados: cómputos oficiales; el ganador es por candidatura (cada partido sumado a su coalición en esa boleta), una lectura analítica.</li>
        {nivel === "seccion" && <li>La cartografía es la vigente: el INE resecciona cada año. {sinPoligono > 0 ? `${fmtN(sinPoligono)} secciones con resultados en ${anio} ya no existen en esta cartografía y no se dibujan.` : `Todas las secciones con resultados en ${anio} tienen polígono.`} Las que aparecen en gris no tienen resultados en esta elección.</li>}
        {nivel === "seccion" && <li>Las casillas especiales reciben votos de otras secciones: la participación de una sección puede pasar de 100%.</li>}
        {actual && actual.id !== "municipio" && actual.id !== "seccion" && <li>{UNIDAD[nivel][1][0].toUpperCase() + UNIDAD[nivel][1].slice(1)} según la distritación vigente desde {nivel === "distrito" ? ent.df_desde : ent.dl_desde}.</li>}
        <li>Arrastra para mover y usa los botones + / − para acercar. <Ayuda clave="mapa_entidad" tam={12} /></li>
      </ul>
    </section>
  );
}
const fmtN = (n: number) => n.toLocaleString("es-MX");
