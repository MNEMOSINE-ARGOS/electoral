// Indicadores del Censo 2020 por sección (ECEG 2020: INEGI con la cartografía del INE de enero de 2021). Funciones puras: sirven en servidor y cliente.
// Los datos los escribe scripts/censo_secciones.ts en data/censo2020/<id_estado>.json como CONTEOS (claves del INEGI); aquí se definen los
// indicadores (numerador ÷ denominador) y se calculan, también para territorios (suma de conteos, nunca promedio de porcentajes).

/** Columnas del INEGI que se guardan (el orden es el del archivo). POBTOT va primero. */
export const CAMPOS_CENSO = [
  "POBTOT", "POBFEM", "P_3YMAS", "P_5YMAS", "P_12YMAS", "P_12YMAS_F", "P_15YMAS", "P_18YMAS", "P_18A24", "P_60YMAS", "POB0_14",
  "PNACOE", "PRESOE15", "P3YM_HLI", "POB_AFRO", "PCON_DISC",
  "P15YM_AN", "P15YM_SE", "P18YM_PB", "GRAPROES",
  "PEA", "PEA_F", "PDESOCUP",
  "PSINDER", "PDER_IMSS", "PDER_ISTE", "PDER_ISTEE", "PDER_IMSSB",
  "PCATOLICA", "PRO_CRIEVA", "PSIN_RELIG",
  "TOTHOG", "HOGJEF_F",
  "TVIVPARHAB", "VPH_PISOTI", "VPH_1CUART", "VPH_NODREN", "VPH_AGUAFV", "VPH_AUTOM", "VPH_PC", "VPH_INTER", "VPH_CEL", "VPH_SINTIC",
] as const;
export type CampoCenso = (typeof CAMPOS_CENSO)[number];
export type FilaCenso = Partial<Record<CampoCenso, number | null>>;

export type Grupo = "Población" | "Educación" | "Trabajo y salud" | "Vivienda y bienes" | "Identidad y hogar";
export type Indicador = {
  k: string; t: string; grupo: Grupo; unidad: "%" | "años";
  /** numerador(es) y denominador; GRAPROES es promedio ponderado por la población de 15 años y más */
  num: CampoCenso[]; den: CampoCenso; prom?: boolean;
  que: string; /** en qué dirección suele leerse como más bienestar (para frases), si aplica */ bienestar?: 1 | -1;
};

