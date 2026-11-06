import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Organización territorial propia de un municipio: sector y coordinador de cada sección (tabla app_sector_seccion,
// la llena scripts/cargar_sectores.ts). Datos internos: solo con sesión (proxy.ts) y nunca en el repositorio.
// ?municipio=5035 → { secciones: { [seccion_id]: sector }, sectores: [{ sector, coordinador, secciones }] }
export async function GET(req: Request) {
  const municipio = Number(new URL(req.url).searchParams.get("municipio"));
  if (!municipio) return NextResponse.json({ error: "Falta municipio" }, { status: 400 });
  try {
    const r = await q<{ seccion_id: number; sector: string; coordinador: string }>(
      "SELECT seccion_id, sector, coordinador FROM app_sector_seccion WHERE clave_inegi = $1 ORDER BY seccion_id", [municipio]);
    const sectores = new Map<string, { sector: string; coordinador: string; secciones: number }>();
    for (const x of r) {
      const s = sectores.get(x.sector) ?? { sector: x.sector, coordinador: x.coordinador, secciones: 0 };
      s.secciones++; sectores.set(x.sector, s);
    }
    const orden = (a: string) => [parseInt(a, 10) || 0, a.replace(/^\d+/, "")] as const;
    return NextResponse.json({
      secciones: Object.fromEntries(r.map((x) => [x.seccion_id, x.sector])),
      sectores: [...sectores.values()].sort((a, b) => orden(a.sector)[0] - orden(b.sector)[0] || orden(a.sector)[1].localeCompare(orden(b.sector)[1])),
    });
  } catch (e) {
    // La tabla aún no existe (nadie ha cargado sectores): sin sectores, sin error
    if ((e as { code?: string }).code === "42P01") return NextResponse.json({ secciones: {}, sectores: [] });
    throw e;
  }
}
