export function Kpi({ titulo, valor, nota, acento }: { titulo: string; valor: string; nota?: string; acento?: boolean }) {
  return (
    <div className="material p-4 space-y-1">
      <p className="label">{titulo}</p>
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