export const INDICADORES: Indicador[] = [
  { k: "escolaridad", t: "Escolaridad promedio", grupo: "Educación", unidad: "años", num: ["GRAPROES"], den: "P_15YMAS", prom: true, bienestar: 1, que: "Años aprobados en promedio por la población de 15 años y más." },
  { k: "posbasica", t: "Con prepa o más", grupo: "Educación", unidad: "%", num: ["P18YM_PB"], den: "P_18YMAS", bienestar: 1, que: "Personas de 18 años y más con al menos un grado de educación posbásica (bachillerato o más)." },
  { k: "analfabetismo", t: "Analfabetismo", grupo: "Educación", unidad: "%", num: ["P15YM_AN"], den: "P_15YMAS", bienestar: -1, que: "Personas de 15 años y más que no saben leer ni escribir." },
  { k: "sin_escolaridad", t: "Sin escolaridad", grupo: "Educación", unidad: "%", num: ["P15YM_SE"], den: "P_15YMAS", bienestar: -1, que: "Personas de 15 años y más sin ningún grado aprobado." },
  { k: "internet", t: "Viviendas con internet", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_INTER"], den: "TVIVPARHAB", bienestar: 1, que: "Viviendas particulares habitadas con internet." },
  { k: "auto", t: "Viviendas con auto", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_AUTOM"], den: "TVIVPARHAB", bienestar: 1, que: "Viviendas particulares habitadas con automóvil o camioneta." },
  { k: "computadora", t: "Viviendas con computadora", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_PC"], den: "TVIVPARHAB", bienestar: 1, que: "Viviendas con computadora, laptop o tableta." },
  { k: "sin_tic", t: "Viviendas sin tecnología", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_SINTIC"], den: "TVIVPARHAB", bienestar: -1, que: "Viviendas sin radio, televisión, computadora, teléfono, celular ni internet." },
  { k: "piso_tierra", t: "Piso de tierra", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_PISOTI"], den: "TVIVPARHAB", bienestar: -1, que: "Viviendas con piso de tierra." },
  { k: "un_cuarto", t: "Viviendas de un cuarto", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_1CUART"], den: "TVIVPARHAB", bienestar: -1, que: "Viviendas con un solo cuarto (hacinamiento)." },
  { k: "sin_drenaje", t: "Sin drenaje", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_NODREN"], den: "TVIVPARHAB", bienestar: -1, que: "Viviendas sin drenaje." },
  { k: "agua_fuera", t: "Agua fuera de la vivienda", grupo: "Vivienda y bienes", unidad: "%", num: ["VPH_AGUAFV"], den: "TVIVPARHAB", bienestar: -1, que: "Viviendas que no tienen agua entubada dentro (la acarrean o la tienen solo en el patio)." },
  { k: "sin_salud", t: "Sin servicio de salud", grupo: "Trabajo y salud", unidad: "%", num: ["PSINDER"], den: "POBTOT", bienestar: -1, que: "Población sin afiliación a ningún servicio de salud." },
  { k: "seguridad_social", t: "IMSS o ISSSTE", grupo: "Trabajo y salud", unidad: "%", num: ["PDER_IMSS", "PDER_ISTE", "PDER_ISTEE"], den: "POBTOT", bienestar: 1, que: "Población afiliada al IMSS, ISSSTE o ISSSTE estatal: aproxima el empleo formal (una persona puede tener más de una afiliación)." },
  { k: "imss_bienestar", t: "INSABI / IMSS-Bienestar", grupo: "Trabajo y salud", unidad: "%", num: ["PDER_IMSSB"], den: "POBTOT", que: "Población afiliada al INSABI o IMSS-Bienestar (servicios para quien no tiene seguridad social)." },
  { k: "participacion_economica", t: "Participación económica", grupo: "Trabajo y salud", unidad: "%", num: ["PEA"], den: "P_12YMAS", que: "Población de 12 años y más que trabaja o busca trabajo." },
  { k: "participacion_mujeres", t: "Mujeres que trabajan o buscan", grupo: "Trabajo y salud", unidad: "%", num: ["PEA_F"], den: "P_12YMAS_F", que: "Mujeres de 12 años y más económicamente activas." },
  { k: "desocupacion", t: "Desocupación", grupo: "Trabajo y salud", unidad: "%", num: ["PDESOCUP"], den: "PEA", bienestar: -1, que: "Población económicamente activa que no tenía trabajo y lo buscaba." },
  { k: "jovenes", t: "Jóvenes de 18 a 24", grupo: "Población", unidad: "%", num: ["P_18A24"], den: "POBTOT", que: "Población de 18 a 24 años." },
  { k: "mayores", t: "60 años y más", grupo: "Población", unidad: "%", num: ["P_60YMAS"], den: "POBTOT", que: "Población de 60 años y más." },
  { k: "ninos", t: "Menores de 15", grupo: "Población", unidad: "%", num: ["POB0_14"], den: "POBTOT", que: "Población de 0 a 14 años (no vota, pero dice qué tan joven es el hogar)." },
  { k: "migrantes", t: "Nacidos en otro estado", grupo: "Población", unidad: "%", num: ["PNACOE"], den: "POBTOT", que: "Población nacida en otra entidad o país." },
  { k: "recien_llegados", t: "Llegaron desde 2015", grupo: "Población", unidad: "%", num: ["PRESOE15"], den: "P_5YMAS", que: "Población de 5 años y más que en 2015 vivía en otra entidad o país." },
  { k: "discapacidad", t: "Con discapacidad", grupo: "Población", unidad: "%", num: ["PCON_DISC"], den: "POBTOT", que: "Población con alguna discapacidad." },
  { k: "lengua_indigena", t: "Hablan lengua indígena", grupo: "Identidad y hogar", unidad: "%", num: ["P3YM_HLI"], den: "P_3YMAS", que: "Población de 3 años y más que habla alguna lengua indígena." },
  { k: "afro", t: "Afromexicanos", grupo: "Identidad y hogar", unidad: "%", num: ["POB_AFRO"], den: "POBTOT", que: "Población que se considera afromexicana o afrodescendiente." },
  { k: "catolicos", t: "Católicos", grupo: "Identidad y hogar", unidad: "%", num: ["PCATOLICA"], den: "POBTOT", que: "Población que se declara católica." },
  { k: "evangelicos", t: "Protestantes y evangélicos", grupo: "Identidad y hogar", unidad: "%", num: ["PRO_CRIEVA"], den: "POBTOT", que: "Población protestante, cristiana evangélica u otra cristiana no católica." },
  { k: "sin_religion", t: "Sin religión", grupo: "Identidad y hogar", unidad: "%", num: ["PSIN_RELIG"], den: "POBTOT", que: "Población sin religión o sin adscripción religiosa." },
  { k: "jefatura_femenina", t: "Hogares con jefa", grupo: "Identidad y hogar", unidad: "%", num: ["HOGJEF_F"], den: "TOTHOG", que: "Hogares censales cuya persona de referencia es mujer." },
];
export const INDICADOR = Object.fromEntries(INDICADORES.map((x) => [x.k, x])) as Record<string, Indicador>;
export const GRUPOS: Grupo[] = ["Educación", "Vivienda y bienes", "Trabajo y salud", "Población", "Identidad y hogar"];

/** Valor de un indicador para una fila (sección) o para la suma de varias. null si falta algún dato o el denominador es 0. */
export function valor(ind: Indicador, f: FilaCenso): number | null {
  const den = f[ind.den];
  if (den === null || den === undefined || den <= 0) return null;
  if (ind.prom) { const v = f[ind.num[0]]; return v === null || v === undefined ? null : v; }
  let n = 0;
  for (const k of ind.num) { const v = f[k]; if (v === null || v === undefined) return null; n += v; }
  return (100 * n) / den;
}

/** Valor de un indicador para un territorio (varias secciones): Σ numerador ÷ Σ denominador, solo con las secciones que tienen ambos datos
 *  (una celda protegida saca a esa sección de ESE indicador, no la cuenta como 0). Escolaridad: promedio ponderado por la población de 15+. */
export function valorTerritorio(ind: Indicador, filas: FilaCenso[]): number | null {
  let n = 0, d = 0;
  for (const f of filas) {
    const den = f[ind.den]; if (den == null || den <= 0) continue;
    if (ind.prom) { const v = f[ind.num[0]]; if (v == null) continue; n += v * den; d += den; continue; }
    let s = 0, ok = true;
    for (const k of ind.num) { const v = f[k]; if (v == null) { ok = false; break; } s += v; }
    if (ok) { n += s; d += den; }
  }
  return d ? (ind.prom ? n / d : (100 * n) / d) : null;
}

export const fmtInd = (ind: Indicador, v: number | null) => (v === null ? "—" : ind.unidad === "años" ? `${v.toFixed(1)} años` : `${v.toFixed(1)}%`);
