"use client";
import type { ReactNode } from "react";

// «En resumen»: pocas frases con lo que dicen las cifras de la pantalla, antes de tablas y gráficas (como «lo que dice el mapa»).
// Cada pantalla arma sus frases con los mismos datos que dibuja abajo; aquí solo se presentan. Sin frases no aparece.

export type Frase = { color: string; texto: ReactNode };

export function ResumenPantalla({ titulo, frases, nota }: { titulo: string; frases: (Frase | null | false | "" | 0 | undefined)[]; nota: string }) {
  const fs = frases.filter(Boolean) as Frase[];
  if (!fs.length) return null;
  return (
    <section id="en-resumen" className="material p-4 md:p-5 space-y-2.5 entra" aria-label="En resumen">
      <p className="label">{titulo}</p>
      <ul className="mapa-frases resumen-frases">
        {fs.map((f, i) => <li key={i}><span className="mapa-ley-c" style={{ background: f.color }} /><span>{f.texto}</span></li>)}
      </ul>
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{nota}</p>
    </section>
  );
}
