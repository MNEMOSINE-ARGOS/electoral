"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { Territorio, SEL_VACIA, lugares, type Lugar, type Sel } from "@/components/Territorio";
import { Piramide } from "@/components/Piramide";
import { Cargando, Kpi } from "@/components/Kpi";
import { BotonLimpiar, ElegirDetalle, NAC, type Terr } from "@/components/FiltroTerritorio";
import { PerfilCensoTerritorio } from "@/components/PerfilCensoTerritorio";
import { fmt, pct } from "@/lib/format";

type Resp = {
  corte: string; cortes_con_edad: string[]; grupos: string[]; piramide: { h: number[]; m: number[]; nb: number } | null;
  serie: { fecha_corte: string; lista_h: string; lista_m: string; lista_total: string; padron_total: string }[];
};
// Una línea por territorio en la evolución (sin verdes)
const COLORES = ["var(--serie-fed)", "var(--serie-loc)", "var(--warn)", "var(--fg-soft)", "var(--azul)", "var(--rose)", "#7c3aed", "var(--fg-mute)"];
const claveL = (l: Lugar) => `${l.estado}-${l.municipio}`;
const fmtEje = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`);
const tip = { background: "var(--card-solid)", border: "1px solid var(--line)", borderRadius: 12 };

function cifras(d: Resp) {
  const p = d.piramide!;
  const totH = p.h.reduce((a, b) => a + b, 0), totM = p.m.reduce((a, b) => a + b, 0), tot = totH + totM || 1;
  const jov = p.h.slice(0, 4).reduce((a, b) => a + b, 0) + p.m.slice(0, 4).reduce((a, b) => a + b, 0);
  const may = p.h[11] + p.m[11];
  return { total: totH + totM, mujeres: (100 * totM) / tot, jov: (100 * jov) / tot, may: (100 * may) / tot };
}

export default function Electorado() {
  const cat = useCatalogo();
  const [sel, setSel] = useState<Sel>(SEL_VACIA);
  const [corte, setCorte] = useState("");
  const [datos, setDatos] = useState<Record<string, Resp>>({});
  const [iDet, setIDet] = useState(0);
  const ls = useMemo(() => lugares(sel, cat?.estados ?? []), [sel, cat]);
  const claves = ls.map(claveL).join("|");
  const nombreEstado = (e: number) => cat?.estados.find((x) => x.id_estado === e)?.nombre_corto ?? "";

  useEffect(() => {
    setDatos({});
    let vivo = true;
    for (const l of ls) {
      const nivel = l.municipio ? "municipio" : l.estado ? "estado" : "nacional";
      api<Resp>(`/api/electorado?nivel=${nivel}&clave=${l.municipio || l.estado}${corte ? `&corte=${corte}` : ""}`)
        .then((r) => vivo && setDatos((x) => ({ ...x, [claveL(l)]: r })));
    }
    return () => { vivo = false; };
  }, [claves, corte]); // eslint-disable-line react-hooks/exhaustive-deps

  const varios = ls.length > 1;
  const listos = ls.every((l) => datos[claveL(l)]);
  const d = datos[claveL(ls[0])] ?? null;
  const det = ls[Math.min(iDet, ls.length - 1)];
  const ts: Terr[] = ls.map((l) => ({ ...NAC, estado: l.estado, municipio: l.municipio, nombre: l.nombre }));

  // Evolución: lista nominal total de cada territorio por corte
  const evol = useMemo(() => {
    if (!varios || !listos) return [];
    const por = new Map<string, Record<string, number | string>>();
    ls.forEach((l, i) => {
      for (const s of datos[claveL(l)].serie) {
        const f = s.fecha_corte.slice(0, 7);
        if (!por.has(s.fecha_corte)) por.set(s.fecha_corte, { f, orden: s.fecha_corte });
        por.get(s.fecha_corte)![`t${i}`] = Number(s.lista_total);
      }
    });
    return [...por.values()].sort((a, b) => String(a.orden).localeCompare(String(b.orden)));
  }, [varios, listos, datos, claves]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Electorado: lista nominal por edad y sexo</h1>
        <p style={{ color: "var(--fg-soft)" }}>Contexto geográfico, separado de los resultados. Cada corte es una fecha distinta (DERFE-INE); no se suman cortes.</p>
      </header>
      <section className="material p-4 flex flex-wrap gap-4 items-start">
        {cat && <Territorio estados={cat.estados} valor={sel} onChange={(s) => { setSel(s); setIDet(0); }} />}
        <span className="ml-auto self-center"><BotonLimpiar visible={!!(sel.estados.length || sel.municipios.length || corte)} onClick={() => { setSel(SEL_VACIA); setCorte(""); setIDet(0); }} /></span>
        <label className="space-y-1"><span className="label">Corte con edad</span>
          <select className="field" value={d?.corte ?? ""} onChange={(e) => setCorte(e.target.value)}>
            {(d?.cortes_con_edad ?? []).map((c) => <option key={c}>{c}</option>)}</select></label>
      </section>

      {!varios ? (
        !d ? <Cargando alto={420} /> : !d.piramide ? <p className="material p-6">Sin lista nominal por edad para este territorio y corte.</p> : (() => {
          const c = cifras(d);
          return (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi titulo="Lista nominal" valor={fmt(c.total)} nota={`corte ${d.corte}`} acento />
                <Kpi titulo="Mujeres / hombres" valor={pct(c.mujeres)} nota="mujeres en la lista" />
                <Kpi titulo="18 a 29 años" valor={pct(c.jov)} />
                <Kpi titulo="65 años y más" valor={pct(c.may)} />
              </div>
              <section className="material p-5"><Piramide grupos={d.grupos} h={d.piramide.h} m={d.piramide.m} nb={d.piramide.nb} /></section>
              <section className="material p-4 space-y-2">
                <h2 className="text-xl font-bold">Evolución de la lista nominal (por corte)</h2>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={d.serie.map((s) => ({ f: s.fecha_corte.slice(0, 7), mujeres: Number(s.lista_m), hombres: Number(s.lista_h) }))}>
                      <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="f" stroke="var(--fg-mute)" fontSize={11} minTickGap={30} />
                      <YAxis stroke="var(--fg-mute)" fontSize={11} tickFormatter={fmtEje} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={tip} formatter={(v) => fmt(Number(v))} />
                      <Line dataKey="mujeres" stroke="var(--mujer)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                      <Line dataKey="hombres" stroke="var(--hombre)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs" style={{ color: "var(--fg-mute)" }}>No hay cortes de 2004-2016 (el INE no los publica). Las secciones cambian con el reseccionamiento: series largas por municipio son más confiables que por sección.</p>
              </section>
            </>
          );
        })()
      ) : !listos ? <Cargando alto={420} /> : (
        <>
          {/* Lado a lado: una columna por territorio, mismo corte */}
          <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ls.map((l, i) => {
              const r = datos[claveL(l)];
              const titulo = l.municipio ? `${l.nombre} (${nombreEstado(l.estado)})` : l.nombre;
              if (!r.piramide) return <div key={claveL(l)} className="material p-4 space-y-1"><p className="font-bold">{titulo}</p><p className="text-sm" style={{ color: "var(--fg-mute)" }}>Sin lista nominal por edad para este territorio y corte.</p></div>;
              const c = cifras(r);
              return (
                <div key={claveL(l)} className="material p-4 space-y-3 min-w-0">
                  <p className="font-bold flex items-center gap-2"><span className="inline-block size-2.5 rounded-full shrink-0" style={{ background: COLORES[i % COLORES.length] }} />{titulo}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="label">Lista nominal</p><p className="num font-bold text-lg" style={{ color: "var(--accion)" }}>{fmt(c.total)}</p></div>
                    <div><p className="label">Mujeres</p><p className="num font-bold text-lg">{pct(c.mujeres)}</p></div>
                    <div><p className="label">18 a 29 años</p><p className="num font-bold text-lg">{pct(c.jov)}</p></div>
                    <div><p className="label">65 años y más</p><p className="num font-bold text-lg">{pct(c.may)}</p></div>
                  </div>
                  <Piramide grupos={r.grupos} h={r.piramide.h} m={r.piramide.m} nb={r.piramide.nb} />
                </div>
              );
            })}
          </section>
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Corte {d?.corte ?? "—"}. Cada territorio se lee por separado con el mismo corte: las cifras no se suman entre territorios.</p>
          <section className="material p-4 space-y-2">
            <h2 className="text-xl font-bold">Evolución de la lista nominal (por corte)</h2>
            <div style={{ height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={evol}>
                  <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="f" stroke="var(--fg-mute)" fontSize={11} minTickGap={30} />
                  <YAxis stroke="var(--fg-mute)" fontSize={11} tickFormatter={fmtEje} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={tip} formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {ls.map((l, i) => <Line key={claveL(l)} dataKey={`t${i}`} name={l.nombre} stroke={COLORES[i % COLORES.length]} strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Lista nominal total de cada territorio en cada corte; cada línea es un territorio distinto (no se suman). No hay cortes de 2004-2016 (el INE no los publica).</p>
          </section>
        </>
      )}

      {varios && cat && <ElegirDetalle ts={ts} i={Math.min(iDet, ls.length - 1)} onChange={setIDet} estados={cat.estados} texto="Perfil del censo de" />}
      <PerfilCensoTerritorio estado={det.estado} municipio={det.municipio} lugar={det.municipio || det.estado ? det.nombre : "Nacional"} nombreEstado={nombreEstado(det.estado)} />
    </>
  );
}
