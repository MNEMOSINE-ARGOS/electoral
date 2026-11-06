"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useCatalogo } from "@/components/useCatalogo";
import { Territorio, type Sel } from "@/components/Territorio";
import { Piramide } from "@/components/Piramide";
import { Cargando, Kpi } from "@/components/Kpi";
import { fmt, pct } from "@/lib/format";

type Resp = {
  corte: string; cortes_con_edad: string[]; grupos: string[]; piramide: { h: number[]; m: number[]; nb: number } | null;
  serie: { fecha_corte: string; lista_h: string; lista_m: string; lista_total: string; padron_total: string }[];
};

export default function Electorado() {
  const cat = useCatalogo();
  const [sel, setSel] = useState<Sel>({ estado: 0, municipio: 0 });
  const [corte, setCorte] = useState("");
  const [d, setD] = useState<Resp | null>(null);

  useEffect(() => {
    setD(null);
    const nivel = sel.municipio ? "municipio" : sel.estado ? "estado" : "nacional";
    const clave = sel.municipio || sel.estado;
    api<Resp>(`/api/electorado?nivel=${nivel}&clave=${clave}${corte ? `&corte=${corte}` : ""}`).then(setD);
  }, [sel, corte]);

  const totH = d?.piramide?.h.reduce((a, b) => a + b, 0) ?? 0, totM = d?.piramide?.m.reduce((a, b) => a + b, 0) ?? 0;
  const jov = d?.piramide ? d.piramide.h.slice(0, 4).reduce((a, b) => a + b, 0) + d.piramide.m.slice(0, 4).reduce((a, b) => a + b, 0) : 0;
  const may = d?.piramide ? d.piramide.h[11] + d.piramide.m[11] : 0;

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-3xl md:text-[2.6rem] font-bold">Electorado: lista nominal por edad y sexo</h1>
        <p style={{ color: "var(--fg-soft)" }}>Contexto geográfico, separado de los resultados. Cada corte es una fecha distinta (DERFE-INE); no se suman cortes.</p>
      </header>
      <section className="material p-4 flex flex-wrap gap-4 items-end">
        {cat && <Territorio estados={cat.estados} valor={sel} onChange={setSel} />}
        <label className="space-y-1"><span className="label">Corte con edad</span>
          <select className="field" value={d?.corte ?? ""} onChange={(e) => setCorte(e.target.value)}>
            {(d?.cortes_con_edad ?? []).map((c) => <option key={c}>{c}</option>)}</select></label>
      </section>
      {!d ? <Cargando alto={420} /> : !d.piramide ? <p className="material p-6">Sin lista nominal por edad para este territorio y corte.</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi titulo="Lista nominal" valor={fmt(totH + totM)} nota={`corte ${d.corte}`} acento />
            <Kpi titulo="Mujeres / hombres" valor={pct((100 * totM) / (totH + totM || 1))} nota="mujeres en la lista" />
            <Kpi titulo="18 a 29 años" valor={pct((100 * jov) / (totH + totM || 1))} />
            <Kpi titulo="65 años y más" valor={pct((100 * may) / (totH + totM || 1))} />
          </div>
          <section className="material p-5"><Piramide grupos={d.grupos} h={d.piramide.h} m={d.piramide.m} nb={d.piramide.nb} /></section>
          <section className="material p-4 space-y-2">
            <h2 className="text-xl font-bold">Evolución de la lista nominal (por corte)</h2>
            <div style={{ height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={d.serie.map((s) => ({ f: s.fecha_corte.slice(0, 7), mujeres: Number(s.lista_m), hombres: Number(s.lista_h) }))}>
                  <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="f" stroke="var(--fg-mute)" fontSize={11} minTickGap={30} />
                  <YAxis stroke="var(--fg-mute)" fontSize={11} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`)} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--line)", borderRadius: 12 }} formatter={(v) => fmt(Number(v))} />
                  <Line dataKey="mujeres" stroke="var(--mujer)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line dataKey="hombres" stroke="var(--hombre)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>No hay cortes de 2004-2016 (el INE no los publica). Las secciones cambian con el reseccionamiento: series largas por municipio son más confiables que por sección.</p>
          </section>
        </>
      )}
    </>
  );
}
