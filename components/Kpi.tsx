import { Ayuda } from "@/components/Ayuda";

/** Tarjeta de indicador. `ayuda` = clave de lib/glosario.ts (icono «?» con la explicación). */
export function Kpi({ titulo, valor, nota, acento, ayuda }: { titulo: string; valor: string; nota?: string; acento?: boolean; ayuda?: string }) {
  return (
    <div className="material p-4 space-y-1">
      <p className="label">{titulo}{ayuda && <Ayuda clave={ayuda} />}</p>
      <p className="display text-3xl font-bold" style={{ color: acento ? "var(--rose)" : "var(--fg)" }}>{valor}</p>
      {nota && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{nota}</p>}
    </div>
  );
}

export function Confianza(_: { nivel: string | null | undefined }) {
  // No se muestra: el usuario prefiere no exhibir niveles de confianza en la interfaz.
  return null;
}

export function Cargando({ alto = 260 }: { alto?: number }) {
  return <div className="skeleton w-full" style={{ height: alto }} aria-busy="true" aria-label="Cargando" />;
}
