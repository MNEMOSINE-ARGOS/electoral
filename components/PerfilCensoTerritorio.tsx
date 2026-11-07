"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Briefcase, Home, Users, Fingerprint } from "lucide-react";
import { api } from "@/lib/api";
import { GRUPOS, INDICADORES, fmtInd, type Grupo } from "@/lib/censo";
import { Cargando } from "@/components/Kpi";
import { Ayuda } from "@/components/Ayuda";
import { fmt } from "@/lib/format";

type Resumen = { valores: (number | null)[]; absolutos: (number | null)[]; poblacion: number | null; hogares: number | null; viviendas: number | null; secciones: number };
type R = { fuente: string; indicadores: string[]; territorio: Resumen; estado: Resumen | null; nacional: Resumen; nivel: "nacional" | "estado" | "municipio" };

const ICONO: Record<Grupo, React.ReactNode> = {
  "Educación": <GraduationCap size={18} />, "Trabajo y salud": <Briefcase size={18} />, "Vivienda y bienes": <Home size={18} />,
  "Población": <Users size={18} />, "Identidad y hogar": <Fingerprint size={18} />,
};
// Qué cuenta el numerador de cada indicador (para la cifra absoluta)
const QUE_CUENTA = (den: string) => (den === "TVIVPARHAB" ? "viviendas" : den === "TOTHOG" ? "hogares" : "personas");

