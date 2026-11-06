"use client";
import { Mars, Venus } from "lucide-react";
import { fmt, pct } from "@/lib/format";

/** Pirámide de edad por sexo (lista nominal). Hombres a la izquierda, mujeres a la derecha. */
export function Piramide({ grupos, h, m, nb }: { grupos: string[]; h: number[]; m: number[]; nb?: number }) {
  const tH = h.reduce((a, b) => a + b, 0), tM = m.reduce((a, b) => a + b, 0), tot = tH + tM + (nb ?? 0);
  const max = Math.max(...h, ...m, 1);
  const pers = Math.round((tM / (tH + tM || 1)) * 10); // pictograma de 10 figuras
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Lado icono={<Mars size={34} />} color="var(--hombre)" titulo="Hombres" n={tH} p={tot ? (100 * tH) / tot : 0} />
        <Lado icono={<Venus size={34} />} color="var(--mujer)" titulo="Mujeres" n={tM} p={tot ? (100 * tM) / tot : 0} />
      </div>
      <div className="flex justify-center gap-1" aria-label={`De cada 10 personas en la lista, ${pers} son mujeres`}>
        {Array.from({ length: 10 }, (_, i) => (i < 10 - pers ? <Mars key={i} size={26} color="var(--hombre)" /> : <Venus key={i} size={26} color="var(--mujer)" />))}
      </div>
      <div className="space-y-1">
        {[...grupos].reverse().map((g, k) => {
          const i = grupos.length - 1 - k;
          return (
            <div key={g} className="grid grid-cols-[1fr_3.2rem_1fr] items-center gap-2 text-xs">
              <div className="flex justify-end items-center gap-2"><span style={{ color: "var(--fg-mute)" }}>{fmt(h[i])}</span>
                <div className="h-4 rounded-l-md" style={{ width: `${(100 * h[i]) / max}%`, background: "var(--hombre)", minWidth: 2 }} /></div>
              <span className="text-center font-bold">{g}</span>
              <div className="flex items-center gap-2"><div className="h-4 rounded-r-md" style={{ width: `${(100 * m[i]) / max}%`, background: "var(--mujer)", minWidth: 2 }} />
                <span style={{ color: "var(--fg-mute)" }}>{fmt(m[i])}</span></div>
            </div>
          );
        })}
      </div>
      {!!nb && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>No binario: {fmt(nb)} personas (no se grafican por rango de edad).</p>}
    </div>
  );
}

function Lado({ icono, color, titulo, n, p }: { icono: React.ReactNode; color: string; titulo: string; n: number; p: number }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <span style={{ color }}>{icono}</span>
      <div><p className="label">{titulo}</p><p className="display text-2xl font-bold" style={{ color }}>{pct(p)}</p><p className="text-xs" style={{ color: "var(--fg-mute)" }}>{fmt(n)}</p></div>
    </div>
  );
}
