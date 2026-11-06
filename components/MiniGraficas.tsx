"use client";
import { useState, type ReactNode } from "react";
import { fmt } from "@/lib/format";

// Gráficas pequeñas en SVG, sin librería. Colores por variable CSS (--serie-fed / --serie-loc, validados para daltonismo en
// claro y oscuro con el validador de la guía de visualización). Texto siempre con tinta de texto, nunca del color de la serie.
// Cada marca tiene un área de toque mayor que la marca y muestra un globo al pasar el cursor o al enfocarla.

type Globo = { x: number; y: number; contenido: ReactNode } | null;
function GloboInfo({ g }: { g: Globo }) {
  if (!g) return null;
  return <div className="mg-globo" style={{ left: `${g.x}%`, top: `${g.y}%` }} role="status">{g.contenido}</div>;
}

/** Barras apiladas por año (federal abajo, local arriba). Años sin elección quedan vacíos: no se rellenan. */
export function BarrasAnio({ datos, alto = 140 }: { datos: { anio: number; federal: number; local: number }[]; alto?: number }) {
  const [g, setG] = useState<Globo>(null);
  if (!datos.length) return null;
  const a0 = datos[0].anio, a1 = datos[datos.length - 1].anio, n = a1 - a0 + 1;
  const max = Math.max(...datos.map((d) => d.federal + d.local));
  const W = 100, H = 100, paso = W / n, ancho = Math.max(paso - 0.35, 0.3);
  const y = (v: number) => (H * v) / max;
  const marcas = [a0, ...Array.from({ length: 20 }, (_, i) => Math.ceil(a0 / 10) * 10 + i * 10).filter((x) => x > a0 && x < a1), a1];
  return (
    <div className="mg relative" onMouseLeave={() => setG(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height: alto }} role="img"
        aria-label={`Cargos con resultados por año, de ${a0} a ${a1}`}>
        {[0.5, 1].map((f) => <line key={f} x1={0} x2={W} y1={H - H * f} y2={H - H * f} className="mg-rejilla" vectorEffect="non-scaling-stroke" />)}
        {datos.map((d) => {
          const x = (d.anio - a0) * paso, hf = y(d.federal), hl = y(d.local), gap = d.federal && d.local ? 0.9 : 0;
          const enfocar = () => setG({ x: ((x + paso / 2) / W) * 100, y: 0, contenido: <><b>{d.anio}</b><br />{d.federal} federal{d.federal === 1 ? "" : "es"} · {d.local} local{d.local === 1 ? "" : "es"}</> });
          return (
            <g key={d.anio} tabIndex={0} onMouseEnter={enfocar} onFocus={enfocar} onBlur={() => setG(null)} className="mg-marca">
              <rect x={x} y={0} width={paso} height={H} fill="transparent" />
              {d.federal > 0 && <rect x={x} y={H - hf} width={ancho} height={hf} rx={0.4} fill="var(--serie-fed)" />}
              {d.local > 0 && <rect x={x} y={H - hf - hl} width={ancho} height={Math.max(hl - gap, 0.5)} rx={0.4} fill="var(--serie-loc)" />}
            </g>);
        })}
      </svg>
      <div className="relative h-4 text-[10px] num" style={{ color: "var(--fg-mute)" }}>
        {marcas.map((m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - a0 + 0.5) / n) * 100}%` }}>{m}</span>)}
      </div>
      <GloboInfo g={g} />
    </div>
  );
}

/** Línea con puntos. Un valor nulo corta la línea (no se interpola). */
export function Linea({ datos, alto = 120, formato = (v: number) => `${v.toFixed(1)}%`, etiqueta }: {
  datos: { x: number; v: number | null }[]; alto?: number; formato?: (v: number) => string; etiqueta: string;
}) {
  const [g, setG] = useState<Globo>(null);
  const val = datos.filter((d) => d.v !== null) as { x: number; v: number }[];
  if (val.length < 2) return null;
  const x0 = datos[0].x, x1 = datos[datos.length - 1].x;
  const lo = Math.min(...val.map((d) => d.v)), hi = Math.max(...val.map((d) => d.v)), pad = (hi - lo) * 0.25 || 1;
  const W = 300, H = 100, px = (x: number) => 8 + ((x - x0) / (x1 - x0 || 1)) * (W - 16), py = (v: number) => H - 10 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (H - 20);
  const tramos: string[] = []; let t = "";
  for (const d of datos) { if (d.v === null) { if (t) tramos.push(t); t = ""; } else t += `${t ? "L" : "M"}${px(d.x).toFixed(1)},${py(d.v).toFixed(1)}`; }
  if (t) tramos.push(t);
  const ult = val[val.length - 1];
  return (
    <div className="mg relative" onMouseLeave={() => setG(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block overflow-visible" style={{ height: alto }} role="img" aria-label={etiqueta}>
        {tramos.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--serie-fed)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        {val.map((d) => {
          const enfocar = () => setG({ x: (px(d.x) / W) * 100, y: (py(d.v) / H) * 100, contenido: <><b>{d.x}</b> · {formato(d.v)}</> });
          return (
            <g key={d.x} tabIndex={0} onMouseEnter={enfocar} onFocus={enfocar} onBlur={() => setG(null)} className="mg-marca">
              <circle cx={px(d.x)} cy={py(d.v)} r={12} fill="transparent" />
              <circle cx={px(d.x)} cy={py(d.v)} r={4} fill="var(--serie-fed)" stroke="var(--card-solid)" strokeWidth={2} />
            </g>);
        })}
        <text x={px(ult.x)} y={py(ult.v) - 9} textAnchor="end" className="mg-texto">{formato(ult.v)}</text>
      </svg>
      <div className="flex justify-between text-[10px] num px-1" style={{ color: "var(--fg-mute)" }}><span>{x0}</span><span>{x1}</span></div>
      <GloboInfo g={g} />
    </div>
  );
}

/** Línea mínima para tarjetas (sin ejes): solo forma y último valor. */
export function Sparkline({ valores, color = "var(--c)", alto = 44 }: { valores: number[]; color?: string; alto?: number }) {
  if (valores.length < 2) return null;
  const lo = Math.min(...valores), hi = Math.max(...valores), W = 200, H = 50;
  const pts = valores.map((v, i) => [4 + (i / (valores.length - 1)) * (W - 8), H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: alto }} aria-hidden>
      <path d={`${d}L${pts.at(-1)![0]},${H}L${pts[0][0]},${H}Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={3.5} fill={color} />
    </svg>);
}

/** Barras horizontales con etiqueta y valor (texto en tinta de texto; la barra lleva el color). */
export function BarrasH({ filas }: { filas: { k: string; etiqueta: ReactNode; valor: number; nota?: string; color: string }[] }) {
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f.k} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate font-semibold">{f.etiqueta}</span>
          <span className="h-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
            <span className="block h-full rounded-full" style={{ width: `${(100 * f.valor) / max}%`, background: f.color }} />
          </span>
          <span className="num whitespace-nowrap"><b>{fmt(f.valor)}</b>{f.nota && <span className="text-xs" style={{ color: "var(--fg-mute)" }}> {f.nota}</span>}</span>
        </li>))}
    </ul>);
}
