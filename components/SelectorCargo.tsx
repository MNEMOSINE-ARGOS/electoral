"use client";
import Link from "next/link";
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

  if (variante === "tarjetas") return (
    <section className={`grid grid-cols-2 md:grid-cols-4 ${opciones.length + (judicial ? 1 : 0) > 7 ? "xl:grid-cols-8" : "xl:grid-cols-7"} gap-2.5`} aria-label="Cargo">
      {opciones.map((o) => {
        const activo = ok(o.id), sel = o.id === valor;
        return (
          <button key={o.id} type="button" className="tarjeta-btn disabled:opacity-40 disabled:cursor-not-allowed" aria-pressed={sel} disabled={!activo}
            title={activo ? undefined : porQue(o.id)} onClick={() => onChange(o.id)}>
            <o.icon size={18} style={{ color: sel ? "var(--accion)" : "var(--fg-mute)" }} />
            <p className="font-bold text-sm pt-2">{o.nombre}</p>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{textoUnidad(o)}</p>
          </button>
        );
      })}
      {judicial && (
        <Link href="/judicial" className="tarjeta-btn">
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
