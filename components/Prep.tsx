"use client";
import { useCatalogo } from "@/components/useCatalogo";
import { AvisoPrep } from "@/components/MapaPiezas";

// Marca de resultados preliminares (PREP) para cualquier pantalla. Qué elecciones son PREP lo dice el catálogo (lib/prep.ts),
// estén ya cargadas en la base (scripts/cargar_prep.ts) o no. Regla: un PREP nunca se presenta como cómputo oficial.

/** Devuelve el PREP de una elección (cargo + año), o undefined si es cómputo. */
export function usePrep() {
  const cat = useCatalogo();
  return (eleccion: string, anio: number | null | undefined) => (cat?.prep ?? []).find((p) => p.eleccion === eleccion && p.anio === anio);
}

/** Marca junto al año. Por decisión del usuario el año se muestra solo («2026», sin «PREP»): no dibuja nada.
 *  El aviso de resultados preliminares (AvisoSiPrep) sigue apareciendo al elegir esa elección. */
export function MarcaPrep(_: { eleccion: string; anio: number | null | undefined }) {
  return null;
}

/** Aviso completo cuando la elección elegida es PREP. */
export function AvisoSiPrep({ eleccion, anio, donde }: { eleccion: string; anio: number | null | undefined; donde?: string }) {
  const prep = usePrep()(eleccion, anio);
  return prep ? <AvisoPrep meta={{ fuente: "prep", ...prep }} donde={donde} /> : null;
}
