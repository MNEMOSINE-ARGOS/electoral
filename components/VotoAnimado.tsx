"use client";
import { useEffect, useRef, useState } from "react";
import { BarcoArgos } from "@/components/ArgosLogo";

// Escena del título de la portada, a la manera del encabezado del panel de monitoreo: el barco de Argos navega despacio sobre
// una estela azul que se va trazando detrás de él (se inclina con la pendiente y se mece) y nace desvanecida junto al título; la
// última ola lo lleva a la boca de la urna, se pone vertical como una boleta y entra por la ranura. La urna rebota y aparece
// la palomita. Un solo reloj (requestAnimationFrame) mueve trazo y barco; todo se dimensiona con el tamaño real de la escena.
// Se repite sola (pausa con la palomita y se desvanece); tocar la urna la reinicia. Con «reducir movimiento»: línea completa y urna con su palomita, sin barco.

const VIAJE = 11000, GIRO = 650, CAIDA = 700, PAUSA = 2600; // ms; PAUSA: tiempo con la palomita antes de repetir
const easeOut = (t: number) => 1 - Math.pow(1 - t, 1.6);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeIn = (t: number) => t * t * t;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Geometría para un tamaño de escena: urna a la derecha, en el centro óptico del título (escala k sobre una urna base de 46 × 40), barco a escala s. */
function escena(w: number, h: number) {
  const k = clamp((h * 0.42) / 40, 1.3, 2.6), s = clamp(k * 0.72, 1, 1.7);
  const uw = 46 * k, uh = 40 * k;
  // Centro óptico: la urna se centra un poco arriba de la mitad (44 %) para equilibrar el título, no los botones.
  const ux = w - uw - 18, uy = clamp(h * 0.44 - uh / 2, 4, h - uh - 4);
  const ranuraY = uy + 8.8 * k;                       // centro de la ranura (cara superior, vista desde arriba)
  const xFin = ux + uw / 2, yFin = ranuraY;          // el barco llega a la ranura
  const base = Math.min(h * 0.4, uy + uh * 0.55), subida = Math.min(220, w * 0.3), xSube = xFin - subida, a = 5 * s;
  const pts: [number, number][] = [];
  for (let x = 0; x <= xFin; x += 4) {
    let y = base + a * Math.sin(x / 38) + a * 0.5 * Math.sin(x / 14 + 1);
    if (x > xSube) { const q = (x - xSube) / subida, e = q * q * (3 - 2 * q); y = y * (1 - e) + yFin * e; }
    pts.push([x, y]);
  }
  pts.push([xFin, yFin]);
  return { k, s, uw, uh, ux, uy, ranuraY, xFin, yFin, pts, d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") };
}
function muestra(pts: [number, number][], x: number) {
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x0, y0] = pts[i - 1];
    if (x <= x1 || i === pts.length - 1) { const dx = x1 - x0 || 1, q = clamp((x - x0) / dx, 0, 1); return { y: y0 + (y1 - y0) * q, pend: (y1 - y0) / dx }; }
  }
  return { y: pts[0][1], pend: 0 };
}

