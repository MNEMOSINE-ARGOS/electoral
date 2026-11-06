"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { Minus, Plus, Maximize2 } from "lucide-react";

// Coroplético genérico sobre un GeoJSON de public/geo (estados, municipios, distritos o secciones).
// - Rueda o botones para acercar, arrastrar para mover; el trazo no engorda al acercar (vector-effect).
// - Tarjeta flotante al pasar el cursor; clic o Enter selecciona.
// - Etiquetas en el centro de cada polígono solo cuando caben (dependen del acercamiento).
// - `contorno`: otra capa encima, solo con bordes (p. ej. municipios sobre secciones); `encuadrar` acerca a uno de sus polígonos.

type Feat = { type: "Feature"; properties: Record<string, unknown>; geometry: unknown };
type GJ = { type: "FeatureCollection"; features: Feat[] };
const cache = new Map<string, Promise<GJ>>();
export const cargarGeo = (url: string) => { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); })); return cache.get(url)!; };

const W = 800;
type T = { k: number; x: number; y: number };

export function MapaGeo({ url, idProp = "id", colores, seleccion, onSelect, tooltip, etiquetas, contorno, encuadrar, resaltar, alto: altoMax = 620, etiquetaMin = 1400 }: {
  url: string; idProp?: string; colores: Record<number, string>; seleccion?: number | null; onSelect?: (id: number | null) => void;
  tooltip?: (id: number) => ReactNode; etiquetas?: Record<number, string>; contorno?: string | null; encuadrar?: number | null;
  /** ids que se dibujan con borde marcado (p. ej. los del mismo ganador al pasar por la leyenda) */ resaltar?: Set<number> | null;
  alto?: number; etiquetaMin?: number;
}) {
  const [gj, setGj] = useState<GJ | null>(null);
  const [cont, setCont] = useState<GJ | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [t, setT] = useState<T>({ k: 1, x: 0, y: 0 });
  const caja = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const arrastre = useRef<{ clientX: number; clientY: number; t: T; movio: boolean } | null>(null);

  useEffect(() => { setGj(null); setError(false); cargarGeo(url).then(setGj).catch(() => setError(true)); }, [url]);
  useEffect(() => { setCont(null); if (contorno) cargarGeo(contorno).then(setCont).catch(() => {}); }, [contorno]);

  const { rutas, H, proy } = useMemo(() => {
    if (!gj) return { rutas: [], H: 500, proy: null };
    const b = geoPath(geoMercator().fitWidth(W, gj as GeoPermissibleObjects)).bounds(gj as GeoPermissibleObjects);
    const H = Math.min(altoMax, Math.max(260, Math.ceil(b[1][1] - b[0][1]) + 8));
    const proy = geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], gj as GeoPermissibleObjects);
    const g = geoPath(proy);
    return {
      H, proy,
      rutas: gj.features.map((f) => ({ id: Number(f.properties[idProp]), d: g(f as GeoPermissibleObjects) ?? "", c: g.centroid(f as GeoPermissibleObjects), a: g.area(f as GeoPermissibleObjects) })),
    };
  }, [gj, idProp, altoMax]);
  const rutasCont = useMemo(() => {
    if (!cont || !proy) return [];
    const g = geoPath(proy);
    return cont.features.map((f) => ({ id: Number(f.properties.id), d: g(f as GeoPermissibleObjects) ?? "", b: g.bounds(f as GeoPermissibleObjects) }));
  }, [cont, proy]);

  const pocos = rutas.length <= 60;
  const seleccionable = !!onSelect;
  const capaBase = useMemo(() => rutas.map(({ id, d }) => (
    <path key={id} d={d} data-id={id} fill={colores[id] ?? "color-mix(in srgb, var(--fg) 5%, var(--card-solid))"}
      stroke="var(--card-solid)" strokeWidth={pocos ? 1 : 0.35} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
      className="mapa-geo-p" data-tenue={resaltar && !resaltar.has(id) ? "" : undefined}
      tabIndex={pocos && seleccionable ? 0 : undefined} role={pocos && seleccionable ? "button" : undefined} aria-label={pocos ? (etiquetas?.[id] ?? String(id)) : undefined} />
  )), [rutas, colores, resaltar, pocos, seleccionable, etiquetas]);

  useEffect(() => { setT({ k: 1, x: 0, y: 0 }); }, [url]);
  useEffect(() => {
    if (encuadrar == null) return;
    const r = rutasCont.find((x) => x.id === encuadrar);
    if (!r) return;
    const [[x0, y0], [x1, y1]] = r.b;
    const k = Math.max(1, Math.min(40, 0.9 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    setT({ k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 });
  }, [encuadrar, rutasCont, H]);

  const limitar = (n: T): T => {
    const k = Math.max(1, Math.min(60, n.k));
    return { k, x: Math.min(0, Math.max(W - W * k, n.x)), y: Math.min(0, Math.max(H - H * k, n.y)) };
  };
  // Acerca alrededor del punto (cx, cy): ese punto queda fijo en pantalla
  const acercar = (f: number, cx = W / 2, cy = H / 2) => setT((o) => {
    const r = Math.max(1, Math.min(60, o.k * f)) / o.k;
    return limitar({ k: o.k * r, x: cx - (cx - o.x) * r, y: cy - (cy - o.y) * r });
  });
  const aSvg = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => { e.preventDefault(); const [x, y] = aSvg(e); acercar(e.deltaY < 0 ? 1.35 : 1 / 1.35, x, y); };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  });

  if (error) return <p className="text-sm p-6" style={{ color: "var(--fg-mute)" }}>No se pudo cargar la cartografía.</p>;
  if (!gj) return <div className="skeleton w-full" style={{ aspectRatio: `${W} / 520` }} aria-busy="true" aria-label="Cargando mapa" />;

  const idDe = (el: EventTarget) => { const v = (el as Element).getAttribute?.("data-id"); return v === null || v === undefined ? null : Number(v); };
  const mover =(e: React.PointerEvent, id?: number) => {
    const r = caja.current!.getBoundingClientRect();
    if (arrastre.current) {
      const [x, y] = aSvg(e), [x0, y0] = aSvg(arrastre.current);
      if (Math.abs(x - x0) + Math.abs(y - y0) > 3) arrastre.current.movio = true;
      setT(limitar({ ...arrastre.current.t, x: arrastre.current.t.x + x - x0, y: arrastre.current.t.y + y - y0 }));
      setHover(null);
    } else if (id !== undefined) setHover({ id, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const tip = hover && tooltip ? tooltip(hover.id) : null;
  const anchoCaja = caja.current?.clientWidth ?? 600;

  return (
    <div ref={caja} className="mapa-geo relative select-none" onPointerLeave={() => setHover(null)}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block touch-none" role="img" aria-label="Mapa"
        style={{ cursor: arrastre.current?.movio ? "grabbing" : t.k > 1 ? "grab" : "default" }}
        onPointerDown={(e) => { arrastre.current = { clientX: e.clientX, clientY: e.clientY, t, movio: false }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => arrastre.current && mover(e)}
        onPointerUp={() => { setTimeout(() => { arrastre.current = null; }, 0); }}
        onDoubleClick={(e) => { const [x, y] = aSvg(e); acercar(2, x, y); }}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {/* Eventos delegados en el grupo: los polígonos (hasta miles) no se vuelven a dibujar al mover el cursor */}
          <g onPointerMove={(e) => { const id = idDe(e.target); if (id !== null) mover(e, id); }}
            onClick={(e) => { const id = idDe(e.target); if (id !== null && !arrastre.current?.movio) onSelect?.(seleccion === id ? null : id); }}
            onKeyDown={(e) => { const id = idDe(e.target); if (id !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect?.(seleccion === id ? null : id); } }}>
            {capaBase}
          </g>
          {rutasCont.map(({ id, d }) => <path key={`c${id}`} d={d} fill="none" stroke="var(--fg-soft)" strokeOpacity={0.55} strokeWidth={1.1} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
          {rutas.filter((r) => r.id === seleccion || (hover && r.id === hover.id)).map(({ id, d }) => (
            <path key={`s${id}`} d={d} fill="none" stroke="var(--fg)" strokeWidth={id === seleccion ? 2.6 : 1.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />))}
          {etiquetas && rutas.filter((r) => etiquetas[r.id] && r.a * t.k * t.k >= etiquetaMin).map(({ id, c }) => (
            <text key={`e${id}`} x={c[0]} y={c[1]} className="mapa-geo-etq" fontSize={11 / t.k} strokeWidth={3 / t.k}>{etiquetas[id]}</text>))}
        </g>
      </svg>
      <div className="mapa-geo-zoom" aria-label="Acercamiento">
        <button type="button" onClick={() => acercar(1.6)} aria-label="Acercar"><Plus size={15} /></button>
        <button type="button" onClick={() => acercar(1 / 1.6)} aria-label="Alejar" disabled={t.k <= 1}><Minus size={15} /></button>
        <button type="button" onClick={() => setT({ k: 1, x: 0, y: 0 })} aria-label="Ver completo" disabled={t.k <= 1}><Maximize2 size={13} /></button>
      </div>
      {tip && hover && (
        <div className="mapa-geo-tip" style={{ left: Math.min(hover.x + 14, anchoCaja - 250), top: hover.y + 14 }}>{tip}</div>
      )}
    </div>
  );
}
