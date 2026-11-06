"use client";
import { useMemo } from "react";
import { type Enfoque } from "@/lib/analisis";
import { fmt } from "@/lib/format";
import {
  SIN_DATOS, RAYADO, mezcla, colorUnidad, leyenda, cortesBivariado, enCategoria, esReñidaEnfoque, radios, mitadDeLosVotos,
  type Contexto, type Leyenda, type Metrica, type UnidadMapa, type Vista,
} from "@/lib/mapa";

// Todo lo que un mapa necesita para dibujar una métrica en una vista, a partir de sus unidades:
// colores de las áreas, círculos, bordes (reñidas), leyenda y qué resaltar al pasar por la leyenda.
// Lo usan el mapa nacional, el de la entidad y el del municipio, para que se comporten igual.

/** Objetivos: solo se dibujan como alcanzables las unidades que el partido pierde por 15 puntos o menos. */
export const ALCANCE_OBJETIVO = 15;

export function useCapaMapa({ unidades, metrica, partido, enfoque, vista, prev, resaltar }: {
  /** unidades que se ven en el mapa (con polígono) */ unidades: UnidadMapa[];
  metrica: Metrica; partido: string; enfoque: Enfoque; vista: Vista;
  /** la elección de comparación (métrica «Cambio»), por id */ prev?: Map<number, UnidadMapa> | null;
  /** clave de la leyenda bajo el cursor */ resaltar?: string | null;
}) {
  const ctx: Contexto = useMemo(() => ({ prev, cortes: metrica === "bivariado" ? cortesBivariado(unidades, partido) : null }), [unidades, metrica, partido, prev]);

  return useMemo(() => {
    const color = (u: UnidadMapa) => colorUnidad(u, metrica, partido, ctx);
    let colores: Record<number, string> = {};
    let circulos: Record<number, { r: number; color: string }> | null = null;
    let bordes: Set<number> | null = null;
    let ley: Leyenda;

    if (vista === "objetivos") {
      const alcanzables = unidades.filter((u) => u.faltan != null && u.margen_enfoque !== null && u.margen_enfoque >= -ALCANCE_OBJETIVO);
      const r = radios(alcanzables, (u) => u.faltan, 16, 2);
      circulos = Object.fromEntries(alcanzables.map((u) => [u.id, { r: r[u.id] ?? 2, color: "var(--rose)" }]));
      for (const u of unidades) colores[u.id] = u.margen_enfoque !== null && u.margen_enfoque >= 0 ? mezcla("var(--azul)", 24) : SIN_DATOS;
      const gana = unidades.filter((u) => u.margen_enfoque !== null && u.margen_enfoque >= 0).length;
      const lejos = unidades.filter((u) => u.margen_enfoque !== null && u.margen_enfoque < -ALCANCE_OBJETIVO).length;
      const sin = unidades.filter((u) => u.ganador && u.margen_enfoque === null).length;
      const total = alcanzables.reduce((a, u) => a + (u.faltan ?? 0), 0);
      ley = {
        items: [
          { k: "gana", color: mezcla("var(--azul)", 24), t: "ya gana", n: gana },
          { k: "alcance", color: "var(--rose)", t: `pierde por ≤ ${ALCANCE_OBJETIVO} pts (círculo = votos que faltan)`, n: alcanzables.length },
          { k: "lejos", color: SIN_DATOS, t: `pierde por más de ${ALCANCE_OBJETIVO}`, n: lejos },
          ...(sin ? [{ k: "sin", color: SIN_DATOS, t: "sin candidatura", n: sin }] : []),
        ],
        nota: alcanzables.length ? `En las ${alcanzables.length} alcanzables le faltan ${fmt(total)} votos en conjunto (votos de la ganadora − los suyos + 1, en cada una).` : undefined,
      };
    } else {
      ley = leyenda(unidades, metrica, partido, enfoque, ctx);
      if (vista === "circulos") {
        const r = radios(unidades, (u) => u.votos_totales);
        circulos = Object.fromEntries(unidades.filter((u) => r[u.id]).map((u) => { const c = color(u); return [u.id, { r: r[u.id], color: c === RAYADO ? "var(--fg-mute)" : c }]; }));
        for (const u of unidades) colores[u.id] = mezcla("var(--fg)", 5);
        const m = mitadDeLosVotos(unidades);
        if (m) ley = { ...ley, nota: [ley.nota, `La mitad de los votos está en ${m.unidades} de ${m.de} unidades (${((100 * m.unidades) / m.de).toFixed(0)}%). Círculo = votos.`].filter(Boolean).join(" · ") };
      } else {
        colores = Object.fromEntries(unidades.map((u) => [u.id, color(u)]));
        if (metrica === "batalla") bordes = new Set(unidades.filter(esReñidaEnfoque).map((u) => u.id));
      }
    }

    const resaltados = !resaltar ? null : new Set(unidades.filter((u) => vista === "objetivos"
      ? (resaltar === "gana" ? (u.margen_enfoque ?? -1) >= 0 : resaltar === "alcance" ? !!circulos?.[u.id] : resaltar === "lejos" ? (u.margen_enfoque ?? 0) < -ALCANCE_OBJETIVO : u.ganador && u.margen_enfoque === null)
      : enCategoria(u, resaltar, metrica, partido, ctx, ley.items)).map((u) => u.id));
    return { colores, circulos, bordes, ley, resaltados, ctx };
  }, [unidades, metrica, partido, enfoque, vista, ctx, resaltar]);
}
