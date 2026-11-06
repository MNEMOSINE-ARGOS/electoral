"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, TrendingDown, TrendingUp } from "lucide-react";
import { api, type Resultado } from "@/lib/api";
import { CARGOS, type CargoId } from "@/lib/cargos";
import { ENFOQUES } from "@/lib/analisis";
import { pisoTecho, type Fila, type ResultadoPisoTecho } from "@/lib/pisoTecho";
import { colorPartido } from "@/lib/partidos";
import { useEnfoque } from "@/components/Enfoque";
import { Ayuda } from "@/components/Ayuda";
import { Plegable } from "@/components/Plegable";
import { fmt, pct } from "@/lib/format";

type Terr = { estado: number; municipio: number; distrito: number; seccion: number };
const nombreFila = (f: Fila) => f.componentes.map((t) => t.toUpperCase()).join(" · ");
const mute = { color: "var(--fg-mute)" };
const periodoTxt = (N: number, r: Pick<ResultadoPisoTecho, "desde" | "hasta">) => (N && r.hasta !== null ? `${N} años hasta la última elección (${r.desde}-${r.hasta})` : "todo el histórico");
const pctLn = (v: number | null) => (v === null ? "" : `${v.toFixed(1)}% LN`);

/** Piso y techo de cada partido (solo sus votos) y de cada coalición (fila aparte) en las elecciones de los últimos 10 años
 *  (o 20, o todo) del cargo en el territorio elegido; con enfoque, también el partido en todos los cargos. */
