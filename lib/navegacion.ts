// Mapa de la app: lo usan la barra lateral (app/(app)/layout.tsx) y la portada (app/(app)/inicio). Una sola definición para
// que el menú y la explicación de cada pantalla no se desfasen. Si agregas una pantalla, agrégala aquí con su descripción.
import { Vote, LineChart, Map, GitCompareArrows, Layers, Grid3x3, Users, Scale, Home } from "lucide-react";

export type Pantalla = {
  href: string; label: string; icon: typeof Vote; color: string;
  /** una línea: para qué sirve */ resumen: string;
  /** preguntas que responde */ preguntas: string[];
  /** qué contiene, en orden de aparición */ contiene: string[];
  /** respeta el partido de enfoque */ enfoque?: boolean;
};

export const INICIO: Pantalla = { href: "/inicio", label: "Inicio", icon: Home, color: "var(--fg-soft)", resumen: "Qué es Argos y cómo recorrerlo.", preguntas: [], contiene: [] };

export const GRUPOS: { titulo: string; items: Pantalla[] }[] = [
  { titulo: "Resultados", items: [
    { href: "/", label: "Resultados por cargo", icon: Vote, color: "#F0627A", enfoque: true,
      resumen: "Elige un cargo, un año y un territorio, y lee quién ganó, por cuánto y con qué historia.",
      preguntas: ["¿Quién ganó y por qué margen?", "¿Cuántas unidades ganó cada fuerza?", "¿Cuál es el piso y el techo de un partido aquí y cuántos votos puede aspirar a sacar?"],
      contiene: ["Cargo → año → territorio: entidad, distrito, municipio o sección", "Votación por partido y por coalición, con cuatro lecturas (candidatura, boleta, alcance, bloque)",
        "Unidades ganadas y competitividad (bastión, ventaja, competitiva, reñida)", "Trayectoria del cargo en ese territorio", "Piso y techo histórico y votos posibles hoy"] },
    { href: "/secciones", label: "Lectura por sección", icon: Grid3x3, color: "#D97706", enfoque: true,
      resumen: "La unidad más fina: una sección electoral, su historia, su gente y su comportamiento.",
      preguntas: ["¿Cómo ha votado esta sección en cada elección?", "¿Sigue al país o va por su cuenta?", "¿Dónde conviene trabajar y cuántos votos faltan para ganar?"],
      contiene: ["Buscador de secciones dentro de un territorio", "Historial electoral de la sección", "Tendencia frente al país y frente a su estado",
        "Edad y sexo del electorado (pirámide y edad media)", "Perfil de participación", "Estrategia: bastiones, conquistas, secciones al alcance y votos para ganar"] },
    { href: "/electorado", label: "Electorado", icon: Users, color: "#3D4558",
      resumen: "Quiénes pueden votar: lista nominal por edad y sexo y cómo cambia con el tiempo.",
      preguntas: ["¿Qué tan joven o mayor es el electorado de un territorio?", "¿Cuánto creció la lista nominal?"],
      contiene: ["Pirámide por edad y sexo (cortes de 2021 a 2026)", "Evolución de la lista nominal por corte (2017-2026)"] },
    { href: "/historico", label: "Evolución y comparación", icon: LineChart, color: "#7c3aed",
      resumen: "Cómo ha cambiado un cargo en un territorio, y una elección frente a otra.",
      preguntas: ["¿Qué fuerza creció o cayó desde la elección anterior?", "¿Cómo se compara 2018 con 2024 aquí?"],
      contiene: ["Trayectoria de cada partido o bloque a lo largo de los años", "Elección contra elección: diferencias por partido"] },
  ] },
  { titulo: "Territorio", items: [
    { href: "/estados", label: "Mapa nacional", icon: Map, color: "#0E71AF", enfoque: true,
      resumen: "El país de un vistazo: quién ganó, qué tan reñido, cuánto se votó y dónde pesa cada partido.",
      preguntas: ["¿Dónde ganó cada fuerza?", "¿Qué entidades fueron más reñidas?", "¿Dónde está al alcance mi partido?", "¿Cómo se ve Coahuila por sección?"],
      contiene: ["Mapa o mosaico por entidad, con leyenda que ubica cada categoría", "Frases con lo que dice el mapa y entidades ordenadas por margen",
        "Mapa por municipio, distrito y sección de las entidades con cartografía del INE (Coahuila)"] },
    { href: "/municipios", label: "Comparar territorios", icon: GitCompareArrows, color: "#3D4558",
      resumen: "Pon territorios del mismo tipo lado a lado.",
      preguntas: ["¿En qué municipio se votó más?", "¿Cómo se comparan dos municipios en la misma elección?"],
      contiene: ["Búsqueda de municipios por nombre", "Participación y votos totales comparados"] },
    { href: "/distritos", label: "Distritos y circunscripciones", icon: Layers, color: "#0E71AF", enfoque: true,
      resumen: "Distritos federales y locales, y las cinco circunscripciones plurinominales.",
      preguntas: ["¿Qué municipios forman este distrito?", "¿Cómo ha votado este distrito con su mapa actual?"],
      contiene: ["Distritos por estado, con su competitividad", "Municipios que integran cada distrito", "Historia del distrito por bloque (mismo mapa distrital)", "Circunscripciones plurinominales"] },
  ] },
  { titulo: "Poder Judicial", items: [
    { href: "/judicial", label: "Elección judicial 2025", icon: Scale, color: "#7c3aed",
      resumen: "La primera elección de jueces, magistrados y ministros: aquí se vota por personas, no por partidos.",
      preguntas: ["¿Quiénes fueron las personas más votadas?", "¿Cuánta gente votó en cada entidad?"],
      contiene: ["Cargos federales y sus candidaturas", "Personas que votaron frente a la lista nominal, por entidad"] },
  ] },
];
