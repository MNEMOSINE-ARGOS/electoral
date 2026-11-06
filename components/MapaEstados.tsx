"use client";
import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";

type Feature = { type: "Feature"; properties: { state_code: number; state_name?: string }; geometry: unknown };
type GJ = { type: "FeatureCollection"; features: Feature[] };

/** Coroplético de estados. `colores[id_estado]` = color de relleno; `onClick` selecciona. */
export function MapaEstados({ colores, titulos, seleccion, onClick, ancho = 760, alto = 520 }: {
  colores: Record<number, string>; titulos: Record<number, string>; seleccion?: number[]; onClick?: (id: number) => void; ancho?: number; alto?: number;
}) {
  const [gj, setGj] = useState<GJ | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { fetch("/geo/estados.geojson").then((r) => r.json()).then(setGj); }, []);
  const rutas = useMemo(() => {
    if (!gj) return [];
    const proy = geoMercator().fitSize([ancho, alto], gj as never);
    const g = geoPath(proy);
    return gj.features.map((f) => ({ id: Number(f.properties.state_code), d: g(f as never) ?? "" }));
  }, [gj, ancho, alto]);
  if (!gj) return <div className="skeleton" style={{ height: alto }} />;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full h-auto" role="img" aria-label="Mapa de estados de México">
        {rutas.map(({ id, d }) => {
          const sel = seleccion?.includes(id);
          return (
            <path key={id} d={d} fill={colores[id] ?? "var(--rose-soft)"} stroke={sel ? "var(--fg)" : "var(--card-solid)"} strokeWidth={sel ? 2.4 : 0.8}
              style={{ cursor: onClick ? "pointer" : "default", transition: "filter 120ms", filter: hover === id ? "brightness(1.12)" : undefined }}
              onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} onClick={() => onClick?.(id)}>
              <title>{titulos[id] ?? String(id)}</title>
            </path>
          );
        })}
      </svg>
      {hover !== null && <div className="absolute left-2 top-2 material px-3 py-1.5 text-xs font-semibold pointer-events-none">{titulos[hover]}</div>}
    </div>
  );
}