export function PisoTecho({ serie, cargoId, cargoNombre, lugar, terr, local }: {
  serie: Resultado[]; cargoId: CargoId; cargoNombre: string; lugar: string; terr: Terr; local: boolean;
}) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const [N, setN] = useState(10); // años hacia atrás desde la última elección con datos; 0 = todo el histórico
  const [verCoal, setVerCoal] = useState(false); // ocultas por defecto: ocupan mucho espacio
  const [todos, setTodos] = useState(false);
  const ord = useMemo(() => serie.filter((x) => !x.extraordinaria), [serie]);
  const res = useMemo(() => pisoTecho(ord, N), [ord, N]);
  const { filas, coaliciones, anios, participacion, votantes, ln_ref, ln_ref_anio } = res;
  const vista = useMemo(() => {
    const f = enfoque === "general" ? filas : [...filas.filter((x) => x.clave === enfoque), ...filas.filter((x) => x.clave !== enfoque)];
    return todos ? f : f.slice(0, 8);
  }, [filas, enfoque, todos]);
  const coalVista = useMemo(() => (enfoque === "general" ? coaliciones : [...coaliciones.filter((c) => c.componentes.includes(enfoque)), ...coaliciones.filter((c) => !c.componentes.includes(enfoque))]), [coaliciones, enfoque]);
  const escala = Math.max(1, ...filas.map((f) => f.max.votos), ...(verCoal ? coaliciones.map((f) => f.max.votos) : []));
  const nacionalLocal = local && !terr.estado;

  // Enfoque: el mismo partido (sus votos propios) en todos los cargos del territorio (sin distrito: cada cargo tiene su propio mapa)
  const [cruce, setCruce] = useState<{ cargo: string; nombre: string; fila: Fila | null; anios: number[]; periodo: string }[] | null>(null);
  useEffect(() => {
    if (enfoque === "general" || terr.distrito) { setCruce(null); return; }
    setCruce(null);
    const qs = `estado=${terr.estado}&municipio=${terr.municipio}&seccion=${terr.seccion}`;
    const cargos = CARGOS.filter((c) => terr.estado || c.ambito === "federal");
    Promise.all(cargos.map((c) => api<{ elecciones: Resultado[] }>(`/api/presidencial?eleccion=${c.id}&${qs}`).then((d) => {
      const r = pisoTecho(d.elecciones.filter((x) => !x.extraordinaria), N, 0);
      return { cargo: c.id, nombre: c.nombre, fila: r.filas.find((x) => x.clave === enfoque) ?? null, anios: r.anios, periodo: periodoTxt(N, r) };
    }).catch(() => ({ cargo: c.id, nombre: c.nombre, fila: null, anios: [], periodo: "" })))).then(setCruce);
  }, [enfoque, terr.estado, terr.municipio, terr.distrito, terr.seccion, N]);

  if (!filas.length && !coaliciones.length) return (
    <section className="material p-5 space-y-2">
      <p className="label">{lugar} · {cargoNombre}</p>
      <p className="text-sm" style={mute}>No hay votos por partido de este cargo en este territorio.</p>
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
          <div className="relative h-4 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }} aria-label={`De ${fmt(f.min.votos)} a ${fmt(f.max.votos)} votos; última ${fmt(f.ultimo.votos)}`}>
            <div className="absolute top-0 bottom-0 rounded-full" style={{ left: `${(100 * f.min.votos) / escala}%`, width: `${Math.max(1, (100 * (f.max.votos - f.min.votos)) / escala)}%`, background: c, opacity: 0.35 }} />
            <div className="absolute top-0 bottom-0 w-px" style={{ left: `${(100 * f.prom_votos) / escala}%`, background: "var(--fg-mute)" }} title={`Promedio ${fmt(Math.round(f.prom_votos))} votos`} />
            <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${(100 * f.ultimo.votos) / escala}%`, background: c, borderColor: "var(--card-solid)" }} title={`Última (${f.ultimo.anio}): ${fmt(f.ultimo.votos)} votos`} />
          </div>
        </td>
        <td className="num whitespace-nowrap" title={`${pct(f.min.pct_vot ?? f.min.pct)} de los votantes · ${pctLn(f.min.pct_ln)}`}><b>{fmt(f.min.votos)}</b> <span className="text-xs" style={mute}>{f.min.anio}</span></td>
        <td className="num whitespace-nowrap" title={`${pct(f.max.pct_vot ?? f.max.pct)} de los votantes · ${pctLn(f.max.pct_ln)}`}><b>{fmt(f.max.votos)}</b> <span className="text-xs" style={mute}>{f.max.anio}</span></td>
        <td className="num whitespace-nowrap" title={`${pct(f.ultimo.pct_vot ?? f.ultimo.pct)} de los votantes · ${pctLn(f.ultimo.pct_ln)}`}>{fmt(f.ultimo.votos)} <span className="text-xs" style={mute}>{f.ultimo.anio}</span></td>
        <td className="num whitespace-nowrap" title={f.cuota_ln ? `${f.cuota_ln.min.toFixed(1)}% a ${f.cuota_ln.max.toFixed(1)}% de la lista nominal` : undefined}>{f.cuota ? <>{pct(f.cuota.min)}<span className="text-xs" style={mute}> – </span>{pct(f.cuota.max)}</> : "—"}</td>
        <td className="num whitespace-nowrap">{f.posibles && participacion && votantes ? <>
          {fmt(f.posibles.bajo)}<span className="text-xs" style={mute}> – </span><b>{fmt(f.posibles.alto)}</b>
          <Ayuda titulo={`Votos posibles · ${nom}`}>
            <p><b>1) Votantes esperados.</b> Lista nominal más reciente ({fmt(ln_ref)} personas, {ln_ref_anio}) × participación histórica de este cargo aquí ({participacion.min.toFixed(1)}% en {participacion.min_anio}, media {participacion.prom.toFixed(1)}%, {participacion.max.toFixed(1)}% en {participacion.max_anio}) = de <b>{fmt(Math.round(votantes.min))}</b> a <b>{fmt(Math.round(votantes.max))}</b> votantes (media {fmt(Math.round(votantes.prom))}).</p>
            <p className="pt-1.5"><b>2) Su parte de los votantes.</b> {coal ? "Esta coalición" : nom} obtuvo entre el {f.posibles.cuota.min.toFixed(1)}% y el {f.posibles.cuota.max.toFixed(1)}% de los votos emitidos (media {f.posibles.cuota.prom.toFixed(1)}%).</p>
            <p className="pt-1 num">bajo: {f.posibles.cuota.min.toFixed(1)}% × {fmt(Math.round(votantes.min))} = <b>{fmt(f.posibles.bajo)}</b><br />central: {f.posibles.cuota.prom.toFixed(1)}% × {fmt(Math.round(votantes.prom))} = <b>{fmt(f.posibles.central)}</b><br />alto: {f.posibles.cuota.max.toFixed(1)}% × {fmt(Math.round(votantes.max))} = <b>{fmt(f.posibles.alto)}</b></p>
            <p className="pt-1.5" style={mute}>{coal ? "Votos de toda la coalición, solo en las elecciones en que compitió esta misma combinación." : "Solo los votos de su propio recuadro."} El escenario bajo junta su peor % con la menor participación; el alto, su mejor % con la mayor. Es una referencia, no un pronóstico.</p>
          </Ayuda></> : "—"}</td>
      </tr>);
  };
  const encabezado = (primera: string) => (
    <thead><tr><th>{primera}</th><th>Elecciones</th><th className="min-w-[200px]">Rango (votos) · ● última<Ayuda clave="rango" /></th><th><TrendingDown size={13} className="inline -mt-0.5" /> Piso (votos)<Ayuda clave="piso" /></th><th><TrendingUp size={13} className="inline -mt-0.5" /> Techo (votos)<Ayuda clave="techo" /></th><th>Última<Ayuda clave="ultima" /></th><th>% de votantes<Ayuda clave="promedio" /></th><th>Votos posibles hoy<Ayuda clave="votos_aspirables" /></th></tr></thead>);

  return (
    <section className="material p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">{lugar} · {cargoNombre} · {periodoTxt(N, res)} · {anios.length} {anios.length === 1 ? "elección" : "elecciones"}: {anios.join(", ")}</p>
          <h2 className="text-xl font-bold pt-1">Piso y techo histórico</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Periodo">
            <button aria-pressed={N === 10} onClick={() => setN(10)}>10 años</button>
            <button aria-pressed={N === 20} onClick={() => setN(20)}>20 años</button>
            <button aria-pressed={N === 0} onClick={() => setN(0)}>Todo</button>
          </div>
          {coaliciones.length > 0 && <button className="chip" aria-pressed={verCoal} onClick={() => setVerCoal(!verCoal)}><Link2 size={13} />Coaliciones ({coaliciones.length})</button>}
        </div>
      </div>
      {anios.length < 3 && N > 0 && <p className="text-sm" style={{ color: "var(--warn)" }}>Solo {anios.length === 1 ? "hay una elección" : `hay ${anios.length} elecciones`} de este cargo en el periodo ({res.desde}-{res.hasta}): el piso y el techo salen de muy pocos datos. <button className="chip ml-1" onClick={() => setN(N === 10 ? 20 : 0)}>Ampliar a {N === 10 ? "20 años" : "todo el histórico"}</button></p>}
      {nacionalLocal && <p className="text-sm" style={{ color: "var(--warn)" }}>Cargo local sin entidad: cada año suma estados distintos, así que el piso y el techo no son comparables. Elige una entidad.</p>}

      <Respuesta res={res} enfoque={enfoque} verCoal={verCoal} />

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
                  <p className="text-sm"><span style={mute}>piso</span> <b>{fmt(x.fila.min.votos)}</b> <span className="text-xs" style={mute}>({x.fila.min.anio})</span>
                    <span style={mute}> · techo</span> <b>{fmt(x.fila.max.votos)}</b> <span className="text-xs" style={mute}>({x.fila.max.anio})</span></p>
                  <p className="text-xs" style={mute}>{x.periodo} · última {fmt(x.fila.ultimo.votos)} ({x.fila.ultimo.anio}) · {x.fila.n} de {x.anios.length} elecciones
                    {x.fila.cuota && <> · {pct(x.fila.cuota.min)} a {pct(x.fila.cuota.max)} de los votantes</>}
                    {x.fila.posibles && <> · posibles hoy {fmt(x.fila.posibles.bajo)} a {fmt(x.fila.posibles.alto)} votos<Ayuda clave="votos_aspirables" /></>}
                    {x.fila.coalicion_anios.length > 0 && <> · en coalición: {x.fila.coalicion_anios.join(", ")}</>}</p>
                </> : <p className="text-xs" style={mute}>Sin votos propios de {enf.t} en las elecciones con datos.</p>}
              </div>
            ))}
          </div>
          {!terr.estado && <p className="text-xs" style={mute}>En la vista nacional solo se muestran los cargos federales (los locales suman estados distintos cada año).</p>}
        </div>
      )}
      {enfoque !== "general" && terr.distrito > 0 && <p className="text-xs" style={mute}>Con un distrito elegido no se cruzan cargos: cada cargo tiene su propio mapa distrital.</p>}

      <Plegable className="pt-3 border-t border-[var(--line)]" resumen={<>Método y límites · {N ? `${res.desde}-${res.hasta}` : "todo el histórico"} · referencia, no pronóstico</>}>
        <ul className="nota-metodo">
          <li><b>Piso y techo</b>: el menor y el mayor número de votos en las elecciones ordinarias {N ? `de los ${N} años que terminan en la última elección con datos de este cargo aquí` : "de todo el histórico"}. Si no compitió en una elección, no cuenta como 0.</li>
          <li><b>Para comparar</b> partidos y territorios, usa el % de los votantes (votos emitidos); pasa el cursor sobre una cifra para ver también el % de la lista nominal.</li>
          <li><b>Partidos</b>: solo los votos de su propio recuadro, nunca los de su coalición (si fueron en coalición, se indica el año).</li>
          <li><b>Coaliciones</b>: los votos de toda la alianza, solo en las elecciones en que compitió esa misma combinación.</li>
          <li><b>Votos posibles hoy</b>: lista nominal más reciente ({fmt(ln_ref)}) × participación histórica × su % de los votantes; el «?» de cada fila muestra la cuenta.</li>
          <li>En secciones y distritos la geografía puede haber cambiado (reseccionamiento, redistritación).{ord.some((x) => x.reconstruida) && <> En este distrito, las elecciones de {ord.filter((x) => x.reconstruida).map((x) => x.anio).join(", ")} son <b>reconstruidas</b> con la geografía vigente: pueden faltar votos de secciones que ya no existen, así que el piso de esos años puede quedar algo bajo.</>}</li>
        </ul>
      </Plegable>
    </section>
  );
}

/** Respuesta directa: considerando piso, techo y participación histórica, ¿cuántos votos son posibles?
 *  Cifras grandes a la vista; la explicación en texto, plegada. */
function Respuesta({ res, enfoque, verCoal }: { res: ResultadoPisoTecho; enfoque: string; verCoal: boolean }) {
  const { participacion: p, votantes: v, ln_ref } = res;
  if (!p || !v || !ln_ref) return null;
  const f = res.filas.find((x) => x.clave === enfoque) ?? (enfoque === "general" ? res.filas[0] : undefined);
  const clave = f?.clave ?? enfoque;
  const coals = verCoal ? res.coaliciones.filter((c) => c.componentes.includes(clave) && c.posibles).slice(0, 2) : [];
  const rangoTxt = (a: number, b: number) => <>{fmt(a)}<span className="cifra-sep">–</span>{fmt(b)}</>;
  return (
    <div className="space-y-2">
      <div className="cifras">
        <div className="cifra">
          <p className="label">Votantes esperados<Ayuda clave="votos_aspirables" /></p>
          <p className="cifra-valor">{rangoTxt(Math.round(v.min), Math.round(v.max))}</p>
          <p className="cifra-nota">participación {p.min.toFixed(0)}–{p.max.toFixed(0)}%</p>
        </div>
        {f?.posibles && (
          <div className="cifra" style={{ ["--c" as string]: colorPartido(f.clave) }}>
            <p className="label"><span style={{ color: colorPartido(f.clave) }}>{f.clave.toUpperCase()}</span> · votos posibles</p>
            <p className="cifra-valor">{rangoTxt(f.posibles.bajo, f.posibles.alto)}</p>
            <p className="cifra-nota">central {fmt(f.posibles.central)} · solo votos propios</p>
          </div>)}
        {coals.map((c) => (
          <div key={c.clave} className="cifra">
            <p className="label"><Link2 size={12} className="inline -mt-0.5 mr-1" />{nombreFila(c)}</p>
            <p className="cifra-valor">{rangoTxt(c.posibles!.bajo, c.posibles!.alto)}</p>
            <p className="cifra-nota">central {fmt(c.posibles!.central)} · {c.n === 1 ? `solo ${c.min.anio}` : `${c.n} elecciones`}</p>
          </div>))}
        {!f?.posibles && enfoque !== "general" && <p className="text-sm self-center" style={mute}>Sin votos propios de {enfoque.toUpperCase()} en el periodo.</p>}
      </div>
      <Plegable resumen="¿De dónde salen estas cifras?">
        <div className="nota-metodo space-y-1">
          <p>Lista nominal más reciente: <b>{fmt(ln_ref)}</b> ({res.ln_ref_anio}). Participación histórica de este cargo aquí: de <b>{p.min.toFixed(1)}%</b> ({p.min_anio}) a <b>{p.max.toFixed(1)}%</b> ({p.max_anio}), media {p.prom.toFixed(1)}%. Votantes esperados: {fmt(Math.round(v.min))} a {fmt(Math.round(v.max))} (media {fmt(Math.round(v.prom))}).</p>
          {f?.posibles && <p><b>{f.clave.toUpperCase()}</b>: piso de {fmt(f.min.votos)} votos ({f.min.anio}) y techo de {fmt(f.max.votos)} ({f.max.anio}), entre {pct(f.posibles.cuota.min)} y {pct(f.posibles.cuota.max)} de los votantes. Su menor % por la menor participación da el escenario bajo; su mayor % por la mayor, el alto.{f.coalicion_anios.length ? ` Fue en coalición en ${f.coalicion_anios.join(", ")}: ahí sus votos propios no muestran todo su peso.` : ""}</p>}
        </div>
      </Plegable>
    </div>);
}
