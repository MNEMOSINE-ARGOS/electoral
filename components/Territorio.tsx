"use client";
import { useEffect, useState } from "react";
import { api, type Estado, type Municipio } from "@/lib/api";
import { Buscador, type Opcion } from "@/components/Buscador";

export type Sel = { estado: number; municipio: number };

/** Selector de territorio con autocompletado: entidad → municipio. permiteNacional=false obliga a elegir entidad. */
export function Territorio({ estados, valor, onChange, permiteNacional = true, conMunicipio = true }: {
  estados: Estado[]; valor: Sel; onChange: (s: Sel) => void; permiteNacional?: boolean; conMunicipio?: boolean;
}) {
  const [muns, setMuns] = useState<Opcion[]>([]);
  useEffect(() => {
    if (!valor.estado || !conMunicipio) { setMuns([]); return; }
    let vivo = true;
    api<{ municipios: Municipio[] }>(`/api/municipios?estado=${valor.estado}`).then((d) => vivo && setMuns(d.municipios.map((m) => ({ valor: m.clave_inegi, etiqueta: m.nombre }))));
    return () => { vivo = false; };
  }, [valor.estado, conMunicipio]);

  return (
    <div className="flex flex-wrap gap-3">
      <Buscador etiqueta="Entidad" ancho="w-56" todos={permiteNacional ? "Todo el país" : null} placeholder="Escribe una entidad…" valor={valor.estado}
        opciones={estados.map((e) => ({ valor: e.id_estado, etiqueta: e.nombre_corto, sub: e.abreviatura }))}
        onChange={(v) => onChange({ estado: v, municipio: 0 })} />
      {conMunicipio && (
        <Buscador etiqueta="Municipio" ancho="w-64" todos="Todos los municipios" deshabilitado={!valor.estado} placeholder={valor.estado ? "Todos los municipios" : "Elige una entidad"}
          valor={valor.municipio} opciones={muns} onChange={(v) => onChange({ ...valor, municipio: v })} />
      )}
    </div>
  );
}
