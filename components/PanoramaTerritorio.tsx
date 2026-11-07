"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { api, type Resultado } from "@/lib/api";
import { type EntidadGeo, type UnidadMapa } from "@/lib/mapa";
import { colorPartido, nombreEleccion } from "@/lib/partidos";
import { ENFOQUES, indicadores, nombreCandidatura, porCandidatura } from "@/lib/analisis";
import { fmt, pct } from "@/lib/format";
import { useEnfoque } from "@/components/Enfoque";
import { PerfilEdadTerritorio } from "@/components/PerfilEdadTerritorio";
import { Ayuda } from "@/components/Ayuda";

type Foco = { tipo: "municipio" | "distrito" | "distrito_local"; id: number; nombre: string };

/** «Toda la data» de un municipio o distrito abierto en el mapa: cifras de la elección, sus secciones, su historia en el cargo,
 *  su electorado por edad y sexo, y el enlace a su lectura por sección. */
export function PanoramaTerritorio({ ent, foco, padre, secciones, eleccion, anio }: {
  ent: EntidadGeo; foco: Foco; padre: UnidadMapa | undefined; secciones: UnidadMapa[] | null; eleccion: string; anio: number;
}) {
  const { enfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const [serie, setSerie] = useState<Resultado[] | null>(null);
  const esMun = foco.tipo === "municipio";
  const tipoTxt = esMun ? "el municipio" : foco.tipo === "distrito" ? "el distrito federal" : "el distrito local";

  useEffect(() => {
    setSerie(null);
    const qs = new URLSearchParams({ eleccion, estado: String(ent.id), ...(esMun ? { municipio: String(foco.id) } : { distrito: String(foco.id), anio_ref: String(anio) }) });
    api<{ elecciones: Resultado[] }>(`/api/presidencial?${qs}`).then((d) => setSerie(d.elecciones.filter((x) => !x.extraordinaria && Object.keys(x.partidos).length))).catch(() => setSerie([]));
  }, [eleccion, ent.id, foco.id, esMun, anio]);

  // Secciones: cuántas gana cada fuerza, cuántas son reñidas y, desde el enfoque, cuántas están al alcance
  const sec = useMemo(() => {
    const us = secciones ?? [];
    const gan = new Map<string, number>();
    for (const u of us) if (u.ganador) gan.set(u.ganador, (gan.get(u.ganador) ?? 0) + 1);
    const conGanador = us.filter((u) => u.ganador).length;
    const reñidas = us.filter((u) => u.margen !== null && u.margen < 5).length;
    const ganaEnf = us.filter((u) => (u.margen_enfoque ?? -1) >= 0).length;
    const alcance = us.filter((u) => u.faltan != null && (u.margen_enfoque ?? -99) >= -10);
    return { n: us.length, conGanador, gan: [...gan].sort((a, b) => b[1] - a[1]), reñidas, ganaEnf, alcance: alcance.length, faltan: alcance.reduce((a, u) => a + (u.faltan ?? 0), 0) };
  }, [secciones]);

  const filasSerie = useMemo(() => [...(serie ?? [])].sort((a, b) => b.anio - a.anio).map((x, i, arr) => {
    const ix = indicadores(porCandidatura(x.partidos));
    const ant = arr[i + 1] ? indicadores(porCandidatura(arr[i + 1].partidos)) : null;
    return { x, ix, cambio: ant?.ganador && ix.ganador ? !ix.ganador.split("-").some((t) => ant.ganador!.split("-").includes(t)) : null };
  }), [serie]);
  const mute = { color: "var(--fg-mute)" };
  const enlace = `/secciones?eleccion=${eleccion}&anio=${anio}&estado=${ent.id}&${esMun ? "municipio" : "distrito"}=${foco.id}`;

  return (
    <div className="space-y-5 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label">Panorama · {nombreEleccion[eleccion] ?? eleccion} {anio}</p>
          <h3 className="text-xl font-bold">Todo {foco.nombre} en cifras</h3>
        </div>
        {foco.tipo !== "distrito_local" && (
          <Link href={enlace} className="btn btn-gris text-sm">Lectura por sección de {foco.nombre}<ArrowRight size={15} /></Link>)}
      </div>

      {/* Cifras de la elección */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Cifra t="Ganó" v={padre?.ganador ? nombreCandidatura(padre.ganador) : "—"} n={padre?.p_ganador != null ? `${pct(padre.p_ganador)} · margen ${padre.margen?.toFixed(1)} pts` : undefined}
          color={padre?.ganador ? colorPartido(padre.ganador) : undefined} ayuda="primera_fuerza" />
        <Cifra t="Votos emitidos" v={fmt(padre?.votos_totales)} n={`lista nominal ${fmt(padre?.lista_nominal)}`} ayuda="votos_emitidos" />
        <Cifra t="Participación" v={pct(padre?.participacion)} n={`${tipoTxt[0].toUpperCase()}${tipoTxt.slice(1)}`} color="var(--azul)" ayuda="participacion" />
        <Cifra t="Secciones" v={fmt(sec.n)} n={`${fmt(sec.reñidas)} reñidas (menos de 5 pts)`} />
        {enfoque !== "general"
          ? <Cifra t={`Desde ${enf.t}`} v={`${fmt(sec.ganaEnf)} ganadas`} n={sec.alcance ? `${fmt(sec.alcance)} al alcance (a 10 pts o menos) · le faltan ${fmt(sec.faltan)} votos` : "ninguna al alcance"} color={enf.color} ayuda="votos_para_ganar" />
          : <Cifra t="Segunda fuerza" v={padre?.segundo ? nombreCandidatura(padre.segundo) : "—"} n={padre?.margen != null ? `a ${padre.margen.toFixed(1)} pts de la primera` : undefined}
              color={padre?.segundo ? colorPartido(padre.segundo) : undefined} ayuda="margen" />}
      </div>

      {/* Secciones ganadas por fuerza */}
      {sec.conGanador > 0 && (
        <div className="space-y-1.5">
          <p className="label">Secciones ganadas por cada fuerza</p>
          <div className="mapa-barra" style={{ height: 12 }} aria-hidden>{sec.gan.map(([p, n]) => <i key={p} style={{ flexGrow: n, background: colorPartido(p) }} title={`${nombreCandidatura(p)}: ${n}`} />)}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{sec.gan.slice(0, 6).map(([p, n]) => (
            <span key={p}><span className="mapa-ley-c inline-block align-middle mr-1" style={{ background: colorPartido(p) }} /><b>{nombreCandidatura(p)}</b> {n} <span style={mute}>({pct((100 * n) / sec.conGanador, 0)})</span></span>))}</div>
        </div>)}

      {/* Historia del cargo en el territorio */}
      <div className="space-y-2">
        <p className="font-bold flex items-center gap-1.5"><TrendingUp size={16} />Su historia en {(nombreEleccion[eleccion] ?? eleccion).toLowerCase()}</p>
        {serie === null ? <div className="skeleton w-full h-28" /> : filasSerie.length === 0 ? <p className="text-sm" style={mute}>Sin otras elecciones de este cargo aquí.</p> : (
          <div className="overflow-auto">
            <table className="t">
              <thead><tr><th>Año</th><th>Ganó</th><th className="w-[30%]">%</th><th>Margen</th><th>Particip.</th><th>Votos</th></tr></thead>
              <tbody>{filasSerie.map(({ x, ix, cambio }) => (
                <tr key={x.anio} style={x.anio === anio ? { background: "color-mix(in srgb, var(--accion) 8%, transparent)" } : undefined}>
                  <td className="font-bold whitespace-nowrap">{x.anio}{x.reconstruida && <span className="chip !py-0 !px-1.5 ml-1.5 text-[10px]" title="De otra distritación: sumada por sección con la geografía vigente">reconstruida</span>}</td>
                  <td className="whitespace-nowrap"><span className="mapa-ley-c inline-block align-middle mr-1" style={{ background: ix.ganador ? colorPartido(ix.ganador) : undefined }} /><b style={{ color: ix.ganador ? colorPartido(ix.ganador) : undefined }}>{ix.ganador ? nombreCandidatura(ix.ganador) : "—"}</b>
                    {cambio && <span className="text-xs font-semibold" style={{ color: "var(--rose)" }}> · cambió</span>}</td>
                  <td><div className="h-2 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}><div className="h-2 rounded-full" style={{ width: `${ix.pGanador ?? 0}%`, background: ix.ganador ? colorPartido(ix.ganador) : undefined }} /></div>
                    <span className="num text-xs" style={mute}>{pct(ix.pGanador)}</span></td>
                  <td className="num">{ix.margen?.toFixed(1) ?? "—"}</td>
                  <td className="num">{pct(x.votos_totales && x.lista_nominal ? (100 * x.votos_totales) / x.lista_nominal : null)}</td>
                  <td className="num">{fmt(x.votos_totales)}</td>
                </tr>))}</tbody>
            </table>
          </div>)}
        <p className="text-xs" style={mute}>Cada fila es una elección distinta; ganador por candidatura (lectura analítica). «Cambió»: la candidatura ganadora no comparte ningún partido con la anterior.{!esMun && " En distritos federales, las elecciones de otra distritación se rehacen por sección («reconstruida»)."}</p>
      </div>

      {/* Electorado por edad y sexo, corte más reciente */}
      <PerfilEdadTerritorio eleccion={eleccion} anio={anio} lugar={foco.nombre} nombreEstado={ent.nombre}
        terr={{ estado: ent.id, municipio: esMun ? foco.id : 0, distrito: esMun ? 0 : foco.id, seccion: 0 }} />
    </div>
  );
}

function Cifra({ t, v, n, color, ayuda }: { t: string; v: string; n?: string; color?: string; ayuda?: string }) {
  return (
    <div className="rounded-2xl p-3.5 space-y-0.5" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <p className="label">{t}{ayuda && <Ayuda clave={ayuda} tam={11} />}</p>
      <p className="display text-[1.3rem] font-bold leading-tight" style={{ color: color ?? "var(--fg)" }}>{v}</p>
      {n && <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{n}</p>}
    </div>
  );
}
