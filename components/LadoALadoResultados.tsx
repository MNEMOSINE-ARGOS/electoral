"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Columns2 } from "lucide-react";
import { api, type Estado, type Resultado } from "@/lib/api";
import { claveTerr, nombreCorto, type Terr } from "@/components/FiltroTerritorio";
import { Cargando } from "@/components/Kpi";
import { Ayuda } from "@/components/Ayuda";
import { alcance, colorPartido } from "@/lib/partidos";
import { BLOQUES, indicadores, nombreCandidatura, pedersen, porBloque, porCandidatura, porFamilia } from "@/lib/analisis";
import { fmt, pct } from "@/lib/format";

type Lectura = "candidatura" | "boleta" | "alcance" | "bloque";
/** Colores de las líneas por territorio (sin verdes; los dos primeros, validados para daltonismo) */
export const COLORES_TERR = ["var(--serie-fed)", "var(--serie-loc)", "#d97706", "#7c3aed", "var(--fg-soft)", "#b45309", "#64748b", "#db2777"];

const total = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
/** Reparto de UNA elección según la lectura (igual que las barras de la pantalla) */
function reparto(r: Resultado, l: Lectura) {
  return l === "alcance" ? alcance(r.partidos) : l === "bloque" ? porBloque(r.partidos, r.anio) : l === "candidatura" ? porCandidatura(r.partidos) : r.partidos;
}
/** Para seguir una fuerza entre años: la candidatura se agrupa por el partido que la encabeza (como la trayectoria de la pantalla) */
function repartoSerie(r: Resultado, l: Lectura) { return l === "candidatura" ? porFamilia(r.partidos) : reparto(r, l); }
const nombreDe = (k: string, l: Lectura, serie = false) => (l === "bloque" ? BLOQUES[k]?.nombre ?? k : serie && l === "candidatura" ? `Encabezada por ${k.toUpperCase()}` : nombreCandidatura(k));
const colorDe = (k: string, l: Lectura) => (l === "bloque" ? BLOQUES[k]?.color ?? "#9aa0a6" : colorPartido(k));

/** Dos o más territorios del mismo cargo, lado a lado: el año elegido en columnas y la trayectoria de una fuerza con una línea por territorio.
 *  Cada territorio es su propia serie (/api/presidencial): nunca se suman entre sí. */
