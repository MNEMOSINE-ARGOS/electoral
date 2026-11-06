import { NextResponse } from "next/server";
import { sectoresDe } from "@/lib/sectores";

// Organización territorial propia de un municipio: sector de cada sección (lib/sectores.ts; sin nombres de personas).
// ?municipio=5035 → { secciones: { [seccion_id]: sector }, sectores: [{ sector, secciones }] }
export async function GET(req: Request) {
  const municipio = Number(new URL(req.url).searchParams.get("municipio"));
  if (!municipio) return NextResponse.json({ error: "Falta municipio" }, { status: 400 });
  return NextResponse.json(sectoresDe(municipio));
}
