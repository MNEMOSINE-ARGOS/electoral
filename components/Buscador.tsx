"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type Opcion = { valor: number; etiqueta: string; sub?: string };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Campo con autocompletado: escribe y aparecen coincidencias. valor 0 = «todos». Teclado: ↑ ↓ Enter Esc. */
export function Buscador({ etiqueta, opciones, valor, onChange, todos = "Todos", deshabilitado, placeholder, ancho = "min-w-48" }: {
  etiqueta: string; opciones: Opcion[]; valor: number; onChange: (v: number, o?: Opcion) => void; todos?: string | null; deshabilitado?: boolean; placeholder?: string; ancho?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();
  const sel = opciones.find((o) => o.valor === valor);

  const lista = useMemo(() => {
    const t = norm(texto.trim());
    const base = t ? opciones.filter((o) => norm(o.etiqueta).includes(t) || (o.sub && norm(o.sub).includes(t))) : opciones;
    // Coincidencias que empiezan con lo escrito, primero
    const ord = t ? [...base].sort((a, b) => Number(!norm(a.etiqueta).startsWith(t)) - Number(!norm(b.etiqueta).startsWith(t))) : base;
    return [...(todos !== null && !t ? [{ valor: 0, etiqueta: todos }] : []), ...ord.slice(0, 80)];
  }, [opciones, texto, todos]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) { setAbierto(false); setTexto(""); } };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);
  useEffect(() => setActivo(0), [texto]);

  function elegir(o: Opcion) { onChange(o.valor, o); setAbierto(false); setTexto(""); }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(a + 1, lista.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && abierto && lista[activo]) { e.preventDefault(); elegir(lista[activo]); }
    else if (e.key === "Escape") { setAbierto(false); setTexto(""); }
  }

  return (
    <div ref={caja} className={`relative space-y-1 ${ancho}`}>
      <label htmlFor={id} className="label block">{etiqueta}</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--fg-mute)" }} />
        <input id={id} className="field !pl-8 !pr-8" role="combobox" aria-expanded={abierto} aria-controls={`${id}-l`} aria-autocomplete="list" autoComplete="off"
          disabled={deshabilitado} placeholder={sel ? sel.etiqueta : placeholder ?? todos ?? "Escribe…"}
          value={abierto ? texto : sel ? sel.etiqueta : ""}
          onFocus={() => setAbierto(true)} onChange={(e) => { setTexto(e.target.value); setAbierto(true); }} onKeyDown={tecla}
          style={{ opacity: deshabilitado ? 0.5 : 1 }} />
        {valor && todos !== null && !deshabilitado ? (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 grid size-6 place-items-center rounded-full hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]"
            aria-label={`Quitar ${etiqueta}`} onClick={() => onChange(0)}><X size={13} /></button>
        ) : <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--fg-mute)" }} />}
      </div>
      {abierto && !deshabilitado && (
        <ul id={`${id}-l`} role="listbox" className="absolute z-30 left-0 mt-1 max-h-72 overflow-auto rounded-xl p-1 entra"
          style={{ background: "var(--card-solid)", border: "1px solid var(--line-strong)", boxShadow: "var(--shadow-lg)", minWidth: "max(100%, 17rem)", width: "max-content", maxWidth: "min(28rem, 90vw)" }}>
          {lista.length === 0 && <li className="px-3 py-2 text-sm" style={{ color: "var(--fg-mute)" }}>Sin coincidencias</li>}
          {lista.map((o, i) => (
            <li key={`${o.valor}-${i}`} role="option" aria-selected={o.valor === valor}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }} onMouseEnter={() => setActivo(i)}
              className="flex items-baseline justify-between gap-3 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
              style={{ background: i === activo ? "color-mix(in srgb, var(--accion) 10%, transparent)" : undefined, fontWeight: o.valor === valor ? 700 : 500 }}>
              <span className="truncate">{o.etiqueta}</span>{o.sub && <span className="text-xs shrink-0" style={{ color: "var(--fg-mute)" }}>{o.sub}</span>}
            </li>
          ))}
          {opciones.length > 80 && !texto && <li className="px-3 py-1.5 text-xs" style={{ color: "var(--fg-mute)" }}>Escribe para buscar entre {opciones.length.toLocaleString("es-MX")} opciones</li>}
        </ul>
      )}
    </div>
  );
}
