"use client";
import { useEffect, useMemo, useState } from "react";
import { Users, Venus, Sparkles, Hourglass } from "lucide-react";
import { api } from "@/lib/api";
import { Piramide } from "@/components/Piramide";
import { Cargando } from "@/components/Kpi";
import { Ayuda } from "@/components/Ayuda";
import { fmt, pct } from "@/lib/format";

type Pir = { h: number[]; m: number[]; nb: number };
type R = {
  nivel: string; corte: string; corte_eleccion: string | null; grupos: string[];
  piramide: Pir | null; piramide_eleccion: Pir | null; estado: Pir | null; nacional: Pir | null;
  secciones: { total: number; con_edad: number } | null;
  piramide_hoy_comparable: Pir | null; secciones_comparables: number | null;
};
type Terr = { estado: number; distrito: number; municipio: number; seccion: number };

/** Marca de cada grupo de edad para la edad media (65 y más = 72), igual que en la lectura por sección */
const MARCA = [18, 19, 22, 27, 32, 37, 42, 47, 52, 57, 62, 72];

function medidas(p: Pir) {
  const g = p.h.map((h, i) => h + p.m[i]);
  const conEdad = g.reduce((a, b) => a + b, 0);
  const total = conEdad + p.nb;
  const tH = p.h.reduce((a, b) => a + b, 0), tM = p.m.reduce((a, b) => a + b, 0);
  const sh = (i: number[]) => (conEdad ? (100 * i.reduce((a, k) => a + g[k], 0)) / conEdad : null);
  return {
    g, total, conEdad, tH, tM,
    pctG: g.map((x) => (conEdad ? (100 * x) / conEdad : 0)),
    mujeres: tH + tM ? (100 * tM) / (tH + tM) : null,
    edad: conEdad ? g.reduce((a, x, i) => a + x * MARCA[i], 0) / conEdad : null,
    jov: sh([0, 1, 2, 3]), may: sh([11]), primeros: g[0] + g[1],
    // hombres por cada 100 mujeres
    razon: tM ? (100 * tH) / tM : null,
  };
}
type Med = ReturnType<typeof medidas>;

