import { Landmark, Building, Users2, Crown, Building2, Home } from "lucide-react";

// Cada cargo se elige en su propia demarcación ("unidad"). La app muestra los resultados en esa unidad.
export type CargoId = "presidente" | "senado" | "diputados_federales" | "gobernador" | "diputados_locales_mr" | "alcaldes";
export const CARGOS: { id: CargoId; nombre: string; unidad: string; unidades: string; regla: string; icon: typeof Landmark; ambito: "federal" | "local" }[] = [
  { id: "presidente", nombre: "Presidencia", unidad: "nacional", unidades: "entidades", ambito: "federal", icon: Landmark,
    regla: "Se elige en una sola circunscripción nacional. Se lee por entidad y, dentro de cada una, por distrito federal." },
  { id: "senado", nombre: "Senado", unidad: "entidad", unidades: "entidades", ambito: "federal", icon: Building,
    regla: "Por entidad: 2 escaños a la fórmula ganadora y 1 a la primera minoría (96), más 32 por lista nacional." },
  { id: "diputados_federales", nombre: "Diputaciones federales", unidad: "distrito", unidades: "distritos", ambito: "federal", icon: Users2,
    regla: "300 distritos de mayoría relativa y 200 de representación proporcional, repartidos en 5 circunscripciones." },
  { id: "gobernador", nombre: "Gubernaturas", unidad: "entidad", unidades: "entidades", ambito: "local", icon: Crown,
    regla: "Por entidad, cada estado en su propio calendario. Se lee por municipio." },
  { id: "diputados_locales_mr", nombre: "Diputaciones locales", unidad: "distrito local", unidades: "distritos locales", ambito: "local", icon: Building2,
    regla: "Por distrito local de mayoría en cada congreso estatal; cada estado tiene su mapa y su calendario." },
  { id: "alcaldes", nombre: "Ayuntamientos", unidad: "municipio", unidades: "municipios", ambito: "local", icon: Home,
    regla: "Por municipio (en CDMX, alcaldías), cada estado en su propio calendario." },
];
export const cargo = (id: string) => CARGOS.find((c) => c.id === id) ?? CARGOS[0];
