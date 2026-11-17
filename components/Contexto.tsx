"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, type Municipio } from "@/lib/api";

// Selección compartida entre pantallas (decisión del usuario, para que no se pierdan al navegar): cargo, año y territorio.
// - Cada pantalla la lee al abrirse (useSincronizarContexto) y la actualiza cuando el usuario cambia algo en ella.
// - Vive en sessionStorage (por pestaña). Un enlace con ?cargo=&anio=&estado=&municipio=&distrito=&seccion= la reemplaza
//   (listas separadas por coma; también acepta ?eleccion=, como el enlace de Distritos a Secciones).
// - Cada pantalla usa solo lo que entiende (p. ej. Electorado no tiene cargo; el mapa abre una sola entidad).

export type Contexto = {
  cargo: string | null; anio: number | null;
  estados: number[]; municipios: number[]; distritos: number[]; secciones: number[];
  /** etiquetas: «m5035» municipio, «s50338» sección (como FiltroT) */ nombres: Record<string, string>;
};
export const CONTEXTO_VACIO: Contexto = { cargo: null, anio: null, estados: [], municipios: [], distritos: [], secciones: [], nombres: {} };
const LLAVE = "contexto";
const PARAMS = ["cargo", "eleccion", "anio", "estado", "municipio", "distrito", "seccion"];

