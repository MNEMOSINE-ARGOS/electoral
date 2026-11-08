"use client";
import { useEffect, useState } from "react";
import { api, type Estado, type Municipio } from "@/lib/api";
import type { Opcion } from "@/components/Buscador";
import { BuscadorMulti } from "@/components/BuscadorMulti";
import { MAX_TERR } from "@/components/FiltroTerritorio";

/** Entidades y municipios elegidos (vacío = todos). `nombres` guarda la etiqueta de cada municipio elegido. */
export type Sel = { estados: number[]; municipios: number[]; nombres: Record<number, string> };
export const SEL_VACIA: Sel = { estados: [], municipios: [], nombres: {} };
/** Un territorio de la selección: entidad (municipio = 0) o municipio. */
export type Lugar = { estado: number; municipio: number; nombre: string };

/** Territorios a analizar: los municipios elegidos o, si no hay, las entidades (o Nacional si `permiteNacional`). */
export function lugares(s: Sel, estados: Estado[]): Lugar[] {
  if (s.municipios.length) return s.municipios.map((m) => ({ estado: Math.floor(m / 1000), municipio: m, nombre: s.nombres[m] ?? String(m) }));
  if (s.estados.length) return s.estados.map((e) => ({ estado: e, municipio: 0, nombre: estados.find((x) => x.id_estado === e)?.nombre_corto ?? String(e) }));
  return [{ estado: 0, municipio: 0, nombre: "Nacional" }];
}

/** Selector de territorio con autocompletado y selección múltiple: entidades → municipios (solo los de las entidades elegidas).
 *  permiteNacional=false obliga a elegir entidad. `max` limita cuántas entidades y municipios se eligen. */
export function Territorio({ estados, valor, onChange, permiteNacional = true, conMunicipio = true, max = MAX_TERR, maxEstados }: {
  estados: Estado[]; valor: Sel; onChange: (s: Sel) => void; permiteNacional?: boolean; conMunicipio?: boolean; max?: number; maxEstados?: number;
}) {
  const [muns, setMuns] = useState<Opcion[]>([]);
  const est = valor.estados.join(","), varios = valor.estados.length > 1;
  useEffect(() => {
    if (!est || !conMunicipio) { setMuns([]); return; }
    let vivo = true;
    api<{ municipios: Municipio[] }>(`/api/municipios?estado=${est}`).then((d) => vivo && setMuns(d.municipios.map((m) => ({ valor: m.clave_inegi, etiqueta: m.nombre, sub: varios ? m.abreviatura : undefined }))));
    return () => { vivo = false; };
  }, [est, conMunicipio, varios]);

  return (
    <div className="flex flex-wrap gap-3">
      <BuscadorMulti etiqueta="Entidad" ancho="w-56" todos={permiteNacional ? "Todo el país" : "Ninguna"} placeholder={permiteNacional ? "Todo el país" : "Escribe una entidad…"} valores={valor.estados}
        max={maxEstados ?? max} opciones={estados.map((e) => ({ valor: e.id_estado, etiqueta: e.nombre_corto, sub: e.abreviatura }))}
        onChange={(v) => onChange({ estados: v, municipios: valor.municipios.filter((m) => v.includes(Math.floor(m / 1000))), nombres: valor.nombres })} />
      {conMunicipio && (
        <BuscadorMulti etiqueta="Municipio" ancho="w-64" todos="Todos los municipios" deshabilitado={!valor.estados.length} placeholder={valor.estados.length ? "Todos los municipios" : "Elige una entidad"}
          valores={valor.municipios} opciones={muns} max={max} nombres={valor.nombres}
          onChange={(v) => onChange({ ...valor, municipios: v, nombres: { ...valor.nombres, ...Object.fromEntries(muns.filter((o) => v.includes(o.valor)).map((o) => [o.valor, o.etiqueta])) } })} />
      )}
    </div>
  );
}
