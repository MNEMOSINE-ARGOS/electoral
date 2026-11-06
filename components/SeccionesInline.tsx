"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Cargando } from "@/components/Kpi";
import { clasesDe, nombreCandidatura, type Clase } from "@/lib/analisis";
import { CeldaClase, useEnfoque } from "@/components/Enfoque";
import { colorPartido } from "@/lib/partidos";
import { pct, fmt } from "@/lib/format";

type Sec = { seccion_id: number; seccion: number; ganador: string | null; p_ganador: number | null; margen_bloque: number | null; clase: Clase | null; margen_enfoque: number | null; p_enfoque: number | null; participacion: number | null; lista_nominal: number | null; cambio_ganador: boolean | null };

/** Secciones de un municipio o distrito para UNA elección, con búsqueda y filtro por competitividad. */
export function SeccionesInline({ eleccion, anio, municipio, distrito, lugar, onElegir, enlace }: {
  eleccion: string; anio: number; municipio: number; distrito: number; lugar: string; onElegir: (id: number) => void; enlace: string;
}) {
  const { enfoque } = useEnfoque();
  const [d, setD] = useState<{ secciones: Sec[]; anio_anterior: number | null } | null>(null);
  const [busca, setBusca] = useState("");
  const [clase, setClase] = useState("");
  useEffect(() => {
    setD(null);
    api<{ secciones: Sec[]; anio_anterior: number | null }>(`/api/secciones?eleccion=${eleccion}&anio=${anio}&${municipio ? `municipio=${municipio}` : `distrito=${distrito}`}&enfoque=${enfoque}`).then(setD).catch(() => setD({ secciones: [], anio_anterior: null }));
    setClase("");
  }, [eleccion, anio, municipio, distrito, enfoque]);
  const filas = useMemo(() => (d?.secciones ?? []).filter((s) => (!busca || String(s.seccion).includes(busca.trim())) && (!clase || s.clase === clase)), [d, busca, clase]);
  const cuenta = useMemo(() => { const c: Record<string, number> = {}; for (const s of d?.secciones ?? []) if (s.clase) c[s.clase] = (c[s.clase] ?? 0) + 1; return c; }, [d]);

  return (
    <section className="material p-4 md:p-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">{lugar} · {anio}</p><h2 className="text-xl font-bold pt-1">Secciones {d ? `· ${d.secciones.length}` : ""}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-mute)" }} />
            <input className="field !py-1.5 !pl-8 text-sm !w-40" inputMode="numeric" placeholder="Número de sección" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar sección" /></label>
          <div className="seg flex-wrap">
            <button aria-pressed={!clase} onClick={() => setClase("")}>Todas</button>
            {clasesDe(enfoque).filter((c) => enfoque === "general" || cuenta[c.k]).map((c) => <button key={c.k} aria-pressed={clase === c.k} onClick={() => setClase(c.k)} title={c.d}>{c.t} {cuenta[c.k] ?? 0}</button>)}
          </div>
        </div>
      </div>
      {!d ? <Cargando alto={240} /> : d.secciones.length === 0 ? <p style={{ color: "var(--fg-mute)" }}>No hay resultados por sección para esta elección.</p> : (
        <div className="overflow-auto max-h-[460px]">
          <table className="t">
            <thead><tr><th>Sección</th><th>Ganador</th><th>Margen</th><th>Clase</th><th>Particip.</th><th>Lista nominal</th><th>vs {d.anio_anterior ?? "—"}</th><th /></tr></thead>
            <tbody>{filas.map((s) => (
              <tr key={s.seccion_id} className="cursor-pointer" onClick={() => onElegir(s.seccion_id)}>
                <td className="font-bold">{s.seccion}</td>
                <td><span className="font-bold" style={{ color: s.ganador ? colorPartido(s.ganador) : undefined }}>{s.ganador ? nombreCandidatura(s.ganador) : "—"}</span> {pct(s.p_ganador)}</td>
                <td>{s.margen_bloque?.toFixed(1) ?? "—"}</td>
                <td><CeldaClase clase={s.clase} margenEnfoque={s.margen_enfoque} pEnfoque={s.p_enfoque} /></td>
                <td>{pct(s.participacion)}</td><td>{fmt(s.lista_nominal)}</td>
                <td>{s.cambio_ganador === true ? <b style={{ color: "var(--rose)" }}>cambió</b> : s.cambio_ganador === false ? <span style={{ color: "var(--fg-mute)" }}>igual</span> : "—"}</td>
                <td><ChevronRight size={15} style={{ color: "var(--fg-mute)" }} /></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <Link href={enlace} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--azul)" }}>Abrir la lectura completa por sección (electorado, ficha de cada sección) <ChevronRight size={15} /></Link>
    </section>
  );
}
