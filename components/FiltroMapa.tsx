"use client";
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Buscador, type Opcion } from "@/components/Buscador";
import { cargarGeo } from "@/components/MapaGeo";
import { RUTA_VACIA, type RutaMapa } from "@/components/MapaEntidad";
import type { EntidadGeo } from "@/lib/mapa";

type Sec = { id: number; seccion: number; municipio: number; dl: number };

/** Filtro del mapa nacional, siempre en este orden: Entidad → Municipio → Distrito local → Sección.
 *  Cada lista muestra solo lo que está dentro de lo elegido antes: los distritos locales que tocan el municipio, y las secciones
 *  del municipio y del distrito local. Municipios, distritos y secciones salen de la cartografía vigente del INE (public/geo/<id>/). */
export function FiltroMapa({ entidades, estado, ent, ruta, onEstado, onRuta }: {
  entidades: Opcion[]; estado: number | null; ent: EntidadGeo | undefined; ruta: RutaMapa;
  onEstado: (id: number | null) => void; onRuta: (r: RutaMapa) => void;
}) {
  const [muns, setMuns] = useState<Opcion[]>([]);
  const [secs, setSecs] = useState<Sec[]>([]);
  useEffect(() => {
    setMuns([]); setSecs([]);
    if (!ent) return;
    let vivo = true;
    cargarGeo(`/geo/${ent.id}/municipios.geojson`).then((g) => vivo && setMuns(g.features.map((f) => ({ valor: Number(f.properties.id), etiqueta: String(f.properties.nombre) }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es")))).catch(() => {});
    cargarGeo(`/geo/${ent.id}/secciones.geojson`).then((g) => vivo && setSecs(g.features.map((f) => {
      const p = f.properties as Sec;
      return { id: Number(p.id), seccion: Number(p.seccion), municipio: Number(p.municipio), dl: Number(p.dl) };
    }))).catch(() => {});
    return () => { vivo = false; };
  }, [ent]);

  const nomMun = useMemo(() => Object.fromEntries(muns.map((m) => [m.valor, m.etiqueta])), [muns]);
  const conDl = !!ent?.dl_desde;
  // Distritos locales: solo los que tienen secciones en el municipio elegido (o todos los de la entidad)
  const optDl = useMemo(() => {
    const n = new Map<number, number>();
    for (const s of secs) if (s.dl && (!ruta.municipio || s.municipio === ruta.municipio)) n.set(s.dl, (n.get(s.dl) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => a[0] - b[0]).map(([d, k]) => ({ valor: d, etiqueta: `Distrito local ${d % 100}`, sub: `${k.toLocaleString("es-MX")} secc.${ruta.municipio ? " aquí" : ""}` }));
  }, [secs, ruta.municipio]);
  // Secciones: las del municipio y del distrito local elegidos
  const optSec = useMemo(() => secs.filter((s) => (!ruta.municipio || s.municipio === ruta.municipio) && (!ruta.dl || s.dl === ruta.dl))
    .sort((a, b) => a.seccion - b.seccion).map((s) => ({ valor: s.id, etiqueta: String(s.seccion), sub: ruta.municipio ? undefined : nomMun[s.municipio] })), [secs, ruta.municipio, ruta.dl, nomMun]);

  function eligeMunicipio(m: number) {
    // El distrito local se conserva solo si toca el nuevo municipio
    const dl = ruta.dl && m && secs.some((s) => s.municipio === m && s.dl === ruta.dl) ? ruta.dl : m ? 0 : ruta.dl;
    onRuta({ municipio: m, dl, seccion: 0 });
  }
  function eligeSeccion(id: number) {
    // Una sección elegida sin municipio abre el suyo (el mapa de detalle es por municipio)
    const s = secs.find((x) => x.id === id);
    onRuta({ municipio: id ? ruta.municipio || s?.municipio || 0 : ruta.municipio, dl: ruta.dl, seccion: id });
  }
  const sinEnt = !ent;

  return (
    <div className="mapa-ctl"><span className="label flex items-center gap-1.5"><MapPin size={13} />Territorio</span>
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Buscador etiqueta="1 · Entidad" todos="Todo el país" valor={estado ?? 0} ancho="min-w-0" opciones={entidades} onChange={(v) => onEstado(v || null)} />
          <Buscador etiqueta="2 · Municipio" todos="Todos los municipios" valor={ruta.municipio} ancho="min-w-0" opciones={muns}
            deshabilitado={sinEnt} placeholder={sinEnt ? "Elige una entidad" : "Todos los municipios"} onChange={eligeMunicipio} />
          <Buscador etiqueta="3 · Distrito local" todos={ruta.municipio ? "Todos los del municipio" : "Todos los distritos"} valor={ruta.dl} ancho="min-w-0" opciones={optDl}
            deshabilitado={sinEnt || !conDl} placeholder={sinEnt ? "Elige una entidad" : !conDl ? "Sin cartografía de distritos locales" : ruta.municipio ? `${optDl.length} en ${nomMun[ruta.municipio] ?? "el municipio"}` : "Todos los distritos"}
            onChange={(v) => onRuta({ ...ruta, dl: v, seccion: v && ruta.seccion && !secs.some((s) => s.id === ruta.seccion && s.dl === v) ? 0 : ruta.seccion })} />
          <Buscador etiqueta="4 · Sección" todos="Todas las secciones" valor={ruta.seccion} ancho="min-w-0" opciones={optSec}
            deshabilitado={sinEnt} placeholder={sinEnt ? "Elige una entidad" : `${optSec.length.toLocaleString("es-MX")} secciones`} onChange={eligeSeccion} />
        </div>
        <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
          En orden: cada lista muestra solo lo que cae dentro de lo elegido antes (con un municipio, solo los distritos locales que lo tocan y sus secciones).
          Distritos y secciones son los de la cartografía vigente del INE{ent?.dl_desde ? ` (distritos locales desde ${ent.dl_desde})` : ""}; en elecciones anteriores
          la sección pudo cambiar y el distrito local era otro, así que el cruce es geográfico, no el distrito en que se votó ese año.
        </p>
      </div>
    </div>
  );
}

export { RUTA_VACIA };