/** Electorado por edad y sexo del territorio elegido, en el corte más reciente, frente a su estado, al país y a la lista de la elección. */
export function PerfilEdadTerritorio({ eleccion, anio, terr, lugar, nombreEstado }: { eleccion: string; anio: number; terr: Terr; lugar: string; nombreEstado: string }) {
  const [d, setD] = useState<R | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setD(null); setError("");
    const qs = new URLSearchParams({ eleccion, anio: String(anio), estado: String(terr.estado), municipio: String(terr.municipio), distrito: String(terr.distrito), seccion: String(terr.seccion) });
    api<R>(`/api/perfil-edad?${qs}`).then(setD).catch((e) => setError(e.message));
  }, [eleccion, anio, terr.estado, terr.municipio, terr.distrito, terr.seccion]);

  const m = useMemo(() => (d?.piramide ? medidas(d.piramide) : null), [d]);
  const est = useMemo(() => (d?.estado ? medidas(d.estado) : null), [d]);
  const nac = useMemo(() => (d?.nacional ? medidas(d.nacional) : null), [d]);
  const prev = useMemo(() => (d?.piramide_eleccion ? medidas(d.piramide_eleccion) : null), [d]);
  // «hoy» con las mismas secciones que la elección (solo cambia si el territorio se armó por secciones y alguna ya no existe)
  const hoyC = useMemo(() => (d?.piramide_hoy_comparable ? medidas(d.piramide_hoy_comparable) : m), [d, m]);

  if (error) return <section className="material p-5"><p role="alert" style={{ color: "var(--bad)" }}>{error}</p></section>;
  if (!d) return <Cargando alto={320} />;
  if (!d.piramide || !m) return (
    <section className="material p-5 space-y-1">
      <p className="label">Electorado por edad y sexo · {lugar}</p>
      <p className="text-sm" style={{ color: "var(--fg-mute)" }}>No hay lista nominal por edad para este territorio en el corte {d.corte} (puede ser una sección que ya no existe tras un reseccionamiento).</p>
    </section>);

  // Referencia principal: el estado si estamos dentro de uno; si no, el país
  const ref = est ?? nac;
  const refNom = est ? nombreEstado : "el país";
  const lecturas = frases(m, ref, refNom, prev, hoyC ?? m, d, anio);
  const mute = { color: "var(--fg-mute)" };
  const maxP = Math.max(...m.pctG, ...(est?.pctG ?? []), ...(nac?.pctG ?? []), 1);
  const difEdad = m.edad !== null && ref?.edad != null ? m.edad - ref.edad : null;

  return (
    <section className="material p-5 space-y-5 entra">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Electorado por edad y sexo · {lugar} · corte DERFE {d.corte}</p>
          <h2 className="text-xl font-bold pt-1">¿Quién está hoy en la lista nominal?<Ayuda clave="edad_territorio" /></h2>
        </div>
        <span className="chip" title="Corte de la lista nominal por edad más reciente publicado por el INE">Dato más actualizado: {d.corte}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Dato icon={<Users size={18} />} t="Lista nominal" v={fmt(m.total)}
          n={prev ? `${hoyC!.total - prev.total >= 0 ? "+" : ""}${fmt(hoyC!.total - prev.total)} desde el corte de ${anio} (${d.corte_eleccion})` : "personas que pueden votar"} />
        <Dato icon={<Venus size={18} color="var(--mujer)" />} ayuda="mujeres" t="Mujeres" v={pct(m.mujeres)} color="var(--mujer)"
          n={m.razon !== null ? `${m.razon.toFixed(0)} hombres por cada 100 mujeres` : undefined} />
        <Dato icon={<Hourglass size={18} />} ayuda="edad_media" t="Edad media" v={m.edad !== null ? `${m.edad.toFixed(1)} años` : "—"}
          n={difEdad !== null ? `${difEdad >= 0 ? "+" : ""}${difEdad.toFixed(1)} años frente a ${refNom}` : undefined} />
        <Dato icon={<Sparkles size={18} color="var(--azul)" />} ayuda="jovenes" t="Jóvenes de 18 a 29" v={pct(m.jov)} color="var(--azul)"
          n={ref?.jov != null && m.jov !== null ? `${refNom}: ${pct(ref.jov)}` : undefined} />
        <Dato icon={<Users size={18} />} ayuda="mayores" t="65 años y más" v={pct(m.may)}
          n={ref?.may != null && m.may !== null ? `${refNom}: ${pct(ref.may)}` : undefined} />
      </div>

      {lecturas.length > 0 && (
        <ul className="text-sm font-semibold rounded-xl p-3 space-y-1" style={{ background: "color-mix(in srgb, var(--azul) 8%, transparent)", color: "var(--fg-soft)" }}>
          {lecturas.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}

      <div className="grid xl:grid-cols-[1fr_1.15fr] gap-6">
        <div className="space-y-2">
          <p className="label">Pirámide · personas por rango de edad</p>
          <Piramide grupos={d.grupos} h={d.piramide.h} m={d.piramide.m} nb={d.piramide.nb} />
        </div>
        <div className="space-y-2">
          <p className="label">Peso de cada edad frente a {est ? `${nombreEstado} y ` : ""}el país</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={mute}>
            <span><i className="inline-block w-3 h-2.5 rounded-sm align-middle mr-1" style={{ background: "var(--azul)" }} />{lugar}</span>
            {est && <span><i className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: "var(--rose)" }} />{nombreEstado}</span>}
            {nac && <span><i className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: "var(--fg)" }} />País</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="t">
              <thead><tr><th>Edad</th><th className="w-[40%]">% de la lista</th><th>Personas</th>{ref && <th>vs {est ? nombreEstado : "país"}</th>}{prev && <th>Desde {anio}</th>}</tr></thead>
              <tbody>
                {d.grupos.map((g, i) => {
                  const dif = ref ? m.pctG[i] - ref.pctG[i] : null;
                  const crec = prev ? hoyC!.g[i] - prev.g[i] : null;
                  return (
                    <tr key={g}>
                      <td className="font-bold whitespace-nowrap">{g}</td>
                      <td>
                        <div className="relative h-3.5 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }} title={`${lugar} ${pct(m.pctG[i])}${est ? ` · ${nombreEstado} ${pct(est.pctG[i])}` : ""}${nac ? ` · país ${pct(nac.pctG[i])}` : ""}`}>
                          <div className="h-full rounded-full" style={{ width: `${(100 * m.pctG[i]) / maxP}%`, background: "var(--azul)" }} />
                          {est && <i className="absolute top-[-3px] bottom-[-3px] w-0.5" style={{ left: `${(100 * est.pctG[i]) / maxP}%`, background: "var(--rose)" }} />}
                          {nac && <i className="absolute top-[-3px] bottom-[-3px] w-0.5" style={{ left: `${(100 * nac.pctG[i]) / maxP}%`, background: "var(--fg)" }} />}
                        </div>
                        <span className="num text-xs" style={mute}>{pct(m.pctG[i])}</span>
                      </td>
                      <td className="num">{fmt(m.g[i])}<span className="text-xs block" style={mute}>H {fmt(d.piramide!.h[i])} · M {fmt(d.piramide!.m[i])}</span></td>
                      {ref && <td className="num font-semibold" style={{ color: dif === null || Math.abs(dif) < 0.5 ? "var(--fg-mute)" : dif > 0 ? "var(--azul)" : "var(--rose)" }}>{dif === null ? "—" : `${dif > 0 ? "+" : ""}${dif.toFixed(1)} pts`}</td>}
                      {prev && <td className="num" style={{ color: crec === null || crec === 0 ? "var(--fg-mute)" : crec > 0 ? "var(--azul)" : "var(--rose)" }}>{crec === null ? "—" : `${crec > 0 ? "+" : ""}${fmt(crec)}`}</td>}
                    </tr>);
                })}
                <tr><td className="font-bold">Total</td><td className="num text-xs" style={mute}>{m.mujeres !== null ? `${pct(m.mujeres)} mujeres` : ""}</td><td className="num font-bold">{fmt(m.total)}</td>
                  {ref && <td />}{prev && <td className="num font-bold">{`${hoyC!.total - prev.total >= 0 ? "+" : ""}${fmt(hoyC!.total - prev.total)}`}</td>}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ul className="nota-metodo text-xs space-y-1" style={mute}>
        <li>Fuente: DERFE-INE, lista nominal por {d.secciones ? "sección" : "territorio"}, sexo y rango de edad. Se usa el corte más reciente ({d.corte}); la lista por edad solo existe desde 2021.</li>
        {d.secciones && <li>Este territorio se arma sumando sus {fmt(d.secciones.total)} secciones de la elección de {anio}; {d.secciones.con_edad < d.secciones.total
          ? <b>{fmt(d.secciones.total - d.secciones.con_edad)} ya no aparecen en el corte {d.corte} (reseccionamiento) y no se cuentan</b> : "todas aparecen en el corte"}.</li>}
        {prev ? <li>«Desde {anio}»: diferencia de personas contra el corte {d.corte_eleccion}, el más cercano anterior a la jornada. Combina altas, bajas y cambios de domicilio; no es solo gente que cumplió 18.{d.secciones_comparables !== null && d.secciones && d.secciones_comparables < d.secciones.total ? ` Se compara con las ${fmt(d.secciones_comparables)} secciones que están en ambos cortes.` : ""}</li>
          : anio < 2021 && <li>La elección de {anio} es anterior a la lista por edad (2021): no hay perfil de ese momento para comparar.</li>}
        <li>«vs {est ? nombreEstado : "país"}»: puntos de diferencia en el peso de cada edad (azul = aquí pesa más; rosa = pesa menos). Edad media con la marca de cada rango (65 y más = 72 años). No binario: se cuenta en el total, no en los rangos.</li>
        <li>Describe quién puede votar, no quién votó: el INE no publica la participación por edad en cada sección.</li>
      </ul>
    </section>
  );
}

