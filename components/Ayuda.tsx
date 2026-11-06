"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { GLOSARIO } from "@/lib/glosario";

/**
 * Icono «?» con explicación: aparece al pasar el cursor, al enfocar con teclado (Tab) o al tocar en el celular; Esc la cierra.
 * Se dibuja en un portal con posición fija para que no la recorten las tablas con scroll.
 * Uso: <Ayuda clave="votos_aspirables" />  o  <Ayuda titulo="…">contenido propio</Ayuda>  (puede combinar ambos).
 */
export function Ayuda({ clave, titulo, children, tam = 13 }: { clave?: string; titulo?: string; children?: React.ReactNode; tam?: number }) {
  const g = clave ? GLOSARIO[clave] : undefined;
  const [abierta, setAbierta] = useState(false);
  const [fija, setFija] = useState(false); // abierta por clic/toque: no se cierra al salir el cursor
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!abierta || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const alto = caja.current?.offsetHeight ?? 160, ancho = Math.min(320, window.innerWidth - 24);
    const arriba = r.bottom + 8 + alto > window.innerHeight && r.top - 8 - alto > 0;
    const x = Math.max(12, Math.min(r.left + r.width / 2 - ancho / 2, window.innerWidth - ancho - 12));
    setPos({ x, y: arriba ? r.top - 8 - alto : r.bottom + 8, arriba });
  }, [abierta]);
  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierta(false); setFija(false); } };
    const fuera = (e: MouseEvent) => { if (!boton.current?.contains(e.target as Node) && !caja.current?.contains(e.target as Node)) { setAbierta(false); setFija(false); } };
    const mover = () => { setAbierta(false); setFija(false); };
    document.addEventListener("keydown", esc); document.addEventListener("mousedown", fuera); window.addEventListener("scroll", mover, true);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("mousedown", fuera); window.removeEventListener("scroll", mover, true); };
  }, [abierta]);

  if (!g && !children) return null;
  const nombre = titulo ?? g?.t ?? "Ayuda";
  return (
    <>
      <button ref={boton} type="button" aria-label={`Qué es: ${nombre}`} aria-describedby={abierta ? id : undefined} aria-expanded={abierta}
        className="inline-grid place-items-center align-middle rounded-full ml-1 -mt-0.5 cursor-help transition-colors hover:text-[var(--azul)] focus-visible:text-[var(--azul)]"
        style={{ color: "var(--fg-mute)", width: tam + 6, height: tam + 6 }}
        onMouseEnter={() => setAbierta(true)} onMouseLeave={() => { if (!fija) setAbierta(false); }}
        onFocus={() => setAbierta(true)} onBlur={() => { if (!fija) setAbierta(false); }}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setFija(!fija); setAbierta(!fija); }}>
        <HelpCircle size={tam} strokeWidth={2.2} />
      </button>
      {abierta && typeof document !== "undefined" && createPortal(
        <div ref={caja} id={id} role="tooltip" className="fixed z-[100] rounded-xl p-3 text-left normal-case tracking-normal shadow-lg"
          style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, width: "min(320px, calc(100vw - 24px))", background: "var(--card-solid)", border: "1px solid var(--line-strong)", color: "var(--fg)", boxShadow: "var(--shadow-lg)" }}
          onMouseEnter={() => setAbierta(true)} onMouseLeave={() => { if (!fija) setAbierta(false); }}>
          <p className="text-sm font-bold pb-1">{nombre}</p>
          {g?.que && <p className="text-[13px] leading-snug" style={{ color: "var(--fg-soft)" }}>{g.que}</p>}
          {g?.como && <p className="text-[12.5px] leading-snug pt-1.5"><span className="font-semibold">Cómo se calcula: </span><span style={{ color: "var(--fg-soft)" }}>{g.como}</span></p>}
          {children && <div className="text-[12.5px] leading-snug pt-1.5" style={{ color: "var(--fg-soft)" }}>{children}</div>}
          {g?.ojo && <p className="text-[12px] leading-snug pt-1.5" style={{ color: "var(--fg-mute)" }}><span className="font-semibold">Ojo: </span>{g.ojo}</p>}
        </div>, document.body)}
    </>
  );
}
