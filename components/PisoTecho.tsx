"use client";
import { useEffect, useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { api, type Resultado } from "@/lib/api";
import { CARGOS, type CargoId } from "@/lib/cargos";
import { ENFOQUES } from "@/lib/analisis";
import { pisoTecho, type Fila, type Medida } from "@/lib/pisoTecho";
import { colorPartido } from "@/lib/partidos";
import { useEnfoque } from "@/components/Enfoque";
import { fmt, pct } from "@/lib/format";

type Terr = { estado: number; municipio: number; distrito: number; seccion: number };

/** Piso y techo de cada partido en las últimas 10 elecciones del cargo en el territorio elegido; con enfoque, también en todos los cargos. */
export function PisoTecho({ serie, cargoId, cargoNombre, lugar, terr, local }: {
  serie: Resultado[]; cargoId: CargoId; cargoNombre: string; lugar: string; terr: Terr; local: boolean;
}) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const [medida, setMedida] = useState<Medida>("candidatura");
  const [N, setN] = useState(10);
  const [todos, setTodos] = useState(false);
  const ord = useMemo(() => serie.filter((x) => !x.extraordinaria), [serie]);
  const { filas, anios } = useMemo(() => pisoTecho(ord, medida, N), [ord, medida, N]);
  const vista = useMemo(() => {
    const f = enfoque === "general" ? filas : [...filas.filter((x) => x.partido === enfoque), ...filas.filter((x) => x.partido !== enfoque)];
    return todos ? f : f.slice(0, 8);
  }, [filas, enfoque, todos]);
  const escala = Math.max(10, ...filas.map((f) => f.max.pct));
  const nacionalLocal = local && !terr.estado;

  // Enfoque: el mismo partido en todos los cargos del territorio (sin distrito: cada cargo tiene su propio mapa distrital)
  const [cruce, setCruce] = useState<{ cargo: string; nombre: string; fila: Fila | null; anios: number[] }[] | null>(null);
  useEffect(() => {
    if (enfoque === "general" || terr.distrito) { setCruce(null); return; }
    setCruce(null);
    const qs = `estado=${terr.estado}&municipio=${terr.municipio}&seccion=${terr.seccion}`;
    const cargos = CARGOS.filter((c) => terr.estado || c.ambito === "federal");
    Promise.all(cargos.map((c) => api<{ elecciones: Resultado[] }>(`/api/presidencial?eleccion=${c.id}&${qs}`).then((d) => {
      const r = pisoTecho(d.elecciones.filter((x) => !x.extraordinaria), medida, N, 0);
      return { cargo: c.id, nombre: c.nombre, fila: r.filas.find((x) => x.partido === enfoque) ?? null, anios: r.anios };
    }).catch(() => ({ cargo: c.id, nombre: c.nombre, fila: null, anios: [] })))).then(setCruce);
  }, [enfoque, terr.estado, terr.municipio, terr.distrito, terr.seccion, medida, N]);

  if (!filas.length) return null;
  return (
    <section className="material p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">{lugar} · {cargoNombre} · últimas {anios.length} elecciones ({anios[0]}–{anios.at(-1)})</p>
          <h2 className="text-xl font-bold pt-1">Piso y techo histórico por partido</h2></div>
        <div className="flex flex-wrap gap-2">
        <div className="seg" role="group" aria-label="Elecciones consideradas">
          <button aria-pressed={N === 5} onClick={() => setN(5)}>Últimas 5</button>
          <button aria-pressed={N === 10} onClick={() => setN(10)}>Últimas 10</button>
        </div>
        <div className="seg" role="group" aria-label="Medida">
          <button aria-pressed={medida === "candidatura"} onClick={() => setMedida("candidatura")} title="Votos de la candidatura en que participa (sola o en coalición)">Con aliados</button>
          <button aria-pressed={medida === "propios"} onClick={() => setMedida("propios")} title="Solo los votos marcados al partido en la boleta">Votos propios</button>
        </div>
        </div>
      </div>
      {nacionalLocal && <p className="text-sm" style={{ color: "var(--warn)" }}>Cargo local sin entidad: cada año suma estados distintos, así que el piso y el techo no son comparables. Elige una entidad.</p>}

      <div className="overflow-auto">
        <table className="t">
          <thead><tr><th>Partido</th><th>Elecciones</th><th className="min-w-[220px]">Rango (% de votos) · ● última</th><th><TrendingDown size={13} className="inline -mt-0.5" /> Piso</th><th><TrendingUp size={13} className="inline -mt-0.5" /> Techo</th><th>Última</th><th>Promedio</th><th title="% de la lista nominal (piso y techo) aplicado a la lista nominal más reciente">Votos aspirables hoy</th></tr></thead>
          <tbody>{vista.map((f) => {
            const c = colorPartido(f.partido), foco = f.partido === enfoque;
            return (
              <tr key={f.partido} style={foco ? { background: `color-mix(in srgb, ${enf.color} 8%, transparent)` } : undefined}>
                <td className="font-bold" style={{ color: c }}>{f.partido.toUpperCase()}</td>
                <td className="num">{f.n}</td>
                <td>
                  <div className="relative h-4 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }} aria-label={`De ${f.min.pct.toFixed(1)}% a ${f.max.pct.toFixed(1)}%; última ${f.ultimo.pct.toFixed(1)}%`}>
                    <div className="absolute top-0 bottom-0 rounded-full" style={{ left: `${(100 * f.min.pct) / escala}%`, width: `${Math.max(1, (100 * (f.max.pct - f.min.pct)) / escala)}%`, background: c, opacity: 0.35 }} />
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: `${(100 * f.prom_pct) / escala}%`, background: "var(--fg-mute)" }} title={`Promedio ${f.prom_pct.toFixed(1)}%`} />
                    <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${(100 * f.ultimo.pct) / escala}%`, background: c, borderColor: "var(--card-solid)" }} title={`Última (${f.ultimo.anio}): ${f.ultimo.pct.toFixed(1)}%`} />
                  </div>
                </td>
                <td className="num whitespace-nowrap"><b>{pct(f.min.pct)}</b> <span className="text-xs" style={{ color: "var(--fg-mute)" }}>{fmt(f.min.votos)} · {f.min.anio}</span></td>
                <td className="num whitespace-nowrap"><b>{pct(f.max.pct)}</b> <span className="text-xs" style={{ color: "var(--fg-mute)" }}>{fmt(f.max.votos)} · {f.max.anio}</span></td>
                <td className="num whitespace-nowrap">{pct(f.ultimo.pct)} <span className="text-xs" style={{ color: "var(--fg-mute)" }}>{f.ultimo.anio}</span></td>
                <td className="num">{pct(f.prom_pct)}</td>
                <td className="num whitespace-nowrap">{f.aspirable_min !== null && f.aspirable_max !== null ? <>{fmt(f.aspirable_min)} – <b>{fmt(f.aspirable_max)}</b></> : "—"}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      {filas.length > 8 && <button className="chip" onClick={() => setTodos(!todos)}>{todos ? "Ver menos" : `Ver los ${filas.length} partidos`}</button>}

      {cruce && (
        <div className="space-y-2 pt-1">
          <p className="label">Piso y techo de <span style={{ color: enf.color }}>{enf.t}</span> en cada cargo · {lugar}</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {cruce.map((x) => (
              <div key={x.cargo} className="rounded-2xl p-3.5 space-y-1" style={{ background: x.cargo === cargoId ? `color-mix(in srgb, ${enf.color} 10%, transparent)` : "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
                <p className="text-sm font-bold">{x.nombre}</p>
                {x.fila ? <>
                  <p className="text-sm"><span style={{ color: "var(--fg-mute)" }}>piso</span> <b>{pct(x.fila.min.pct)}</b> <span className="text-xs" style={{ color: "var(--fg-mute)" }}>({x.fila.min.anio})</span>
                    <span style={{ color: "var(--fg-mute)" }}> · techo</span> <b>{pct(x.fila.max.pct)}</b> <span className="text-xs" style={{ color: "var(--fg-mute)" }}>({x.fila.max.anio})</span></p>
                  <p className="text-xs" style={{ color: "var(--fg-mute)" }}>última {pct(x.fila.ultimo.pct)} ({x.fila.ultimo.anio}) · {x.fila.n} de {x.anios.length} elecciones
                    {x.fila.aspirable_min !== null && x.fila.aspirable_max !== null && <> · aspirable hoy {fmt(x.fila.aspirable_min)}–{fmt(x.fila.aspirable_max)} votos</>}</p>
                </> : <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Sin candidatura de {enf.t} en las elecciones con datos.</p>}
              </div>
            ))}
          </div>
          {!terr.estado && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>En la vista nacional solo se muestran los cargos federales (los locales suman estados distintos cada año).</p>}
        </div>
      )}
      {enfoque !== "general" && terr.distrito > 0 && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Con un distrito elegido no se cruzan cargos: cada cargo tiene su propio mapa distrital.</p>}

      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
        Piso y techo = el menor y el mayor % de los votos a candidaturas que obtuvo el partido en las últimas {N} elecciones ordinarias (o las que haya) de este cargo en este territorio (solo donde apareció en la boleta; si no compitió, no cuenta como 0).
        «Con aliados» usa los votos de la candidatura en que participó (sola o la coalición que lo incluye, inferida de la boleta; en coalición, sus socios comparten el mismo número). «Votos propios» solo cuenta su recuadro.
        «Votos aspirables hoy» aplica el menor y el mayor % de la lista nominal que logró a la lista nominal de la elección más reciente ({fmt(filas[0]?.ln_ref ?? null)}): es una referencia de alcance, no un pronóstico.
        La barra muestra el rango (piso a techo), la línea el promedio y el punto la última elección. Para secciones y distritos, la geografía puede haber cambiado (reseccionamiento, redistritación: en distritos federales solo se usa el mapa vigente).
      </p>
    </section>
  );
}