export function VotoAnimado({ className = "" }: { className?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const trazo = useRef<SVGRectElement>(null);
  const barco = useRef<SVGGElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [vuelta, setVuelta] = useState(0);
  const [fin, setFin] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [saliendo, setSaliendo] = useState(false); // desvanece línea y palomita antes de repetir

  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const { w, h } = tam;
  const g = w > 120 && h > 60 ? escena(w, h) : null;

  useEffect(() => {
    if (!g) return;
    setFin(false); setEntrando(false); setSaliendo(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      trazo.current?.setAttribute("width", String(g.ux - 4)); barco.current?.setAttribute("opacity", "0"); setFin(true); return;
    }
    let raf = 0; const t0 = performance.now(); const esperas: number[] = [];
    const tick = (now: number) => {
      const t = now - t0, b = barco.current; if (!b) return;
      let x = g.xFin, y = g.yFin, ang = 90, dy = 0;
      if (t < VIAJE) {
        x = g.xFin * easeOut(t / VIAJE);
        const m = muestra(g.pts, x);
        y = m.y + Math.sin(now / 520) * 1.5 * g.s * (1 - t / VIAJE);
        ang = clamp((Math.atan(m.pend) * 180) / Math.PI, -35, 35);
      } else if (t < VIAJE + GIRO) {          // se pone vertical y se levanta lo justo para quedar sobre la ranura
        const e = easeInOut((t - VIAJE) / GIRO);
        ang = 90 * e; dy = -20 * g.s * e;
      } else {                                   // cae por la ranura
        dy = -20 * g.s + (40 * g.s + 12) * easeIn(Math.min(1, (t - VIAJE - GIRO) / CAIDA));
        setEntrando(true);
      }
      trazo.current?.setAttribute("width", String(Math.min(x, g.ux - 4))); // la línea termina al pie de la urna
      b.setAttribute("opacity", String(clamp((x - w * 0.12) / (w * 0.12), 0, 1))); // aparece después de nacer la línea
      b.setAttribute("transform", `translate(${x.toFixed(1)} ${(y + dy).toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${g.s.toFixed(3)}) translate(-19 -21)`);
      if (t < VIAJE + GIRO + CAIDA) raf = requestAnimationFrame(tick);
      else { // queda la palomita un momento, se desvanece todo y vuelve a zarpar
        setFin(true);
        esperas.push(window.setTimeout(() => setSaliendo(true), PAUSA), window.setTimeout(() => setVuelta((v) => v + 1), PAUSA + 700));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); esperas.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, vuelta]);

  return (
    <div ref={caja} className={`voto-escena ${className}`} aria-hidden>
      {g && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`block overflow-visible ${saliendo ? "vf-saliendo" : ""}`}>
          <defs>
            <linearGradient id="vf-desvanece" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: "#fff", stopOpacity: 0 }} />
              <stop offset="0.3" style={{ stopColor: "#fff", stopOpacity: 1 }} />
              <stop offset="1" style={{ stopColor: "#fff", stopOpacity: 1 }} />
            </linearGradient>
            <mask id="vf-mascara"><rect width={w} height={h} fill="url(#vf-desvanece)" /></mask>
            <clipPath id="vf-trazo"><rect ref={trazo} width="0" height={h} /></clipPath>
            <clipPath id="vf-ranura"><rect x="0" y={-400} width={w} height={400 + g.ranuraY} /></clipPath>
          </defs>

          <g mask="url(#vf-mascara)" className="vf-linea">
            <path d={g.d} fill="none" stroke="var(--serie-fed)" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#vf-trazo)" />
          </g>

          {/* urna: geometría base 46 × 40 escalada k */}
          <g transform={`translate(${g.ux.toFixed(1)} ${g.uy.toFixed(1)}) scale(${g.k.toFixed(3)})`}>
            <g className={`vf-urna ${fin ? "vf-fin" : ""}`}>
              {/* vista desde arriba: tres caras planas translúcidas (sin degradados ni contornos), ranura en la cara superior */}
              <ellipse cx="23" cy="40" rx="23" ry="3.4" fill="var(--fg)" opacity=".07" />
              <path d="M0 8 L23 16 L23 40 L0 32 Z" fill="var(--azul)" fillOpacity=".16" />
              <path d="M23 16 L46 8 L46 32 L23 40 Z" fill="var(--azul)" fillOpacity=".26" />
              <path d="M23 0 L46 8 L23 16 L0 8 Z" fill="var(--azul)" fillOpacity=".08" />
              <path d="M14.2 6.6 L29.3 11.9 L31.8 11 L16.7 5.7 Z" fill="var(--ink)" />
              <path d="M14.2 6.6 L29.3 11.9 L31.8 11 L16.7 5.7 Z" fill="var(--rose)" className="vf-ranura" />
              {/* palomita sobre la cara izquierda (misma inclinación que la cara) */}
              <g transform="matrix(1 0.348 0 1 0 0)">
                <path d="M6 22 l4 4 l8 -8" fill="none" stroke="var(--rose)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="vf-marca" />
              </g>
            </g>
          </g>

          {/* barco (38 × 26 a escala s); al entrar se recorta en la ranura */}
          <g clipPath={entrando ? "url(#vf-ranura)" : undefined}>
            <g ref={barco} opacity="0">
              <svg width="38" height="26" viewBox="0 0 1247 864" style={{ color: "var(--ink)" }}><BarcoArgos /></svg>
            </g>
          </g>
        </svg>
      )}
      {g && <button type="button" className="voto-repetir" onClick={() => setVuelta((v) => v + 1)} tabIndex={-1}
        style={{ left: g.ux - 8, top: g.uy - 30 * g.s, width: g.uw + 16, height: g.uh + 30 * g.s + 14 }} title="Repetir" />}
    </div>
  );
}
