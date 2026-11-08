/** Lista de claves numéricas de un parámetro «5,19,24» (selección múltiple de territorios). Ignora vacíos, ceros y basura. */
export function claves(s: string | null | undefined): number[] {
  return [...new Set((s ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}