/** Lo que dice el perfil, en frases (solo diferencias que valen la pena). */
function frases(m: Med, ref: Med | null, refNom: string, prev: Med | null, hoyC: Med, d: R, anio: number): string[] {
  const out: string[] = [];
  if (ref && m.edad !== null && ref.edad !== null) {
    const dif = m.edad - ref.edad;
    if (Math.abs(dif) >= 0.5) out.push(`Electorado ${dif < 0 ? "más joven" : "más viejo"} que el de ${refNom}: edad media ${m.edad.toFixed(1)} contra ${ref.edad.toFixed(1)} años.`);
    else out.push(`Edad muy parecida a la de ${refNom} (${m.edad.toFixed(1)} contra ${ref.edad.toFixed(1)} años).`);
  }
  // El grupo que más se separa de la referencia
  if (ref) {
    const difs = m.pctG.map((p, i) => ({ i, d: p - ref.pctG[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const x = difs[0];
    if (x && Math.abs(x.d) >= 1) out.push(`Donde más se distingue: ${d.grupos[x.i]} años, ${pct(m.pctG[x.i])} de la lista (${x.d > 0 ? "+" : ""}${x.d.toFixed(1)} pts frente a ${refNom}).`);
  }
  // Grupo más grande en personas
  const mayor = m.g.reduce((b, x, i) => (x > m.g[b] ? i : b), 0);
  out.push(`El rango con más electores es ${d.grupos[mayor]} años: ${fmt(m.g[mayor])} personas. Quienes tienen 18 a 29 años suman ${fmt(m.g.slice(0, 4).reduce((a, b) => a + b, 0))}.`);
  const anioCorte = Number(d.corte.slice(0, 4));
  if (anio && anioCorte - anio >= 2) out.push(`${fmt(m.primeros)} personas de 18 y 19 años no tenían edad para votar en ${anio}: serán primeros votantes.`);
  if (prev) {
    const crec = hoyC.g.map((x, i) => ({ i, c: x - prev.g[i] })).sort((a, b) => b.c - a.c)[0];
    if (crec && crec.c > 0) out.push(`Desde el corte de ${anio}, el rango que más creció es ${d.grupos[crec.i]} años (+${fmt(crec.c)}).`);
  }
  return out;
}

function Dato({ icon, t, v, n, color, ayuda }: { icon: React.ReactNode; t: string; v: string; n?: string; color?: string; ayuda?: string }) {
  return (
    <div className="rounded-2xl p-4 space-y-1" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <p className="label flex items-center gap-1.5">{icon}{t}{ayuda && <Ayuda clave={ayuda} />}</p>
      <p className="display text-[1.45rem] font-bold num" style={{ color: color ?? "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
