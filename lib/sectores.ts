// Organización territorial propia: sector de cada sección, por municipio. Los genera scripts/sectores_geojson.ts en data/sectores/
// (solo el sector: sin nombres de personas) y se registran aquí. No es una división oficial del INE.
import torreon from "@/data/sectores/5035.json";

type Archivo = { municipio: number; fuente: string; secciones: Record<string, string> };
const TODOS: Archivo[] = [torreon];

export function sectoresDe(municipio: number) {
  const a = TODOS.find((x) => x.municipio === municipio);
  if (!a) return { secciones: {}, sectores: [] };
  const n = new Map<string, number>();
  for (const s of Object.values(a.secciones)) n.set(s, (n.get(s) ?? 0) + 1);
  // 7, 8A, 8B, 9A… 10A, 11B: por número y luego por letra
  const clave = (s: string) => [parseInt(s, 10) || 0, s.replace(/^\d+/, "")] as const;
  const sectores = [...n].map(([sector, secciones]) => ({ sector, secciones }))
    .sort((x, y) => clave(x.sector)[0] - clave(y.sector)[0] || clave(x.sector)[1].localeCompare(clave(y.sector)[1]));
  return { secciones: a.secciones, sectores };
}
