// Colores de partidos. Coaliciones ("pan-pri-prd") toman el color del primer componente conocido.
export const COLORES: Record<string, string> = {
  pan: "#1d5fbf", pri: "#d62828", prd: "#e8b800", pt: "#e0301e", pvem: "#2e9e4f", mc: "#f28a1a", morena: "#8b1d3b",
  pna: "#18b5b0", pes: "#6b3fa0", conve: "#f28a1a", independiente: "#7d7d7d", otros: "#9aa0a6",
};
export function colorPartido(p: string): string {
  if (COLORES[p]) return COLORES[p];
  // Coalición: color del partido que la encabeza políticamente (no el primero alfabético)
  const ts = p.split("-");
  for (const c of ["morena", "pan", "pri", "mc", "prd", "pt", "pvem", "pna", "pes", "conve"]) if (ts.includes(c)) return COLORES[c];
  let h = 0;
  for (const ch of p) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 35% 50%)`;
}
export const nombreEleccion: Record<string, string> = {
  presidente: "Presidente", senado: "Senado", diputados_federales: "Diputados federales", gobernador: "Gobernador",
  alcaldes: "Alcaldes", diputados_locales_mr: "Diputados locales (MR)", diputados_locales_rp: "Diputados locales (RP)",
};
/** Votos por partido "alcance": fila del partido más coaliciones que lo contienen (no suma 100%). */
export function alcance(partidos: Record<string, number>): Record<string, number> {
  const r: Record<string, number> = {};
  for (const [p, v] of Object.entries(partidos)) for (const c of new Set(p.split("-"))) r[c] = (r[c] ?? 0) + v;
  return r;
}
