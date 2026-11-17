"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Building2, Scale } from "lucide-react";
import { CARGOS } from "@/lib/cargos";
import { nombreEleccion } from "@/lib/partidos";

// Selector de cargo común a todas las pantallas: mismo icono, nombre y unidad («por distrito», «por entidad»…) que en lib/cargos.ts.
// «tarjetas» en todas las pantallas (decisión del usuario), con la tarjeta que lleva al Poder Judicial; «chips» queda como versión compacta.
// Los cargos que la pantalla no puede mostrar se dejan atenuados con su motivo, no se esconden.

type Opcion = { id: string; nombre: string; unidad: string; icon: typeof Building2 };
// Elecciones del catálogo que no son uno de los 6 cargos (hoy solo la lista de representación proporcional local)
const EXTRAS: Record<string, Omit<Opcion, "id">> = {
  diputados_locales_rp: { nombre: "Diputaciones locales RP", unidad: "lista estatal", icon: Building2 },
};

export function SelectorCargo({ valor, onChange, variante = "tarjetas", disponibles, extras = [], unidad = {}, motivo, judicial = true }: {
  valor: string;
  onChange: (id: string) => void;
  variante?: "tarjetas" | "chips";
  /** Cargos que se pueden elegir; los demás de los 6 salen atenuados. Sin lista, todos. */
  disponibles?: readonly string[];
  /** Elecciones fuera de los 6 cargos que la pantalla ofrece (p. ej. diputados_locales_rp); solo se muestran si están disponibles. */
  extras?: readonly string[];
  /** Cambia el texto de la unidad en esta pantalla (p. ej. presidencia «por distrito» en Distritos). */
  unidad?: Record<string, string>;
  /** Por qué un cargo no está disponible (title y lector de pantalla). */
  motivo?: (id: string) => string;
  /** Tarjeta que lleva a la elección judicial (es un enlace, no un cargo que se elija en la pantalla). */
  judicial?: boolean;
}) {
  const ok = (id: string) => !disponibles || disponibles.includes(id);
  const opciones: Opcion[] = [
    ...CARGOS.map((c) => ({ id: c.id as string, nombre: c.nombre, unidad: c.unidad, icon: c.icon })),
    ...extras.filter((id) => ok(id)).map((id) => ({ id, ...(EXTRAS[id] ?? { nombre: nombreEleccion[id] ?? id, unidad: "", icon: Building2 }) })),
  ];
  // «por distrito», «por entidad»…; presidencia dice solo «todo el país»
  const textoUnidad = (o: Opcion) => unidad[o.id] ?? (!o.unidad ? "" : o.unidad === "todo el país" ? o.unidad : `por ${o.unidad}`);
  const porQue = (id: string) => motivo?.(id) ?? "Este cargo no está disponible en esta pantalla";
  // En la fila deslizable del celular, la tarjeta elegida queda a la vista (solo se mueve la fila, no la página)
  const fila = useRef<HTMLElement>(null);
  useEffect(() => {
    const f = fila.current, t = f?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (f && t && f.scrollWidth > f.clientWidth) f.scrollLeft = Math.max(0, t.offsetLeft - f.offsetLeft - 8);
  }, [valor]);

  if (variante === "tarjetas") return (
    // En celular, una fila que se desliza de lado (las 7 tarjetas en rejilla llenaban la pantalla); desde sm, rejilla
    <section ref={fila} className={`tarjetas-cargo flex overflow-x-auto snap-x gap-2.5 pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:overflow-visible sm:grid-cols-4 ${opciones.length + (judicial ? 1 : 0) > 7 ? "xl:grid-cols-8" : "xl:grid-cols-7"}`} aria-label="Cargo">
      {opciones.map((o) => {
        const activo = ok(o.id), sel = o.id === valor;
        return (
          <button key={o.id} type="button" className="tarjeta-btn shrink-0 w-[9.5rem] sm:w-auto snap-start disabled:opacity-40 disabled:cursor-not-allowed" aria-pressed={sel} disabled={!activo}
            title={activo ? undefined : porQue(o.id)} onClick={() => onChange(o.id)}>
            <o.icon size={18} style={{ color: sel ? "var(--accion)" : "var(--fg-mute)" }} />
            <p className="font-bold text-sm pt-2">{o.nombre}</p>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{textoUnidad(o)}</p>
          </button>
        );
      })}
      {judicial && (
        <Link href="/judicial" className="tarjeta-btn shrink-0 w-[9.5rem] sm:w-auto snap-start">
          <Scale size={18} style={{ color: "#7c3aed" }} />
          <p className="font-bold text-sm pt-2">Poder Judicial</p>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>2025, por persona</p>
        </Link>
      )}
    </section>
  );

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cargo">
      {opciones.map((o) => {
        const activo = ok(o.id), sel = o.id === valor, u = textoUnidad(o);
        return (
          <button key={o.id} type="button" className="chip disabled:opacity-40 disabled:cursor-not-allowed" aria-pressed={sel} disabled={!activo}
            title={activo ? undefined : porQue(o.id)} onClick={() => onChange(o.id)}>
            <o.icon size={14} />{o.nombre}
            {u && <span className="text-[0.68rem] font-medium opacity-70">{u}</span>}
            {!activo && <span className="sr-only">: {porQue(o.id)}</span>}
          </button>
        );
      })}
    </div>
  );
}
