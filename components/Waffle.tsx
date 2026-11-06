"use client";
import { colorPartido } from "@/lib/partidos";

/** Un cuadro por unidad ganada (distrito, entidad, municipio, escaño), agrupado por ganador. */
export function Waffle({ celdas, columnas = 30, tam = 13, onClick }: { celdas: { clave: string; titulo: string; color?: string; id?: number }[]; columnas?: number; tam?: number; onClick?: (id: number) => void }) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${columnas}, ${tam}px)` }} role="img" aria-label={`${celdas.length} unidades`}>
      {celdas.map((c, i) => (
        <button key={i} type="button" title={c.titulo} onClick={() => c.id !== undefined && onClick?.(c.id)}
          className="rounded-[3px] transition-transform duration-100 hover:scale-125 active:scale-95"
          style={{ width: tam, height: tam, background: c.color ?? colorPartido(c.clave), cursor: onClick ? "pointer" : "default" }} />
      ))}
    </div>
  );
}

/** Barra horizontal de un partido o bloque. */
export function Barra({ etiqueta, valor, pct, color, nota }: { etiqueta: string; valor: string; pct: number; color: string; nota?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold truncate"><span className="inline-block size-2.5 rounded-full mr-2 align-middle" style={{ background: color }} />{etiqueta}</span>
        <span className="num whitespace-nowrap"><b>{pct.toFixed(1)}%</b> <span style={{ color: "var(--fg-mute)" }}>{valor}{nota ? ` · ${nota}` : ""}</span></span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(0.5, Math.min(100, pct))}%`, background: color }} />
      </div>
    </div>
  );
}
