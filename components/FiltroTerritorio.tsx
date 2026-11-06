"use client";
import { useEffect, useState } from "react";
import { MapPin, RotateCcw } from "lucide-react";
import { api, type Estado } from "@/lib/api";
import { Buscador, type Opcion } from "@/components/Buscador";

export type Terr = { estado: number; distrito: number; municipio: number; seccion: number; nombre: string; ctx: string };
export const NAC: Terr = { estado: 0, distrito: 0, municipio: 0, seccion: 0, nombre: "", ctx: "" };
export const CON_DISTRITO = ["presidente", "senado", "diputados_federales", "diputados_locales_mr"];

export function nombreTerr(t: Terr, estados: Estado[]) {
  const e = estados.find((x) => x.id_estado === t.estado)?.nombre_corto ?? "";
  if (t.seccion) return `Sección ${t.seccion % 10000}${t.ctx ? ` · ${t.ctx}` : ""}`;
  if (t.municipio) return `${t.nombre} (${e})`;
  if (t.distrito) return `Distrito ${t.nombre}`;
  return t.estado ? e : "Nacional";
}

/** Entidad → Distrito (federal o local, según el cargo) o Municipio → Sección, con autocompletado. `anio` define las opciones de distritos y secciones. */
export function FiltroTerritorio({ estados, cargo, anio, valor, onChange }: { estados: Estado[]; cargo: string; anio: number | null; valor: Terr; onChange: (t: Terr) => void }) {
  const [optMun, setOptMun] = useState<Opcion[]>([]);
  const [optDis, setOptDis] = useState<Opcion[]>([]);
  const [optSec, setOptSec] = useState<Opcion[]>([]);
  useEffect(() => {
    if (!valor.estado) { setOptMun([]); return; }
    api<{ municipios: { clave_inegi: number; nombre: string }[] }>(`/api/municipios?estado=${valor.estado}`).then((d) => setOptMun(d.municipios.map((m) => ({ valor: m.clave_inegi, etiqueta: m.nombre }))));
  }, [valor.estado]);
  useEffect(() => {
    if (!valor.estado || !anio || !CON_DISTRITO.includes(cargo)) { setOptDis([]); return; }
    api<{ opciones: Opcion[] }>(`/api/opciones?tipo=distrito&eleccion=${cargo}&anio=${anio}&estado=${valor.estado}`).then((d) => setOptDis(d.opciones));
  }, [valor.estado, anio, cargo]);
  useEffect(() => {
    if (!valor.estado || !anio) { setOptSec([]); return; }
    const amb = valor.municipio ? `&municipio=${valor.municipio}` : valor.distrito ? `&distrito=${valor.distrito}` : "";
    api<{ opciones: Opcion[] }>(`/api/opciones?tipo=seccion&eleccion=${cargo}&anio=${anio}&estado=${valor.estado}${amb}`).then((d) => setOptSec(d.opciones));
  }, [valor.estado, valor.municipio, valor.distrito, anio, cargo]);
  const ab = estados.find((e) => e.id_estado === valor.estado)?.abreviatura ?? "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="label flex items-center gap-1.5"><MapPin size={13} /> Territorio</p>
        <BotonLimpiar visible={!!(valor.estado || valor.distrito || valor.municipio || valor.seccion)} onClick={() => onChange(NAC)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Buscador etiqueta="Entidad" todos="Todo el país" valor={valor.estado} ancho="min-w-0"
          opciones={estados.map((e) => ({ valor: e.id_estado, etiqueta: e.nombre_corto, sub: e.abreviatura }))}
          onChange={(v, o) => onChange({ ...NAC, estado: v, nombre: o?.etiqueta ?? "" })} />
        {CON_DISTRITO.includes(cargo) && (
          <Buscador etiqueta={cargo === "diputados_locales_mr" ? "Distrito local" : "Distrito federal"} todos="Todos los distritos" valor={valor.distrito} ancho="min-w-0"
            deshabilitado={!valor.estado} placeholder={valor.estado ? "Todos los distritos" : "Elige una entidad"} opciones={optDis}
            onChange={(v) => onChange({ ...NAC, estado: valor.estado, distrito: v, nombre: v ? `${ab}-${v % 100}` : "" })} />
        )}
        <Buscador etiqueta="Municipio" todos="Todos los municipios" valor={valor.municipio} ancho="min-w-0"
          deshabilitado={!valor.estado} placeholder={valor.estado ? "Todos los municipios" : "Elige una entidad"} opciones={optMun}
          onChange={(v, o) => onChange({ ...NAC, estado: valor.estado, municipio: v, nombre: o?.etiqueta ?? "" })} />
        <Buscador etiqueta="Sección" todos="Todas las secciones" valor={valor.seccion} ancho="min-w-0"
          deshabilitado={!valor.estado} placeholder={valor.estado ? "Todas las secciones" : "Elige una entidad"} opciones={optSec}
          onChange={(v, o) => onChange({ ...valor, seccion: v, ctx: o?.sub ?? valor.nombre })} />
      </div>
    </div>
  );
}

/** Quita de un toque todos los filtros de territorio (vuelve a Nacional). */
export function BotonLimpiar({ visible, onClick, texto = "Limpiar filtros" }: { visible: boolean; onClick: () => void; texto?: string }) {
  if (!visible) return null;
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-[background-color,transform] duration-100 active:scale-95 entra"
      style={{ background: "var(--rose-soft)", color: "var(--rose-deep)" }}>
      <RotateCcw size={12} />{texto}
    </button>
  );
}
