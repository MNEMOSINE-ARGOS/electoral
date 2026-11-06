"use client";
import type { ReactNode } from "react";

// Mosaico de las 32 entidades: un cuadro del mismo tamaño por entidad, acomodados como en el mapa. Sirve para ver las entidades
// pequeñas (CDMX, Tlaxcala, Morelos) que en el mapa casi no se distinguen. Posición aproximada: [columna, fila].
const POS: Record<number, [number, number]> = {
  2: [0, 0], 26: [1, 0], 8: [2, 0], 5: [3, 0], 19: [4, 0],
  3: [0, 1], 25: [1, 1], 10: [2, 1], 32: [3, 1], 24: [4, 1], 28: [5, 1],
  18: [1, 2], 14: [2, 2], 1: [3, 2], 11: [4, 2], 22: [5, 2], 13: [6, 2],
  6: [1, 3], 16: [2, 3], 15: [3, 3], 9: [4, 3], 29: [5, 3], 30: [6, 3], 31: [8, 3],
  12: [2, 4], 17: [3, 4], 21: [4, 4], 20: [5, 4], 27: [6, 4], 4: [7, 4], 23: [8, 4],
  7: [6, 5],
};

export function MosaicoEstados({ colores, abrev, valor, seleccion, onSelect, tooltip, resaltar, hover, setHover }: {
  colores: Record<number, string>; abrev: Record<number, string>; valor?: Record<number, string>; seleccion?: number | null;
  onSelect?: (id: number | null) => void; tooltip?: (id: number) => ReactNode; resaltar?: Set<number> | null;
  hover: number | null; setHover: (id: number | null) => void;
}) {
  return (
    <div className="relative">
      <div className="mosaico" role="group" aria-label="Mosaico de entidades">
        {Object.entries(POS).map(([k, [c, f]]) => {
          const id = Number(k);
          return (
            <button key={id} type="button" className="mosaico-c" style={{ gridColumn: c + 1, gridRow: f + 1, background: colores[id] }}
              data-sel={seleccion === id || undefined} data-tenue={resaltar && !resaltar.has(id) ? "" : undefined}
              onClick={() => onSelect?.(seleccion === id ? null : id)} onPointerEnter={() => setHover(id)} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(id)} onBlur={() => setHover(null)} aria-pressed={seleccion === id}>
              <b>{abrev[id]}</b>{valor?.[id] && <small>{valor[id]}</small>}
            </button>);
        })}
      </div>
      {hover !== null && tooltip && <div className="mapa-geo-tip mosaico-tip">{tooltip(hover)}</div>}
    </div>
  );
}
