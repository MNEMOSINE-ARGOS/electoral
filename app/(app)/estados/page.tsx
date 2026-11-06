"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { MapaEstados } from "@/components/MapaEstados";
import { Cargando, Confianza } from "@/components/Kpi";
import { alcance, colorPartido, nombreEleccion } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";
import { indicadores, nombreCandidatura, porCandidatura } from "@/lib/analisis";

type Fila = { id_estado: number; votos_totales: number | null; nulos: number | null; lista_nominal: number | null; confianza: string | null; fuente: string; partidos: Record<string, number> };
type Metrica = "ganador" | "participacion" | "partido";

export default function Estados() {
  const cat = useCatalogo();
  const [eleccion, setEleccion] = useState("presidente");
  const [anio, setAnio] = useState<number | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("ganador");
  const [partido, setPartido] = useState("morena");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const tipos = useMemo(() => [...new Set((cat?.elecciones ?? []).map((e) => e.eleccion))], [cat]);
  const anios = useMemo(() => (cat?.elecciones ?? []).filter((e) => e.eleccion === eleccion && !e.extraordinaria).map((e) => e.anio).filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => b - a), [cat, eleccion]);
  useEffect(() => { if (anios.length && (anio === null || !anios.includes(anio))) setAnio(anios[0]); }, [anios, anio]);
  useEffect(() => {
    if (anio === null) return;
    setFilas(null);
    api<{ estados: Fila[] }>(`/api/estados?eleccion=${eleccion}&anio=${anio}`).then((d) => setFilas(d.estados));
  }, [eleccion, anio]);

  const nombres = useMemo(() => Object.fromEntries((cat?.estados ?? []).map((e) => [e.id_estado, e.nombre_corto])), [cat]);
  const baseVotos = (f: Fila) => Object.values(f.partidos).reduce((a, b) => a + b, 0);
  const ganador = (f: Fila) => Object.entries(porCandidatura(f.partidos)).sort((a, b) => b[1] - a[1])[0];
  const lista = useMemo(() => {
    const s = new Map<string, number>();
    for (const f of filas ?? []) for (const [p, v] of Object.entries(alcance(f.partidos))) s.set(p, (s.get(p) ?? 0) + v);
    return [...s.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([p]) => p);
  }, [filas]);

  const { colores, titulos } = useMemo(() => {
    const colores: Record<number, string> = {}, titulos: Record<number, string> = {};
    for (const f of filas ?? []) {
      const base = baseVotos(f), g = ganador(f);
      const part = f.lista_nominal && f.votos_totales ? (100 * f.votos_totales) / f.lista_nominal : null;
      if (metrica === "ganador" && g) {
        // Intensidad según el margen: más sólido = victoria más amplia
        const m = indicadores(porCandidatura(f.partidos)).margen ?? 0;
        colores[f.id_estado] = `color-mix(in srgb, ${colorPartido(g[0])} ${Math.round(35 + 65 * Math.min(1, m / 30))}%, var(--card-solid))`;
        titulos[f.id_estado] = `${nombres[f.id_estado]}: ${nombreCandidatura(g[0])} ${pct((100 * g[1]) / base)} · margen ${m.toFixed(1)} pts`;
      }
      else if (metrica === "participacion") {
        const t = part === null ? 0 : Math.min(1, Math.max(0, (part - 30) / 50));
        colores[f.id_estado] = part === null ? "var(--line)" : `color-mix(in srgb, var(--azul) ${Math.round(12 + 88 * t)}%, var(--card-solid))`;
        titulos[f.id_estado] = `${nombres[f.id_estado]}: participación ${pct(part)}`;
      } else {
        const p = base ? (100 * (alcance(f.partidos)[partido] ?? 0)) / base : 0;
        colores[f.id_estado] = `color-mix(in srgb, ${colorPartido(partido)} ${Math.round(8 + 92 * Math.min(1, p / 70))}%, var(--card-solid))`;
        titulos[f.id_estado] = `${nombres[f.id_estado]}: ${partido} ${pct(p)}`;
      }
    }
    return { colores, titulos };
  }, [filas, metrica, partido, nombres]);

  const f = filas?.find((x) => x.id_estado === sel);
  return (
    <>
      <header className="space-y-1">
        <p className="label">Mapa nacional</p>
        <h1 className="text-3xl md:text-[2.6rem] font-bold">{nombreEleccion[eleccion] ?? eleccion} {anio ?? ""} por entidad</h1>
        <p style={{ color: "var(--fg-soft)" }}>Una sola elección a la vez (cargo + año). El color es la candidatura ganadora y su intensidad, el margen de victoria.</p>
      </header>
      <section className="material p-4 space-y-4">
        <div className="flex flex-wrap gap-2">{tipos.map((t) => <button key={t} className="chip" aria-pressed={t === eleccion} onClick={() => setEleccion(t)}>{nombreEleccion[t] ?? t}</button>)}</div>
        <div className="flex flex-wrap gap-2">{anios.map((a) => <button key={a} className="chip" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}</button>)}</div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className="chip" aria-pressed={metrica === "ganador"} onClick={() => setMetrica("ganador")}>Ganador</button>
          <button className="chip" aria-pressed={metrica === "participacion"} onClick={() => setMetrica("participacion")}>Participación</button>
          <button className="chip" aria-pressed={metrica === "partido"} onClick={() => setMetrica("partido")}>% de un partido</button>
          {metrica === "partido" && <select className="field" style={{ width: "auto" }} value={partido} onChange={(e) => setPartido(e.target.value)}>{lista.map((p) => <option key={p}>{p}</option>)}</select>}
        </div>
      </section>
      {!filas ? <Cargando alto={460} /> : filas.length === 0 ? <p className="material p-6">Sin datos por estado para esta elección.</p> : (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <section className="material p-4"><MapaEstados colores={colores} titulos={titulos} seleccion={sel ? [sel] : []} onClick={setSel} /></section>
          <section className="material p-4 space-y-3">
            {f ? (
              <>
                <h2 className="text-xl font-bold">{nombres[f.id_estado]} · {anio}</h2><Confianza nivel={f.confianza} />
                <p className="text-sm">Votos {fmt(f.votos_totales)} · lista nominal {fmt(f.lista_nominal)} · participación {pct(f.lista_nominal && f.votos_totales ? (100 * f.votos_totales) / f.lista_nominal : null)}</p>
                <div className="space-y-1.5">
                  {Object.entries(porCandidatura(f.partidos)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, v]) => (
                    <div key={p} className="text-xs"><div className="flex justify-between"><b>{nombreCandidatura(p)}</b><span>{fmt(v)} · {pct((100 * v) / baseVotos(f))}</span></div>
                      <div className="h-2 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}><div className="h-2 rounded-full" style={{ width: `${(100 * v) / baseVotos(f)}%`, background: colorPartido(p) }} /></div></div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="label">Entidades por margen · toca una para ver su detalle</p>
                <div className="overflow-auto max-h-[440px]"><table className="t"><thead><tr><th>Entidad</th><th>Ganador</th><th>Margen</th><th>Particip.</th></tr></thead>
                  <tbody>{[...filas].map((x) => ({ x, i: indicadores(porCandidatura(x.partidos)) })).sort((a, b) => (a.i.margen ?? 99) - (b.i.margen ?? 99)).map(({ x, i }) => (
                    <tr key={x.id_estado} className="cursor-pointer" onClick={() => setSel(x.id_estado)}><td className="font-semibold">{nombres[x.id_estado]}</td>
                      <td style={{ color: i.ganador ? colorPartido(i.ganador) : undefined, fontWeight: 700 }}>{i.ganador ? nombreCandidatura(i.ganador) : "—"}</td>
                      <td>{i.margen?.toFixed(1) ?? "—"}</td><td>{pct(x.lista_nominal && x.votos_totales ? (100 * x.votos_totales) / x.lista_nominal : null)}</td></tr>))}</tbody></table></div>
              </>
            )}
            {f && <button className="chip" onClick={() => setSel(null)}>Ver todas las entidades</button>}
          </section>
        </div>
      )}
    </>
  );
}