const lista = (v: string | null) => (v ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
const tipoDistrito = (cargo: string | null) => (cargo?.startsWith("diputados_locales") ? "local" : "federal");
/** Los distritos de la selección, solo si son del mismo tipo (federal o local) que el cargo de la pantalla */
export const distritosPara = (c: Contexto, cargo: string) => (tipoDistrito(cargo) === tipoDistrito(c.cargo) ? c.distritos : []);

function guardado(): Contexto {
  try { const g = sessionStorage.getItem(LLAVE); if (g) return { ...CONTEXTO_VACIO, ...JSON.parse(g) }; } catch {}
  return CONTEXTO_VACIO;
}
function guardar(c: Contexto) { try { sessionStorage.setItem(LLAVE, JSON.stringify(c)); } catch {} }

/** La selección vigente: la del enlace (si trae parámetros) o la guardada. Quita los parámetros de la dirección una vez leídos. */
export function leerContexto(): Contexto {
  const p = new URLSearchParams(location.search);
  if (!PARAMS.some((k) => p.has(k))) return guardado();
  const estados = lista(p.get("estado")), municipios = lista(p.get("municipio")), distritos = lista(p.get("distrito")), secciones = lista(p.get("seccion"));
  const c: Contexto = {
    cargo: p.get("cargo") || p.get("eleccion") || null, anio: Number(p.get("anio")) || null,
    // la entidad también sale de la clave de cada nivel
    estados: [...new Set([...estados, ...municipios.map((m) => Math.floor(m / 1000)), ...distritos.map((d) => Math.floor(d / 100)), ...secciones.map((s) => Math.floor(s / 10000))])],
    municipios, distritos, secciones, nombres: {},
  };
  for (const k of PARAMS) p.delete(k);
  const q = p.toString();
  history.replaceState(history.state, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
  guardar(c);
  return c;
}

/** Enlace a una pantalla con esta selección (para compartir) */
export function enlaceContexto(c: Contexto, ruta: string) {
  const p = new URLSearchParams();
  if (c.cargo) p.set("cargo", c.cargo);
  if (c.anio) p.set("anio", String(c.anio));
  const pon = (k: string, v: number[]) => { if (v.length) p.set(k, v.join(",")); };
  pon("estado", c.estados); pon("municipio", c.municipios); pon("distrito", c.distritos); pon("seccion", c.secciones);
  return `${location.origin}${ruta}${p.size ? `?${p}` : ""}`;
}

/** Nombres de municipio que falten (un enlace compartido solo trae claves) */
async function conNombres(c: Contexto): Promise<Contexto> {
  const faltan = c.municipios.filter((m) => !c.nombres[`m${m}`]);
  if (!faltan.length) return c;
  const est = [...new Set(faltan.map((m) => Math.floor(m / 1000)))].join(",");
  try {
    const r = await api<{ municipios: Municipio[] }>(`/api/municipios?estado=${est}`);
    const n = { ...c.nombres };
    for (const m of r.municipios) if (faltan.includes(m.clave_inegi)) n[`m${m.clave_inegi}`] = m.nombre;
    return { ...c, nombres: n };
  } catch { return c; }
}

/** Mezcla una actualización parcial y deja fuera lo que ya no cabe (otra entidad, otro tipo de distrito) */
export function mezclar(c: Contexto, p: Partial<Contexto>): Contexto {
  const def = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Partial<Contexto>;
  const n: Contexto = { ...c, ...def, nombres: { ...c.nombres, ...(def.nombres ?? {}) } };
  if (def.cargo !== undefined && tipoDistrito(def.cargo) !== tipoDistrito(c.cargo) && !def.distritos) n.distritos = [];
  if (def.estados && def.estados.join() !== c.estados.join()) {
    const en = (e: number) => n.estados.includes(e);
    if (!def.municipios) n.municipios = n.municipios.filter((m) => en(Math.floor(m / 1000)));
    if (!def.distritos) n.distritos = n.distritos.filter((d) => en(Math.floor(d / 100)));
    if (!def.secciones) n.secciones = n.secciones.filter((s) => en(Math.floor(s / 10000)));
  }
  if (def.municipios && def.municipios.join() !== c.municipios.join() && !def.secciones) n.secciones = [];
  return n;
}

type Valor = { ctx: Contexto; actualizar: (p: Partial<Contexto>) => void };
const Ctx = createContext<Valor>({ ctx: CONTEXTO_VACIO, actualizar: () => {} });

export function ContextoProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<Contexto>(CONTEXTO_VACIO);
  useEffect(() => { setCtx(guardado()); }, []);
  const actualizar = useCallback((p: Partial<Contexto>) => {
    setCtx((c) => { const n = mezclar(c, p); guardar(n); return n; });
  }, []);
  // Completa nombres de municipio que falten (para la barra y las pantallas)
  const pidiendo = useRef("");
  useEffect(() => {
    const k = ctx.municipios.filter((m) => !ctx.nombres[`m${m}`]).join();
    if (!k || pidiendo.current === k) return;
    pidiendo.current = k;
    conNombres(ctx).then((c) => actualizar({ nombres: c.nombres }));
  }, [ctx, actualizar]);
  return <Ctx.Provider value={{ ctx, actualizar }}>{children}</Ctx.Provider>;
}

export const useContexto = () => useContext(Ctx);

/**
 * Enlaza una pantalla con la selección compartida.
 * - Cuando `listo` (p. ej. ya cargó el catálogo), lee la selección y llama a `aplicar` una sola vez.
 * - Después, cada vez que cambia `parcial` (lo que la pantalla tiene elegido), lo guarda. Lo que la pantalla ajusta sola
 *   justo al aplicar no se guarda: solo lo que cambia después.
 */
export function useSincronizarContexto(listo: boolean, aplicar: (c: Contexto) => void, parcial: Partial<Contexto>) {
  const { actualizar } = useContexto();
  const fase = useRef<"espera" | "aplicando" | "activo">("espera");
  const base = useRef("");
  const clave = JSON.stringify(parcial);
  const claveRef = useRef(clave);
  claveRef.current = clave;
  // Guardar (va antes que «aplicar» para que el primer estado tras aplicar sea la base, no un cambio)
  useEffect(() => {
    if (fase.current !== "activo") return;
    if (clave !== base.current) { base.current = clave; actualizar(parcial); }
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!listo || fase.current !== "espera") return;
    fase.current = "aplicando";
    let vivo = true;
    conNombres(leerContexto()).then((c) => {
      if (!vivo) return;
      actualizar(c);
      aplicar(c);
      // la base es el estado ya aplicado (tras el siguiente render). Si no había nada elegido, lo que la pantalla muestra
      // por omisión pasa a ser la selección (para que la barra «Estás viendo» diga qué se ve)
      const vacio = !c.cargo && !c.estados.length;
      setTimeout(() => { base.current = claveRef.current; fase.current = "activo"; if (vacio) actualizar(JSON.parse(claveRef.current)); }, 0);
    });
    return () => { vivo = false; if (fase.current === "aplicando") fase.current = "espera"; };
  }, [listo]); // eslint-disable-line react-hooks/exhaustive-deps
}
