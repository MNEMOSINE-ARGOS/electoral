"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, TrendingDown, TrendingUp } from "lucide-react";
import { api, type Resultado } from "@/lib/api";
import { CARGOS, type CargoId } from "@/lib/cargos";
import { ENFOQUES } from "@/lib/analisis";
import { desdeAnio, pisoTecho, type Fila } from "@/lib/pisoTecho";
import { colorPartido } from "@/lib/partidos";
import { useEnfoque } from "@/components/Enfoque";
import { Ayuda } from "@/components/Ayuda";
import { fmt, pct } from "@/lib/format";

type Terr = { estado: number; municipio: number; distrito: number; seccion: number };
const nombreFila = (f: Fila) => f.componentes.map((t) => t.toUpperCase()).join(" · ");
const mute = { color: "var(--fg-mute)" };

/** Piso y techo de cada partido (solo sus votos) y de cada coalición (fila aparte) en las elecciones de los últimos 10 años
 *  (o 20, o todo) del cargo en el territorio elegido; con enfoque, también el partido en todos los cargos. */
export function PisoTecho({ serie, cargoId, cargoNombre, lugar, terr, local }: {
  serie: Resultado[]; cargoId: CargoId; cargoNombre: string; lugar: string; terr: Terr; local: boolean;
}) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const [N, setN] = useState(10); // años hacia atrás desde hoy; 0 = todo el histórico
  const [verCoal, setVerCoal] = useState(true);
  const [todos, setTodos] = useState(false);
  const ord = useMemo(() => serie.filter((x) => !x.extraordinaria), [serie]);
  const { filas, coaliciones, anios } = useMemo(() => pisoTecho(ord, N), [ord, N]);
  const vista = useMemo(() => {
    const f = enfoque === "general" ? filas : [...filas.filter((x) => x.clave === enfoque), ...filas.filter((x) => x.clave !== enfoque)];
    return todos ? f : f.slice(0, 8);
  }, [filas, enfoque, todos]);
  const coalVista = useMemo(() => (enfoque === "general" ? coaliciones : [...coaliciones.filter((c) => c.componentes.includes(enfoque)), ...coaliciones.filter((c) => !c.componentes.includes(enfoque))]), [coaliciones, enfoque]);
  const escala = Math.max(10, ...filas.map((f) => f.max.pct), ...(verCoal ? coaliciones.map((f) => f.max.pct) : []));
  const nacionalLocal = local && !terr.estado;

  // Enfoque: el mismo partido (sus votos propios) en todos los cargos del territorio (sin distrito: cada cargo tiene su propio mapa)
  const [cruce, setCruce] = useState<{ cargo: string; nombre: string; fila: Fila | null; anios: number[] }[] | null>(null);
  useEffect(() => {
    if (enfoque === "general" || terr.distrito) { setCruce(null); return; }
    setCruce(null);
    const qs = `estado=${terr.estado}&municipio=${terr.municipio}&seccion=${terr.seccion}`;
    const cargos = CARGOS.filter((c) => terr.estado || c.ambito === "federal");
    Promise.all(cargos.map((c) => api<{ elecciones: Resultado[] }>(`/api/presidencial?eleccion=${c.id}&${qs}`).then((d) => {
      const r = pisoTecho(d.elecciones.filter((x) => !x.extraordinaria), N, 0);
      return { cargo: c.id, nombre: c.nombre, fila: r.filas.find((x) => x.clave === enfoque) ?? null, anios: r.anios };
    }).catch(() => ({ cargo: c.id, nombre: c.nombre, fila: null, anios: [] })))).then(setCruce);
  }, [enfoque, terr.estado, terr.municipio, terr.distrito, terr.seccion, N]);

  if (!filas.length && !coaliciones.length) return (
    <section className="material p-5 space-y-2">
      <p className="label">{lugar} · {cargoNombre}</p>
      <p className="text-sm" style={mute}>No hay elecciones de este cargo en este territorio {N ? `en los últimos ${N} años (desde ${desdeAnio(N)})` : ""}.{N ? " " : ""}{N ? <button className="chip" onClick={() => setN(N === 10 ? 20 : 0)}>Ampliar a {N === 10 ? "20 años" : "todo el histórico"}</button> : null}</p>
    </section>);

  const fila = (f: Fila) => {
    const coal = f.tipo === "coalicion";
    const c = colorPartido(coal ? f.componentes.find((t) => t === enfoque) ?? f.componentes[0] : f.clave);
    const foco = coal ? f.componentes.includes(enfoque) : f.clave === enfoque;
    const nom = coal ? nombreFila(f) : f.clave.toUpperCase();
    return (
      <tr key={`${f.tipo}-${f.clave}`} style={foco ? { background: `color-mix(in srgb, ${enf.color} 8%, transparent)` } : undefined}>
        <td className="font-bold" style={{ color: c }}>
          {coal && <Link2 size={13} className="inline -mt-0.5 mr-1" style={mute} />}{nom}
          {!coal && f.coalicion_anios.length > 0 && <span className="block text-[11px] font-semibold" style={mute} title="Esos años también fue en coalición: aquí solo cuentan sus votos propios">en coalición: {f.coalicion_anios.join(", ")}</span>}
        </td>
        <td className="num">{f.n}</td>
        <td>
          <div className="relative h-4 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }} aria-label={`De ${f.min.pct.toFixed(1)}% a ${f.max.pct.toFixed(1)}%; última ${f.ultimo.pct.toFixed(1)}%`}>
            <div className="absolute top-0 bottom-0 rounded-full" style={{ left: `${(100 * f.min.pct) / escala}%`, width: `${Math.max(1, (100 * (f.max.pct - f.min.pct)) / escala)}%`, background: c, opacity: 0.35 }} />
            <div className="absolute top-0 bottom-0 w-px" style={{ left: `${(100 * f.prom_pct) / escala}%`, background: "var(--fg-mute)" }} title={`Promedio ${f.prom_pct.toFixed(1)}%`} />
            <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${(100 * f.ultimo.pct) / escala}%`, background: c, borderColor: "var(--card-solid)" }} title={`Última (${f.ultimo.anio}): ${f.ultimo.pct.toFixed(1)}%`} />
          </div>
        </td>
        <td className="num whitespace-nowrap"><b>{pct(f.min.pct)}</b> <span className="text-xs" style={mute}>{fmt(f.min.votos)} · {f.min.anio}</span></td>
        <td className="num whitespace-nowrap"><b>{pct(f.max.pct)}</b> <span className="text-xs" style={mute}>{fmt(f.max.votos)} · {f.max.anio}</span></td>
        <td className="num whitespace-nowrap">{pct(f.ultimo.pct)} <span className="text-xs" style={mute}>{f.ultimo.anio}</span></td>
        <td className="num">{pct(f.prom_pct)}</td>
        <td className="num whitespace-nowrap">{f.aspirable_min !== null && f.aspirable_max !== null && f.min_ln !== null && f.max_ln !== null ? <>
          <span className="text-xs" style={mute}>de </span>{fmt(f.aspirable_min)}<span className="text-xs" style={mute}> a </span><b>{fmt(f.aspirable_max)}</b>
          <Ayuda titulo={`Votos posibles hoy · ${nom}`}>
            <p>En su <b>peor</b> elección del periodo ({f.min_ln_anio}) votó por {coal ? "esta coalición" : nom} el <b>{f.min_ln.toFixed(1)}%</b> de toda la lista nominal; en la <b>mejor</b> ({f.max_ln_anio}), el <b>{f.max_ln.toFixed(1)}%</b>.</p>
            <p className="pt-1.5">Con la lista nominal más reciente ({fmt(f.ln_ref)} personas, {f.ln_ref_anio}):</p>
            <p className="pt-1 num">{f.min_ln.toFixed(1)}% × {fmt(f.ln_ref)} = <b>{fmt(f.aspirable_min)}</b> votos<br />{f.max_ln.toFixed(1)}% × {fmt(f.ln_ref)} = <b>{fmt(f.aspirable_max)}</b> votos</p>
            <p className="pt-1.5" style={mute}>{coal ? "Votos de toda la coalición, solo en las elecciones en que compitió esta misma combinación." : "Solo los votos de su propio recuadro."} Se usa el % de toda la lista (no de los votos emitidos) porque así cuenta también cuánta gente salió a votar. Es una referencia, no un pronóstico.</p>
          </Ayuda></> : "—"}</td>
      </tr>);
  };
  const encabezado = (primera: string) => (
    <thead><tr><th>{primera}</th><th>Elecciones</th><th className="min-w-[220px]">Rango (% de votos) · ● última<Ayuda clave="rango" /></th><th><TrendingDown size={13} className="inline -mt-0.5" /> Piso<Ayuda clave="piso" /></th><th><TrendingUp size={13} className="inline -mt-0.5" /> Techo<Ayuda clave="techo" /></th><th>Última<Ayuda clave="ultima" /></th><th>Promedio<Ayuda clave="promedio" /></th><th>Votos posibles hoy<Ayuda clave="votos_aspirables" /></th></tr></thead>);

  return (
    <section className="material p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">{lugar} · {cargoNombre} · {N ? `últimos ${N} años (desde ${desdeAnio(N)})` : "todo el histórico"} · {anios.length} {anios.length === 1 ? "elección" : "elecciones"}: {anios.join(", ")}</p>
          <h2 className="text-xl font-bold pt-1">Piso y techo histórico</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Periodo">
            <button aria-pressed={N === 10} onClick={() => setN(10)}>Últimos 10 años</button>
            <button aria-pressed={N === 20} onClick={() => setN(20)}>20 años</button>
            <button aria-pressed={N === 0} onClick={() => setN(0)}>Todo</button>
          </div>
          {coaliciones.length > 0 && <button className="chip" aria-pressed={verCoal} onClick={() => setVerCoal(!verCoal)}><Link2 size={13} />Coaliciones ({coaliciones.length})</button>}
        </div>
      </div>
      {anios.length < 3 && N > 0 && <p className="text-sm" style={{ color: "var(--warn)" }}>Solo {anios.length === 1 ? "hay una elección" : `hay ${anios.length} elecciones`} de este cargo en los últimos {N} años: el piso y el techo salen de muy pocos datos. <button className="chip ml-1" onClick={() => setN(N === 10 ? 20 : 0)}>Ampliar a {N === 10 ? "20 años" : "todo el histórico"}</button></p>}
      {nacionalLocal && <p className="text-sm" style={{ color: "var(--warn)" }}>Cargo local sin entidad: cada año suma estados distintos, así que el piso y el techo no son comparables. Elige una entidad.</p>}

      {filas.length > 0 && <>
        <p className="label">Por partido · solo sus votos<Ayuda clave="votos_propios" /></p>
        <div className="overflow-auto"><table className="t">{encabezado("Partido")}<tbody>{vista.map(fila)}</tbody></table></div>
        {filas.length > 8 && <button className="chip" onClick={() => setTodos(!todos)}>{todos ? "Ver menos" : `Ver los ${filas.length} partidos`}</button>}
      </>}

      {verCoal && coaliciones.length > 0 && <>
        <p className="label pt-1">Coaliciones · votos de toda la alianza<Ayuda clave="con_aliados" /></p>
        <div className="overflow-auto"><table className="t">{encabezado("Coalición")}<tbody>{coalVista.map(fila)}</tbody></table></div>
      </>}

      {cruce && (
        <div className="space-y-2 pt-1">
          <p className="label">Piso y techo de <span style={{ color: enf.color }}>{enf.t}</span> (solo sus votos) en cada cargo · {lugar}</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {cruce.map((x) => (
              <div key={x.cargo} className="rounded-2xl p-3.5 space-y-1" style={{ background: x.cargo === cargoId ? `color-mix(in srgb, ${enf.color} 10%, transparent)` : "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
                <p className="text-sm font-bold">{x.nombre}</p>
                {x.fila ? <>
                  <p className="text-sm"><span style={mute}>piso</span> <b>{pct(x.fila.min.pct)}</b> <span className="text-xs" style={mute}>({x.fila.min.anio})</span>
                    <span style={mute}> · techo</span> <b>{pct(x.fila.max.pct)}</b> <span className="text-xs" style={mute}>({x.fila.max.anio})</span></p>
                  <p className="text-xs" style={mute}>última {pct(x.fila.ultimo.pct)} ({x.fila.ultimo.anio}) · {x.fila.n} de {x.anios.length} elecciones
                    {x.fila.aspirable_min !== null && x.fila.aspirable_max !== null && <> · posibles hoy {fmt(x.fila.aspirable_min)} a {fmt(x.fila.aspirable_max)} votos<Ayuda clave="votos_aspirables" /></>}
                    {x.fila.coalicion_anios.length > 0 && <> · en coalición: {x.fila.coalicion_anios.join(", ")}</>}</p>
                </> : <p className="text-xs" style={mute}>Sin votos propios de {enf.t} en las elecciones con datos.</p>}
              </div>
            ))}
          </div>
          {!terr.estado && <p className="text-xs" style={mute}>En la vista nacional solo se muestran los cargos federales (los locales suman estados distintos cada año).</p>}
        </div>
      )}
      {enfoque !== "general" && terr.distrito > 0 && <p className="text-xs" style={mute}>Con un distrito elegido no se cruzan cargos: cada cargo tiene su propio mapa distrital.</p>}

      <p className="text-xs" style={mute}>
        Piso y techo = el menor y el mayor % de los votos a candidaturas en las elecciones ordinarias {N ? `de los últimos ${N} años (de ${desdeAnio(N)} a hoy)` : "de todo el histórico"} de este cargo en este territorio.
        <b> Partidos</b>: solo los votos de su propio recuadro; nunca se les suman los de su coalición (si fueron en coalición, se indica el año, porque sus votos propios no muestran todo su peso).
        <b> Coaliciones</b>: los votos de toda la alianza (sus partidos y las combinaciones marcadas en la boleta), solo en las elecciones en que compitió esa misma combinación.
        Si no compitió en una elección, no cuenta como 0. «Votos posibles hoy»: el menor y el mayor % de toda la lista nominal, multiplicados por la lista nominal más reciente ({fmt(filas[0]?.ln_ref ?? coaliciones[0]?.ln_ref ?? null)}); el «?» de cada fila muestra la cuenta. Es una referencia, no un pronóstico.
        Para secciones y distritos, la geografía puede haber cambiado (reseccionamiento, redistritación).
      </p>
    </section>
  );
}
