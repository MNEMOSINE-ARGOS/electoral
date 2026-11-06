"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Sección plegable: el resumen siempre visible, el detalle un nivel más abajo. Se despliega con una transición de altura
 *  (grid 0fr → 1fr) que se puede interrumpir; con «reducir movimiento» solo cambia la opacidad. */
export function Plegable({ resumen, children, abierto: inicial = false, className = "" }: {
  resumen: ReactNode; children: ReactNode; abierto?: boolean; className?: string;
}) {
  const [abierto, setAbierto] = useState(inicial);
  const id = useId();
  return (
    <div className={className}>
      <button type="button" className="plegable-btn" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(!abierto)}>
        <ChevronDown size={14} className="plegable-ico" aria-hidden />
        <span>{resumen}</span>
      </button>
      <div id={id} className="plegable" data-abierto={abierto} inert={!abierto}>
        <div className="plegable-in">{children}</div>
      </div>
    </div>
  );
}