/** Indicadores del Censo 2020 (INEGI) del territorio elegido en Electorado, contra su estado y el país. */
export function PerfilCensoTerritorio({ estado, municipio, lugar, nombreEstado }: { estado: number; municipio: number; lugar: string; nombreEstado: string }) {
  const [d, setD] = useState<R | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setD(null); setError(""); api<R>(`/api/censo-territorio?estado=${estado}&municipio=${municipio}`).then(setD).catch((e) => setError(e.message)); }, [estado, municipio]);
  if (error) return <section className="material p-5"><p role="alert" style={{ color: "var(--bad)" }}>{error}</p></section>;
  if (!d) return <Cargando alto={360} />;

  const t = d.territorio, ref = d.nivel === "nacional" ? null : (d.nivel === "municipio" ? d.estado : d.nacional);
  const refNom = d.nivel === "municipio" ? nombreEstado : "el país";
  const iDe = (k: string) => INDICADORES.findIndex((x) => x.k === k);
  const v = (k: string) => t.valores[iDe(k)];
  const mute = { color: "var(--fg-mute)" };

  return (
    <section className="material p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label">Censo de Población y Vivienda 2020 · INEGI · {lugar}</p>
          <h2 className="text-xl font-bold pt-1">Escolaridad, trabajo, hogares y vivienda<Ayuda clave="censo_territorio" /></h2>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Cifra t="Habitantes (2020)" v={fmt(t.poblacion)} n={`${fmt(t.secciones)} secciones`} />
        <Cifra t="Hogares" v={fmt(t.hogares)} n={v("jefatura_femenina") !== null ? `${fmtInd(INDICADORES[iDe("jefatura_femenina")], v("jefatura_femenina"))} con jefa de familia` : undefined} color="var(--mujer)" />
        <Cifra t="Viviendas habitadas" v={fmt(t.viviendas)} n={v("internet") !== null ? `${fmtInd(INDICADORES[iDe("internet")], v("internet"))} con internet` : undefined} />
        <Cifra t="Escolaridad promedio" v={fmtInd(INDICADORES[iDe("escolaridad")], v("escolaridad"))}
          n={`mujeres ${v("escolaridad_mujeres")?.toFixed(1) ?? "—"} · hombres ${v("escolaridad_hombres")?.toFixed(1) ?? "—"}`} color="var(--azul)" />
        <Cifra t="Población ocupada" v={fmtInd(INDICADORES[iDe("ocupados")], v("ocupados"))} n={`${fmt(t.absolutos[iDe("ocupados")])} personas de 12 años y más`} />
      </div>

      {ref && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={mute}>
          <span><i className="inline-block w-3 h-2.5 rounded-sm align-middle mr-1" style={{ background: "var(--azul)" }} />{lugar}</span>
          <span><i className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: "var(--rose)" }} />{refNom}</span>
          {d.nivel === "municipio" && <span><i className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: "var(--fg)" }} />País</span>}
          <span>· diferencia en puntos frente a {refNom}: azul = más aquí, rosa = menos</span>
        </div>)}

      <div className="grid lg:grid-cols-2 gap-5">
        {GRUPOS.map((g) => (
          <div key={g} className="space-y-2">
            <p className="font-bold flex items-center gap-2"><span style={{ color: "var(--azul)" }}>{ICONO[g]}</span>{g}</p>
            <div className="space-y-2.5">
              {INDICADORES.map((ind, i) => ({ ind, i })).filter(({ ind }) => ind.grupo === g).map(({ ind, i }) => {
                const val = t.valores[i], vr = ref?.valores[i] ?? null, vn = d.nivel === "municipio" ? d.nacional.valores[i] : null;
                const max = ind.unidad === "años" ? 16 : Math.max(val ?? 0, vr ?? 0, vn ?? 0, 1) * 1.15;
                const dif = val !== null && vr !== null ? val - vr : null;
                const umbral = ind.unidad === "años" ? 0.2 : 1;
                return (
                  <div key={ind.k} className="text-sm" title={ind.que}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{ind.t}</span>
                      <span className="whitespace-nowrap"><b className="num">{fmtInd(ind, val)}</b>
                        {dif !== null && <span className="num text-xs font-semibold ml-1.5" style={{ color: Math.abs(dif) < umbral ? "var(--fg-mute)" : dif > 0 ? "var(--azul)" : "var(--rose)" }}>{dif > 0 ? "+" : ""}{dif.toFixed(1)}{ind.unidad === "años" ? "" : " pts"}</span>}</span>
                    </div>
                    <div className="relative h-2.5 rounded-full mt-1" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (100 * (val ?? 0)) / max)}%`, background: "var(--azul)" }} />
                      {vr !== null && <i className="absolute top-[-3px] bottom-[-3px] w-0.5" style={{ left: `${Math.min(100, (100 * vr) / max)}%`, background: "var(--rose)" }} />}
                      {vn !== null && <i className="absolute top-[-3px] bottom-[-3px] w-0.5" style={{ left: `${Math.min(100, (100 * vn) / max)}%`, background: "var(--fg)" }} />}
                    </div>
                    <p className="text-xs pt-0.5" style={mute}>
                      {t.absolutos[i] !== null && <>{fmt(t.absolutos[i])} {QUE_CUENTA(ind.den)} · </>}
                      {vr !== null && <>{refNom}: {fmtInd(ind, vr)}</>}{vn !== null && <> · país: {fmtInd(ind, vn)}</>}
                    </p>
                  </div>);
              })}
            </div>
          </div>))}
      </div>

      <ul className="nota-metodo text-xs space-y-1" style={mute}>
        <li>Fuente: {d.fuente}. Datos de marzo de 2020: describen a toda la población (no solo a quienes votan) y no se actualizan con la lista nominal.</li>
        {d.nivel === "municipio" && <li>El municipio se arma con sus secciones electorales (límites del INE), que no coinciden exactamente con los del INEGI: la población puede diferir algunas décimas de punto del dato municipal oficial.</li>}
        <li>Cada porcentaje es Σ numerador ÷ Σ denominador de las secciones con dato; las celdas que el INEGI protege por confidencialidad no se cuentan como 0. Escolaridad: años aprobados, promedio ponderado por la población de 15 años y más. Pasa el cursor por un indicador para ver qué mide.</li>
      </ul>
    </section>
  );
}

function Cifra({ t, v, n, color }: { t: string; v: string; n?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-3.5 space-y-0.5" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <p className="label">{t}</p>
      <p className="display text-[1.35rem] font-bold leading-tight num" style={{ color: color ?? "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
