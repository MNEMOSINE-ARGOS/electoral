"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Link2, Check } from "lucide-react";
import { useContexto, enlaceContexto, type Contexto } from "@/components/Contexto";
import { useCatalogo } from "@/components/useCatalogo";
import { nombreEleccion } from "@/lib/partidos";

// Barra «Estás viendo» bajo la barra superior: la selección compartida (components/Contexto) que siguen todas las pantallas,
// y un botón para copiar el enlace exacto. No aparece mientras no haya nada elegido.

/** Territorio de la selección como ruta: «Coahuila › Torreón › Sección 338» (con varios, cuántos) */
export function rutaTerritorio(c: Contexto, nombreEstado: (id: number) => string): string[] {
  const r: string[] = [];
  const varios = (ids: number[], uno: (id: number) => string, plural: string) => (ids.length <= 2 ? ids.map(uno).join(", ") : `${ids.length} ${plural}`);
  r.push(c.estados.length ? varios(c.estados, nombreEstado, "entidades") : "Todo el país");
  if (c.municipios.length) r.push(varios(c.municipios, (m) => c.nombres[`m${m}`] ?? `Municipio ${m % 1000}`, "municipios"));
  const local = c.cargo?.startsWith("diputados_locales");
  if (c.distritos.length) r.push(varios(c.distritos, (d) => `Distrito ${local ? "local " : ""}${d % 100}`, local ? "distritos locales" : "distritos"));
  if (c.secciones.length) r.push(varios(c.secciones, (s) => `Sección ${s % 10000}`, "secciones"));
  return r;
}

export function BarraContexto() {
  const { ctx } = useContexto();
  const cat = useCatalogo();
  const path = usePathname();
  const [copiado, setCopiado] = useState(false);
  const [manual, setManual] = useState("");
  if (!ctx.cargo && !ctx.estados.length) return null;
  const nombreEstado = (id: number) => cat?.estados.find((e) => e.id_estado === id)?.nombre_corto ?? `Entidad ${id}`;
  const ruta = rutaTerritorio(ctx, nombreEstado);
  const eleccion = ctx.cargo ? `${nombreEleccion[ctx.cargo] ?? ctx.cargo}${ctx.anio ? ` ${ctx.anio}` : ""}` : "";

  async function copiar() {
    const url = enlaceContexto(ctx, path);
    try { await navigator.clipboard.writeText(url); setCopiado(true); setManual(""); setTimeout(() => setCopiado(false), 2000); }
    catch { setManual(url); } // sin portapapeles: se muestra para copiarlo a mano
  }
  return (
    <div className="barra-contexto" aria-label="Selección actual">
      <span className="label shrink-0 hidden sm:inline">Estás viendo</span>
      <p className="flex flex-1 items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap font-semibold" aria-live="polite">
        {eleccion && <><span className="truncate">{eleccion}</span><span className="px-1" style={{ color: "var(--fg-mute)" }}>·</span></>}
        {ruta.map((t, i) => <span key={i} className="flex items-center gap-1 min-w-0">{i > 0 && <ChevronRight size={13} className="shrink-0" style={{ color: "var(--fg-mute)" }} />}<span className="truncate">{t}</span></span>)}
      </p>
      <button type="button" className="chip !py-1 shrink-0 ml-auto" onClick={copiar} title="Copia un enlace que abre esta pantalla con esta misma selección">
        {copiado ? <Check size={13} /> : <Link2 size={13} />}{copiado ? "Copiado" : "Copiar enlace"}
      </button>
      {manual && <input className="field !py-1 text-xs basis-full" readOnly value={manual} onFocus={(e) => e.target.select()} aria-label="Enlace para copiar" />}
    </div>
  );
}
