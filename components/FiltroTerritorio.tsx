"use client";
import { useEffect, useRef, useState } from "react";
import { Columns2, MapPin, RotateCcw } from "lucide-react";
import { api, type Estado } from "@/lib/api";
import type { Opcion } from "@/components/Buscador";
import { BuscadorMulti } from "@/components/BuscadorMulti";

export type Terr = { estado: number; distrito: number; municipio: number; seccion: number; nombre: string; ctx: string };
export const NAC: Terr = { estado: 0, distrito: 0, municipio: 0, seccion: 0, nombre: "", ctx: "" };
export const CON_DISTRITO = ["presidente", "senado", "diputados_federales", "diputados_locales_mr"];

/** Filtro de territorio con selección múltiple en cada nivel. `nombres` guarda la etiqueta de cada municipio («m5035»), distrito («d503») y sección («s50338»). */
export type FiltroT = { estados: number[]; distritos: number[]; municipios: number[]; secciones: number[]; nombres: Record<string, string> };
export const SIN_FILTRO: FiltroT = { estados: [], distritos: [], municipios: [], secciones: [], nombres: {} };
/** Cuántos territorios se pueden poner lado a lado por nivel */
export const MAX_TERR = 8;

export const estadoDe = { municipio: (id: number) => Math.floor(id / 1000), distrito: (id: number) => Math.floor(id / 100), seccion: (id: number) => Math.floor(id / 10000) };

/** Territorios que se analizan: los del nivel más específico con algo elegido (secciones > municipios o distritos > entidades > Nacional). */
export function territorios(f: FiltroT, estados: Estado[]): Terr[] {
  const ab = (e: number) => estados.find((x) => x.id_estado === e)?.abreviatura ?? "";
  const nom = (e: number) => estados.find((x) => x.id_estado === e)?.nombre_corto ?? "";
  if (f.secciones.length) return f.secciones.map((s) => ({ ...NAC, estado: estadoDe.seccion(s), seccion: s, ctx: f.nombres[`s${s}`] ?? ab(estadoDe.seccion(s)) }));
  if (f.municipios.length) return f.municipios.map((m) => ({ ...NAC, estado: estadoDe.municipio(m), municipio: m, nombre: f.nombres[`m${m}`] ?? String(m) }));
  if (f.distritos.length) return f.distritos.map((d) => ({ ...NAC, estado: estadoDe.distrito(d), distrito: d, nombre: `${ab(estadoDe.distrito(d))}-${d % 100}` }));
  if (f.estados.length) return f.estados.map((e) => ({ ...NAC, estado: e, nombre: nom(e) }));
  return [NAC];
}
export const hayFiltro = (f: FiltroT) => !!(f.estados.length || f.distritos.length || f.municipios.length || f.secciones.length);
/** Filtro de un solo territorio (para «entrar» a una entidad, municipio o distrito desde una tabla o un mapa) */
export function filtroDe(t: Terr): FiltroT {
  return {
    estados: t.estado ? [t.estado] : [], distritos: t.distrito ? [t.distrito] : [], municipios: t.municipio ? [t.municipio] : [], secciones: t.seccion ? [t.seccion] : [],
    nombres: { ...(t.municipio ? { [`m${t.municipio}`]: t.nombre } : {}), ...(t.seccion && t.ctx ? { [`s${t.seccion}`]: t.ctx } : {}) },
  };
}

export function nombreTerr(t: Terr, estados: Estado[]) {
  const e = estados.find((x) => x.id_estado === t.estado)?.nombre_corto ?? "";
  if (t.seccion) return `Sección ${t.seccion % 10000}${t.ctx ? ` · ${t.ctx}` : ""}`;
  if (t.municipio) return `${t.nombre} (${e})`;
  if (t.distrito) return `Distrito ${t.nombre}`;
  return t.estado ? e : "Nacional";
}
/** Nombre corto para encabezados de columnas lado a lado */
export function nombreCorto(t: Terr, estados: Estado[]) {
  if (t.seccion) return `Secc. ${t.seccion % 10000}${t.ctx ? ` · ${t.ctx}` : ""}`;
  if (t.municipio) return t.nombre;
  if (t.distrito) return `Dto. ${t.nombre}`;
  return t.estado ? estados.find((x) => x.id_estado === t.estado)?.nombre_corto ?? "" : "Nacional";
}
export const claveTerr = (t: Terr) => `${t.estado}-${t.distrito}-${t.municipio}-${t.seccion}`;

