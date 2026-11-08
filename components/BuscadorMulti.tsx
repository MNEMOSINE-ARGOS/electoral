"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Opcion } from "@/components/Buscador";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Autocompletado de selección múltiple: cada opción se marca o desmarca sin cerrar la lista; las elegidas quedan como fichas debajo.
 *  valores = [] significa «todos». Teclado: ↑ ↓ Enter (marca) Esc. `max` limita cuántas se pueden elegir. */
export function BuscadorMulti({ etiqueta, opciones, valores, onChange, todos = "Todos", deshabilitado, placeholder, ancho = "min-w-48", max = 12, nombres }: {
  etiqueta: string; opciones: Opcion[]; valores: number[]; onChange: (v: number[]) => void; todos?: string; deshabilitado?: boolean; placeholder?: string; ancho?: string; max?: number;
  /** Etiquetas de los valores elegidos que ya no estén en `opciones` (p. ej. mientras se recargan) */
  nombres?: Record<number, string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();
  const elegidas = new Set(valores);
  const lleno = valores.length >= max;
  const etiq = (v: number) => opciones.find((o) => o.valor === v)?.etiqueta ?? nombres?.[v] ?? String(v);

  const lista = useMemo(() => {
    const t = norm(texto.trim());
    const base = t ? opciones.filter((o) => norm(o.etiqueta).includes(t) || (o.sub && norm(o.sub).includes(t))) : opciones;
    // Coincidencias que empiezan con lo escrito, primero; sin texto, las elegidas arriba
    const ord = t ? [...base].sort((a, b) => Number(!norm(a.etiqueta).startsWith(t)) - Number(!norm(b.etiqueta).startsWith(t)))
      : [...base.filter((o) => elegidas.has(o.valor)), ...base.filter((o) => !elegidas.has(o.valor))];
    return [...(!t ? [{ valor: 0, etiqueta: todos }] : []), ...ord.slice(0, 80)];
  }, [opciones, texto, todos, valores]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) { setAbierto(false); setTexto(""); } };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);
  useEffect(() => setActivo(0), [texto]);

  function alternar(o: Opcion) {
    if (o.valor === 0) { onChange([]); setAbierto(false); setTexto(""); return; }
    if (elegidas.has(o.valor)) onChange(valores.filter((v) => v !== o.valor));
    else if (!lleno) onChange([...valores, o.valor]);
    setTexto("");
  }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(a + 1, lista.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && abierto && lista[activo]) { e.preventDefault(); alternar(lista[activo]); }
    else if (e.key === "Escape") { setAbierto(false); setTexto(""); }
    else if (e.key === "Backspace" && !texto && valores.length) onChange(valores.slice(0, -1));
  }
  const resumen = valores.length === 0 ? "" : valores.length === 1 ? etiq(valores[0]) : `${valores.length} elegidos`;

  return (
    <div ref={caja} className={`relative space-y-1 ${ancho}`}>
      <label htmlFor={id} className="label block">{etiqueta}</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--fg-mute)" }} />
        <input id={id} className="field !pl-8 !pr-8" role="combobox" aria-expanded={abierto} aria-controls={`${id}-l`} aria-autocomplete="list" autoComplete="off"
          disabled={deshabilitado} placeholder={resumen || placeholder || todos}
          value={abierto ? texto : resumen}
          onFocus={() => setAbierto(true)} onChange={(e) => { setTexto(e.target.value); setAbierto(true); }} onKeyDown={tecla}
          style={{ opacity: deshabilitado ? 0.5 : 1 }} />
        {valores.length && !deshabilitado ? (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 grid size-6 place-items-center rounded-full hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]"
            aria-label={`Quitar ${etiqueta}`} onClick={() => onChange([])}><X size={13} /></button>
        ) : <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--fg-mute)" }} />}
      </div>
      {valores.length > 1 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {valores.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--accion) 10%, transparent)" }}>
              {etiq(v)}
              <button type="button" aria-label={`Quitar ${etiq(v)}`} className="grid size-4 place-items-center rounded-full hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
                onClick={() => onChange(valores.filter((x) => x !== v))}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      {abierto && !deshabilitado && (
        <ul id={`${id}-l`} role="listbox" aria-multiselectable="true" className="absolute z-30 left-0 mt-1 max-h-72 overflow-auto rounded-xl p-1 entra"
          style={{ background: "var(--card-solid)", border: "1px solid var(--line-strong)", boxShadow: "var(--shadow-lg)", minWidth: "max(100%, 17rem)", width: "max-content", maxWidth: "min(28rem, 90vw)" }}>
          {lista.length === 0 && <li className="px-3 py-2 text-sm" style={{ color: "var(--fg-mute)" }}>Sin coincidencias</li>}
          {lista.map((o, i) => {
            const marcada = o.valor === 0 ? valores.length === 0 : elegidas.has(o.valor);
            const bloqueada = o.valor !== 0 && !marcada && lleno;
            return (
              <li key={`${o.valor}-${i}`} role="option" aria-selected={marcada} aria-disabled={bloqueada}
                onMouseDown={(e) => { e.preventDefault(); if (!bloqueada) alternar(o); }} onMouseEnter={() => setActivo(i)}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{ background: i === activo ? "color-mix(in srgb, var(--accion) 10%, transparent)" : undefined, fontWeight: marcada ? 700 : 500, opacity: bloqueada ? 0.45 : 1 }}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="grid size-4 shrink-0 place-items-center rounded" style={{ border: "1.5px solid var(--line-strong)", background: marcada ? "var(--accion)" : undefined, color: "var(--card-solid)" }}>
                    {marcada && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.etiqueta}</span>
                </span>
                {o.sub && <span className="text-xs shrink-0" style={{ color: "var(--fg-mute)" }}>{o.sub}</span>}
              </li>
            );
          })}
          {lleno && <li className="px-3 py-1.5 text-xs" style={{ color: "var(--fg-mute)" }}>Máximo {max}: quita uno para elegir otro.</li>}
          {opciones.length > 80 && !texto && <li className="px-3 py-1.5 text-xs" style={{ color: "var(--fg-mute)" }}>Escribe para buscar entre {opciones.length.toLocaleString("es-MX")} opciones</li>}
        </ul>
      )}
    </div>
  );
}