export function LadoALadoResultados({ ts, cargoId, anio, lectura, estados, onVer }: {
  ts: Terr[]; cargoId: string; anio: number; lectura: Lectura; estados: Estado[]; onVer: (i: number) => void;
}) {
  const [series, setSeries] = useState<Record<string, Resultado[]> | null>(null);
  const [fuerza, setFuerza] = useState("");
  const clave = ts.map(claveTerr).join("|");
  useEffect(() => {
    setSeries(null);
    let vivo = true;
    Promise.all(ts.map((t) => {
      const qs = new URLSearchParams({ eleccion: cargoId, estado: String(t.estado), municipio: String(t.municipio), distrito: String(t.distrito), seccion: String(t.seccion), anio_ref: String(anio) });
      return api<{ elecciones: Resultado[] }>(`/api/presidencial?${qs}`).then((d) => [claveTerr(t), d.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length)] as const).catch(() => [claveTerr(t), []] as const);
    })).then((rs) => vivo && setSeries(Object.fromEntries(rs)));
    return () => { vivo = false; };
  }, [clave, cargoId, anio]); // eslint-disable-line react-hooks/exhaustive-deps

  // Columnas del año elegido
  const cols = useMemo(() => ts.map((t) => {
    const s = series?.[claveTerr(t)] ?? [];
    const r = s.find((x) => x.anio === anio) ?? null, prev = r ? s.filter((x) => x.anio < anio).at(-1) ?? null : null;
    const b = r ? total(r.partidos) : 0;
    const pcts = r ? Object.fromEntries(Object.entries(reparto(r, lectura)).map(([k, v]) => [k, { p: b ? (100 * v) / b : 0, v }])) : {};
    return { t, r, prev, pcts, ind: r ? indicadores(porCandidatura(r.partidos)) : null, vol: r && prev ? pedersen(porFamilia(r.partidos), porFamilia(prev.partidos)) : null };
  }), [ts, series, anio, lectura]);
  const filas = useMemo(() => {
    const mx = new Map<string, number>();
    for (const c of cols) for (const [k, x] of Object.entries(c.pcts)) mx.set(k, Math.max(mx.get(k) ?? 0, x.p));
    return [...mx.entries()].filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  }, [cols]);

  // Trayectoria de una fuerza: una línea por territorio
  const fuerzas = useMemo(() => {
    const mx = new Map<string, number>();
    for (const s of Object.values(series ?? {})) for (const r of s) { const b = total(r.partidos); for (const [k, v] of Object.entries(repartoSerie(r, lectura))) if (b) mx.set(k, Math.max(mx.get(k) ?? 0, (100 * v) / b)); }
    return [...mx.entries()].filter(([k, v]) => v >= 5 && k !== "otros").sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  }, [series, lectura]);
  const f = fuerzas.includes(fuerza) ? fuerza : fuerzas[0] ?? "";
  const graf = useMemo(() => {
    const porAnio = new Map<number, Record<string, number>>();
    ts.forEach((t, i) => {
      for (const r of series?.[claveTerr(t)] ?? []) {
        const b = total(r.partidos), v = repartoSerie(r, lectura)[f];
        if (!porAnio.has(r.anio)) porAnio.set(r.anio, { anio: r.anio });
        if (b && v !== undefined) porAnio.get(r.anio)![`t${i}`] = +((100 * v) / b).toFixed(1);
      }
    });
    return [...porAnio.values()].sort((a, b) => a.anio - b.anio);
  }, [ts, series, lectura, f]);
  const hayRec = Object.values(series ?? {}).some((s) => s.some((r) => r.reconstruida));

  if (!series) return <Cargando alto={260} />;
  const celda = { minWidth: "8.5rem" };
  return (
    <section className="material p-5 space-y-5 entra" aria-label="Territorios lado a lado">
      <div>
        <p className="label flex items-center gap-1.5"><Columns2 size={13} /> {ts.length} territorios lado a lado · {anio}</p>
        <h2 className="text-xl font-bold pt-1">Votación {lectura === "bloque" ? "por bloque" : lectura === "alcance" ? "por alcance de partido" : lectura === "candidatura" ? "por candidatura" : "por opción en la boleta"}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="t">
          <thead><tr><th />{cols.map((c, i) => (
            <th key={claveTerr(c.t)} style={celda}>
              <button className="text-left font-bold underline-offset-2 hover:underline" onClick={() => onVer(i)} title="Ver en detalle">
                <span className="inline-block size-2.5 rounded-full mr-1.5" style={{ background: COLORES_TERR[i % COLORES_TERR.length] }} />{nombreCorto(c.t, estados)}
              </button>
            </th>))}</tr></thead>
          <tbody>
            {filas.map((k) => (
              <tr key={k}>
                <td className="font-bold whitespace-nowrap" style={{ color: colorDe(k, lectura) }}>{nombreDe(k, lectura)}</td>
                {cols.map((c) => {
                  const x = c.pcts[k], gana = c.ind?.ganador && lectura === "candidatura" && c.ind.ganador === k;
                  return <td key={claveTerr(c.t)} className="whitespace-nowrap">{!c.r ? <span style={{ color: "var(--fg-mute)" }}>sin elección</span> : x ? <>
                    <b className="num" style={gana ? { color: colorDe(k, lectura) } : undefined}>{pct(x.p)}</b> <span className="num text-xs" style={{ color: "var(--fg-mute)" }}>{fmt(x.v)}</span>
                    <span className="block h-1 rounded-full mt-0.5" style={{ width: `${Math.min(100, x.p)}%`, background: colorDe(k, lectura), opacity: 0.75 }} /></> : "—"}</td>;
                })}
              </tr>
            ))}
            <tr><td className="label">Primera fuerza<Ayuda clave="primera_fuerza" /></td>{cols.map((c) => <td key={claveTerr(c.t)}>{c.ind?.ganador ? <b style={{ color: colorPartido(c.ind.ganador) }}>{nombreCandidatura(c.ind.ganador)}</b> : "—"}</td>)}</tr>
            <tr><td className="label">Margen<Ayuda clave="margen" /></td>{cols.map((c) => <td key={claveTerr(c.t)} className="num">{c.ind?.margen != null ? `${c.ind.margen.toFixed(1)} pts` : "—"}</td>)}</tr>
            <tr><td className="label">Participación<Ayuda clave="participacion" /></td>{cols.map((c) => <td key={claveTerr(c.t)} className="num">{pct(c.r?.votos_totales && c.r.lista_nominal ? (100 * c.r.votos_totales) / c.r.lista_nominal : null)}</td>)}</tr>
            <tr><td className="label">Votos emitidos<Ayuda clave="votos_emitidos" /></td>{cols.map((c) => <td key={claveTerr(c.t)} className="num">{fmt(c.r?.votos_totales)}</td>)}</tr>
            <tr><td className="label">Fuerzas que compiten<Ayuda clave="nep" /></td>{cols.map((c) => <td key={claveTerr(c.t)} className="num">{c.ind?.nep ? c.ind.nep.toFixed(1) : "—"}</td>)}</tr>
            <tr><td className="label">Voto que cambió<Ayuda clave="volatilidad" /></td>{cols.map((c) => <td key={claveTerr(c.t)} className="num">{c.vol !== null ? `${c.vol.toFixed(0)}% vs ${c.prev!.anio}` : "—"}</td>)}</tr>
          </tbody>
        </table>
      </div>

      {graf.length > 1 && f && (
        <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold mr-1">Trayectoria de</h3>
            {fuerzas.map((k) => <button key={k} className="chip" aria-pressed={k === f} onClick={() => setFuerza(k)}>{nombreDe(k, lectura, true)}</button>)}
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={graf} margin={{ left: -10, right: 12, top: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="anio" stroke="var(--fg-mute)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--fg-mute)" fontSize={12} unit="%" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12 }} formatter={(v) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {ts.map((t, i) => <Line key={claveTerr(t)} type="linear" dataKey={`t${i}`} name={nombreCorto(t, estados)} stroke={COLORES_TERR[i % COLORES_TERR.length]} strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
        Cada territorio se lee por separado: sus votos no se suman entre sí ni entre años. «Sin elección»: ese territorio no votó el cargo en {anio}
        (en cargos locales cada entidad tiene su calendario; una sección pudo no existir por reseccionamiento). Las coaliciones pueden ser distintas en cada entidad.
        La trayectoria sigue a la fuerza {lectura === "candidatura" ? "por el partido que encabeza cada candidatura" : lectura === "bloque" ? "por bloque (los bloques cambian en 2018 y 2021)" : "elegida"}; un hueco en la línea es una elección sin dato.
        {hayRec && " Los distritos federales incluyen elecciones de otras distritaciones reconstruidas por sección (lectura analítica)."} Toca el nombre de un territorio para verlo en detalle abajo.
      </p>
    </section>
  );
}