/** Entidad → Distrito (federal o local, según el cargo) o Municipio → Sección, con autocompletado y selección múltiple en cada nivel.
 *  Las listas de distritos, municipios y secciones muestran solo los de las entidades elegidas (y las secciones, solo las de los municipios o distritos elegidos).
 *  `anio` define las opciones de distritos y secciones; al cambiar de elección se quitan los distritos y secciones que ya no existen. */
export function FiltroTerritorio({ estados, cargo, anio, valor, onChange }: { estados: Estado[]; cargo: string; anio: number | null; valor: FiltroT; onChange: (f: FiltroT) => void }) {
  const [optMun, setOptMun] = useState<Opcion[]>([]);
  const [optDis, setOptDis] = useState<Opcion[]>([]);
  const [optSec, setOptSec] = useState<Opcion[]>([]);
  // El último valor, para depurar la selección cuando llegan opciones nuevas sin pisar un cambio reciente
  const ultimo = useRef(valor); ultimo.current = valor;
  const varios = valor.estados.length > 1;
  const conDistrito = CON_DISTRITO.includes(cargo);
  const est = valor.estados.join(","), mun = valor.municipios.join(","), dis = valor.distritos.join(",");
  const ab = (e: number) => estados.find((x) => x.id_estado === e)?.abreviatura ?? "";

  useEffect(() => {
    if (!est) { setOptMun([]); return; }
    let vivo = true;
    api<{ municipios: { clave_inegi: number; nombre: string; abreviatura?: string }[] }>(`/api/municipios?estado=${est}`)
      .then((d) => vivo && setOptMun(d.municipios.map((m) => ({ valor: m.clave_inegi, etiqueta: m.nombre, sub: varios ? m.abreviatura : undefined }))));
    return () => { vivo = false; };
  }, [est, varios]);
  useEffect(() => {
    if (!est || !anio || !conDistrito) { setOptDis([]); return; }
    let vivo = true;
    api<{ opciones: Opcion[] }>(`/api/opciones?tipo=distrito&eleccion=${cargo}&anio=${anio}&estado=${est}`).then((d) => {
      if (!vivo) return;
      setOptDis(d.opciones.map((o) => (varios ? { ...o, etiqueta: `${ab(estadoDe.distrito(o.valor))} · ${o.etiqueta}` } : o)));
      // El distrito elegido no existe en esta elección (otro mapa distrital u otro año): se quita
      const v = ultimo.current, quedan = v.distritos.filter((x) => d.opciones.some((o) => o.valor === x));
      if (quedan.length !== v.distritos.length) onChange({ ...v, distritos: quedan, secciones: quedan.length ? v.secciones : [] });
    });
    return () => { vivo = false; };
  }, [est, anio, cargo, varios]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!est || !anio) { setOptSec([]); return; }
    let vivo = true;
    const amb = mun ? `&municipio=${mun}` : dis ? `&distrito=${dis}` : "";
    api<{ opciones: Opcion[] }>(`/api/opciones?tipo=seccion&eleccion=${cargo}&anio=${anio}&estado=${est}${amb}`).then((d) => {
      if (!vivo) return;
      setOptSec(d.opciones.map((o) => (varios ? { ...o, sub: `${o.sub ?? ""} · ${ab(estadoDe.seccion(o.valor))}` } : o)));
      // La sección elegida no existe en esta elección (reseccionamiento u otro año) o quedó fuera de lo elegido: se quita
      const v = ultimo.current, quedan = v.secciones.filter((x) => d.opciones.some((o) => o.valor === x));
      if (d.opciones.length && quedan.length !== v.secciones.length) onChange({ ...v, secciones: quedan });
    });
    return () => { vivo = false; };
  }, [est, mun, dis, anio, cargo, varios]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombres = (pre: string, ids: number[], ops: Opcion[], base: Record<string, string>) => {
    const n = { ...base };
    for (const id of ids) { const o = ops.find((x) => x.valor === id); if (o) n[`${pre}${id}`] = pre === "s" ? (o.sub ?? "").replace(/ · \w+$/, "") : o.etiqueta; }
    return n;
  };
  const etiquetas = (pre: string) => Object.fromEntries(Object.entries(valor.nombres).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [Number(k.slice(1)), pre === "s" ? String(Number(k.slice(1)) % 10000) : v]));

  function cambiaEstados(es: number[]) {
    const dentro = (e: number) => es.includes(e);
    onChange({
      estados: es, nombres: valor.nombres,
      distritos: valor.distritos.filter((d) => dentro(estadoDe.distrito(d))),
      municipios: valor.municipios.filter((m) => dentro(estadoDe.municipio(m))),
      secciones: valor.secciones.filter((s) => dentro(estadoDe.seccion(s))),
    });
  }
  const sinEntidad = valor.estados.length === 0;
  const total = territorios(valor, estados).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="label flex items-center gap-1.5"><MapPin size={13} /> Territorio</p>
        <BotonLimpiar visible={hayFiltro(valor)} onClick={() => onChange(SIN_FILTRO)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <BuscadorMulti etiqueta="Entidad" todos="Todo el país" valores={valor.estados} ancho="min-w-0" max={MAX_TERR}
          opciones={estados.map((e) => ({ valor: e.id_estado, etiqueta: e.nombre_corto, sub: e.abreviatura }))} onChange={cambiaEstados} />
        {conDistrito && (
          <BuscadorMulti etiqueta={cargo === "diputados_locales_mr" ? "Distrito local" : "Distrito federal"} todos="Todos los distritos" valores={valor.distritos} ancho="min-w-0" max={MAX_TERR}
            deshabilitado={sinEntidad} placeholder={sinEntidad ? "Elige una entidad" : "Todos los distritos"} opciones={optDis}
            nombres={Object.fromEntries(valor.distritos.map((d) => [d, `${ab(estadoDe.distrito(d))}-${d % 100}`]))}
            onChange={(v) => onChange({ ...valor, distritos: v, municipios: [], secciones: v.length || !valor.distritos.length ? valor.secciones : [], nombres: nombres("d", v, optDis, valor.nombres) })} />
        )}
        <BuscadorMulti etiqueta="Municipio" todos="Todos los municipios" valores={valor.municipios} ancho="min-w-0" max={MAX_TERR}
          deshabilitado={sinEntidad} placeholder={sinEntidad ? "Elige una entidad" : "Todos los municipios"} opciones={optMun} nombres={etiquetas("m")}
          onChange={(v) => onChange({ ...valor, municipios: v, distritos: [], nombres: nombres("m", v, optMun, valor.nombres) })} />
        <BuscadorMulti etiqueta="Sección" todos="Todas las secciones" valores={valor.secciones} ancho="min-w-0" max={MAX_TERR}
          deshabilitado={sinEntidad} placeholder={sinEntidad ? "Elige una entidad" : "Todas las secciones"} opciones={optSec} nombres={etiquetas("s")}
          onChange={(v) => onChange({ ...valor, secciones: v, nombres: nombres("s", v, optSec, valor.nombres) })} />
      </div>
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
        Escribe para buscar; puedes marcar varios en cada nivel. Las listas muestran solo lo que está dentro de las entidades elegidas.
        Distrito y municipio son alternativos (un distrito puede abarcar varios municipios); la sección se busca dentro de lo elegido.
        {total > 1 && <> <b style={{ color: "var(--fg-soft)" }}>{total} territorios: se muestran lado a lado.</b></>}
      </p>
    </div>
  );
}

/** Con dos o más territorios: cuál se ve en detalle (las secciones que analizan un solo territorio a la vez). */
export function ElegirDetalle({ ts, i, onChange, estados, texto = "Ver en detalle" }: { ts: Terr[]; i: number; onChange: (i: number) => void; estados: Estado[]; texto?: string }) {
  if (ts.length < 2) return null;
  return (
    <div className="material p-3 flex flex-wrap items-center gap-2 sticky top-16 z-20" role="group" aria-label={texto}>
      <span className="label flex items-center gap-1.5 mr-1"><Columns2 size={13} />{texto}</span>
      {ts.map((t, k) => <button key={claveTerr(t)} className="chip" aria-pressed={k === i} onClick={() => onChange(k)}>{nombreCorto(t, estados)}</button>)}
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
