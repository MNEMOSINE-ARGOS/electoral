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

export function MapaGeo({ url, idProp = "id", colores, seleccion, onSelect, tooltip, etiquetas, contorno, encuadrar, resaltar, filtro, grupos, circulos, bordes, simple, alto: altoMax = 620, etiquetaMin = 1400 }: {
  url: string; idProp?: string;
  /** solo los polígonos con properties[prop] === valor (p. ej. las secciones de un municipio); el mapa se encuadra en ellos */ filtro?: { prop: string; valor: number; y?: { prop: string; valor: number } } | null; colores: Record<number, string>; seleccion?: number | null; onSelect?: (id: number | null) => void;
  tooltip?: (id: number) => ReactNode; etiquetas?: Record<number, string>; contorno?: string | null; encuadrar?: number | null;
  /** ids que se dibujan con borde marcado (p. ej. los del mismo ganador al pasar por la leyenda) */ resaltar?: Set<number> | null;
  /** límites dibujados encima (con «contorno») y su etiqueta, centrada en la parte de cada grupo que cae en el mapa:
   *  p. ej. los distritos dentro de un municipio. prop = propiedad de cada polígono base que dice a qué grupo pertenece. */
  /*  asignacion: grupo de cada polígono cuando no viene en sus propiedades (p. ej. sectores cargados aparte);
   *  colores: si se da, cada polígono lleva un borde del color de su grupo (para grupos sin polígono propio). */
  grupos?: { prop: string; etiquetas: Record<number, string>; asignacion?: Record<number, number>; colores?: Record<number, string> } | null;
  /** círculos proporcionales en el centro de cada polígono (radio en px del mapa; no crece al acercar) */ circulos?: Record<number, { r: number; color: string }> | null;
  /** polígonos con borde marcado (p. ej. reñidas del campo de batalla) */ bordes?: Set<number> | null;
  /** mapa pequeño (vista Historia): sin botones de acercamiento ni rueda */ simple?: boolean;
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
    const fc = filtro ? { ...gj, features: gj.features.filter((f) => Number(f.properties[filtro.prop]) === filtro.valor && (!filtro.y || Number(f.properties[filtro.y.prop]) === filtro.y.valor)) } : gj;
    if (!fc.features.length) return { rutas: [], H: 300, proy: null };
    const b = geoPath(geoMercator().fitWidth(W, fc as GeoPermissibleObjects)).bounds(fc as GeoPermissibleObjects);
    const H = Math.min(altoMax, Math.max(260, Math.ceil(b[1][1] - b[0][1]) + 8));
    const proy = geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], fc as GeoPermissibleObjects);
    const g = geoPath(proy);
    return {
      H, proy,
      rutas: fc.features.map((f) => ({ id: Number(f.properties[idProp]), d: g(f as GeoPermissibleObjects) ?? "", c: g.centroid(f as GeoPermissibleObjects), a: g.area(f as GeoPermissibleObjects), p: f.properties })),
    };
  }, [gj, idProp, altoMax, filtro?.prop, filtro?.valor, filtro?.y?.prop, filtro?.y?.valor]); // eslint-disable-line react-hooks/exhaustive-deps
  const rutasCont = useMemo(() => {
    if (!cont || !proy) return [];
    const g = geoPath(proy);
    return cont.features.map((f) => ({ id: Number(f.properties.id), d: g(f as GeoPermissibleObjects) ?? "", b: g.bounds(f as GeoPermissibleObjects) }));
  }, [cont, proy]);

  // Centro de cada grupo = promedio de los centros de sus polígonos, ponderado por área (solo la parte visible en este mapa)
  const centrosGrupo = useMemo(() => {
    if (!grupos) return [];
    const acc = new Map<number, [number, number, number]>();
    for (const r of rutas) {
      const v = grupos.asignacion ? grupos.asignacion[r.id] : Number(r.p[grupos.prop]); if (v === undefined || !Number.isFinite(v) || !r.a) continue;
      const a = acc.get(v) ?? [0, 0, 0]; a[0] += r.c[0] * r.a; a[1] += r.c[1] * r.a; a[2] += r.a; acc.set(v, a);
    }
    return [...acc].filter(([v]) => grupos.etiquetas[v]).map(([v, [x, y, a]]) => ({ v, x: x / a, y: y / a, t: grupos.etiquetas[v] }));
  }, [rutas, grupos]);

  const pocos = rutas.length <= 60;
  const seleccionable = !!onSelect;
  const capaBase = useMemo(() => rutas.map(({ id, d }) => (
    <path key={id} d={d} data-id={id} fill={colores[id] ?? "color-mix(in srgb, var(--fg) 5%, var(--card-solid))"}
      stroke="var(--card-solid)" strokeWidth={pocos ? 1 : 0.35} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
      className="mapa-geo-p" data-tenue={resaltar && !resaltar.has(id) ? "" : undefined}
      tabIndex={pocos && seleccionable ? 0 : undefined} role={pocos && seleccionable ? "button" : undefined} aria-label={pocos ? (etiquetas?.[id] ?? String(id)) : undefined} />
  )), [rutas, colores, resaltar, pocos, seleccionable, etiquetas]);

  // Círculos de mayor a menor, para que los chicos queden encima; con data-id para la ficha y la selección
  const capaCirculos = useMemo(() => !circulos ? null : rutas.filter((r) => circulos[r.id]).sort((a, b) => circulos[b.id].r - circulos[a.id].r).map(({ id, c }) => (
    <circle key={`o${id}`} data-id={id} cx={c[0]} cy={c[1]} r={circulos[id].r / Math.sqrt(t.k)} fill={circulos[id].color} fillOpacity={0.82}
      stroke="var(--card-solid)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" className="mapa-geo-c" data-tenue={resaltar && !resaltar.has(id) ? "" : undefined} />
  )), [rutas, circulos, t.k, resaltar]);

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
    if (simple) return;
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
        <defs>
          {/* «sin comparación»: rayado (lib/mapa RAYADO) */}
          <pattern id="mapa-rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="color-mix(in srgb, var(--fg) 7%, var(--card-solid))" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--fg-mute)" strokeWidth="1.3" />
          </pattern>
        </defs>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {/* Eventos delegados en el grupo: los polígonos (hasta miles) no se vuelven a dibujar al mover el cursor */}
          <g onPointerMove={(e) => { const id = idDe(e.target); if (id !== null) mover(e, id); }}
            onClick={(e) => { const id = idDe(e.target); if (id !== null && !arrastre.current?.movio) onSelect?.(seleccion === id ? null : id); }}
            onKeyDown={(e) => { const id = idDe(e.target); if (id !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect?.(seleccion === id ? null : id); } }}>
            {capaBase}
            {capaCirculos}
          </g>
          {bordes && rutas.filter((r) => bordes.has(r.id)).map(({ id, d }) => <path key={`r${id}`} d={d} fill="none" stroke="var(--fg)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
          {grupos?.colores && rutas.map(({ id, d }) => { const v = grupos.asignacion?.[id]; const c = v === undefined ? undefined : grupos.colores![v];
            return c ? <path key={`b${id}`} d={d} fill="none" stroke={c} strokeWidth={2.2} strokeOpacity={0.9} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" /> : null; })}
          {rutasCont.map(({ id, d }) => grupos
            ? <path key={`c${id}`} d={d} className="mapa-geo-lim" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            : <path key={`c${id}`} d={d} fill="none" stroke="var(--fg-soft)" strokeOpacity={0.55} strokeWidth={1.1} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
          {rutas.filter((r) => r.id === seleccion || (hover && r.id === hover.id)).map(({ id, d }) => (
            <path key={`s${id}`} d={d} fill="none" stroke="var(--fg)" strokeWidth={id === seleccion ? 2.6 : 1.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />))}
          {etiquetas && rutas.filter((r) => etiquetas[r.id] && r.a * t.k * t.k >= etiquetaMin).map(({ id, c }) => (
            <text key={`e${id}`} x={c[0]} y={c[1]} className="mapa-geo-etq" fontSize={11 / t.k} strokeWidth={3 / t.k}>{etiquetas[id]}</text>))}
          {centrosGrupo.map(({ v, x, y, t: txt }) => (
            <text key={`g${v}`} x={x} y={y} className="mapa-geo-grupo" fontSize={13 / t.k} strokeWidth={4 / t.k}>{txt}</text>))}
        </g>
      </svg>
      {!simple && <div className="mapa-geo-zoom" aria-label="Acercamiento">
        <button type="button" onClick={() => acercar(1.6)} aria-label="Acercar"><Plus size={15} /></button>
        <button type="button" onClick={() => acercar(1 / 1.6)} aria-label="Alejar" disabled={t.k <= 1}><Minus size={15} /></button>
        <button type="button" onClick={() => setT({ k: 1, x: 0, y: 0 })} aria-label="Ver completo" disabled={t.k <= 1}><Maximize2 size={13} /></button>
      </div>}
      {tip && hover && (
        <div className="mapa-geo-tip" style={{ left: Math.min(hover.x + 14, anchoCaja - 250), top: hover.y + 14 }}>{tip}</div>
      )}
    </div>
  );
}
