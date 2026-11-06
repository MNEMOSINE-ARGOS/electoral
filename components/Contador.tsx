"use client";
import { useEffect, useRef, useState } from "react";

/** Número que sube hasta su valor cuando entra en pantalla. Curva de resorte críticamente amortiguado (sin rebote):
 *  rápido al inicio y se asienta suave. Con «reducir movimiento» aparece directo. Si el valor cambia, parte del número
 *  que se ve en ese momento (nunca salta a cero). */
export function Contador({ valor, decimales = 0, sufijo = "", duracion = 1.1 }: { valor: number; decimales?: number; sufijo?: string; duracion?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const actual = useRef(0);
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducido) { actual.current = valor; setMostrado(valor); return; }
    let raf = 0;
    const animar = () => {
      const desde = actual.current, t0 = performance.now(), w = 6 / duracion; // ω: se asienta (<0.2%) en ~duracion s
      const paso = (t: number) => {
        const s = (t - t0) / 1000;
        const p = s >= duracion ? 1 : 1 - (1 + w * s) * Math.exp(-w * s); // resorte críticamente amortiguado
        actual.current = desde + (valor - desde) * p;
        setMostrado(actual.current);
        if (p < 1) raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { animar(); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [valor, duracion]);
  const txt = mostrado.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  const final = valor.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return <span ref={ref} aria-label={`${final}${sufijo}`}><span aria-hidden>{txt}{sufijo}</span></span>;
}
