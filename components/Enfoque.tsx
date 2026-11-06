"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { ENFOQUES, ETIQ_CLASE, clasesDe, esEnfoque, type Clase, type Enfoque } from "@/lib/analisis";
import { Ayuda } from "@/components/Ayuda";

// Partido de enfoque de toda la app (General, Morena, PAN, PRI, MC). Se recuerda en el navegador.
const Ctx = createContext<{ enfoque: Enfoque; setEnfoque: (e: Enfoque) => void }>({ enfoque: "general", setEnfoque: () => {} });
export const useEnfoque = () => useContext(Ctx);

export function EnfoqueProvider({ children }: { children: React.ReactNode }) {
  const [enfoque, set] = useState<Enfoque>("general");
  useEffect(() => { try { const g = localStorage.getItem("enfoque"); if (esEnfoque(g)) set(g); } catch {} }, []);
  const setEnfoque = (e: Enfoque) => { set(e); try { localStorage.setItem("enfoque", e); } catch {} };
  return <Ctx.Provider value={{ enfoque, setEnfoque }}>{children}</Ctx.Provider>;
}

/** Selector compacto para la barra superior. */
export function SelectorEnfoque() {
  const { enfoque, setEnfoque } = useEnfoque();
  return (
    <div className="flex items-center gap-1 rounded-full p-0.5" role="radiogroup" aria-label="Partido de enfoque"
      style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }} title="Enfoque: la competitividad (bastión, ventaja, reñida…) se mide desde este partido en toda la app">
      <span className="hidden xl:inline-flex items-center text-xs font-semibold pl-2" style={{ color: "var(--fg-mute)" }}>Enfoque<Ayuda clave="enfoque" tam={12} /></span>
      {ENFOQUES.map((e) => {
        const a = e.id === enfoque;
        return (
          <button key={e.id} role="radio" aria-checked={a} onClick={() => setEnfoque(e.id)}
            className="rounded-full px-2.5 py-1 text-xs font-bold transition-[background-color,color,transform] duration-100 active:scale-95"
            style={a ? { background: e.color, color: "#fff" } : { color: e.id === "general" ? "var(--fg-mute)" : e.color }}>
            {e.t}
          </button>
        );
      })}
    </div>
  );
}

/** Celda de competitividad: en «General» la clase entre las dos primeras; con enfoque, la del partido (% y margen con signo). */
export function CeldaClase({ clase, margenEnfoque, pEnfoque }: { clase: Clase | null; margenEnfoque?: number | null; pEnfoque?: number | null }) {
  const { enfoque } = useEnfoque();
  if (!clase) return <span style={{ color: "var(--fg-mute)" }}>—</span>;
  const e = ETIQ_CLASE[clase];
  return (
    <span className="whitespace-nowrap" title={e.d}>
      <b style={{ color: e.color }}>{e.t}</b>
      {enfoque !== "general" && margenEnfoque != null && <span className="num text-xs" style={{ color: "var(--fg-mute)" }}> {pEnfoque != null ? `${pEnfoque.toFixed(1)}% · ` : ""}{margenEnfoque > 0 ? "+" : ""}{margenEnfoque.toFixed(1)}</span>}
    </span>
  );
}

/** Resumen de clases (conteos) según el enfoque activo. */
export function ResumenClases({ conteo }: { conteo: Record<string, number> }) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((x) => x.id === enfoque)!;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {enfoque !== "general" && <span className="font-semibold" style={{ color: enf.color }}>Desde {enf.t}:</span>}
      {clasesDe(enfoque).filter((c) => enfoque === "general" || conteo[c.k]).map((c) => (
        <span key={c.k} title={c.d}><b style={{ color: c.color }}>{conteo[c.k] ?? 0}</b> {c.t.toLowerCase()}</span>))}
    </span>
  );
}
