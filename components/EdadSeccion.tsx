"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Piramide } from "@/components/Piramide";
import { Cargando } from "@/components/Kpi";
import { fmt, pct } from "@/lib/format";

type R = { seccion: number; corte_edad: string | null; cortes_edad: string[]; grupos: string[]; piramide: { h: number[]; m: number[]; nb: number } | null };

/** Todos los rangos de edad (por sexo) de UNA sección, en el corte elegido. Por defecto, el corte que usa la lectura de la elección. */
export function EdadSeccion({ seccionId, corteInicial }: { seccionId: number; corteInicial: string | null }) {
  const [corte, setCorte] = useState<string | null>(corteInicial);
  const [d, setD] = useState<R | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setCorte(corteInicial); }, [seccionId, corteInicial]);
  useEffect(() => {
    setD(null); setError("");
    api<R>(`/api/seccion?id=${seccionId}${corte ? `&corte=${corte}` : ""}`).then(setD).catch((e) => setError(e.message));
  }, [seccionId, corte]);

  if (error) return <section className="material p-5"><p role="alert" style={{ color: "var(--bad)" }}>{error}</p></section>;
  if (!d) return <Cargando alto={260} />;
  const p = d.piramide;
  const tot = p ? p.h.reduce((a, b) => a + b, 0) + p.m.reduce((a, b) => a + b, 0) + p.nb : 0;
  return (
    <section className="material p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">Lista nominal por edad y sexo · sección {d.seccion}{d.corte_edad ? ` · corte ${d.corte_edad}` : ""}</p>
          <h2 className="text-xl font-bold pt-1">Todos los rangos de edad de la sección</h2></div>
        {d.cortes_edad.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Corte de la lista nominal">
            {d.cortes_edad.map((c) => <button key={c} className="chip" aria-pressed={c === d.corte_edad} onClick={() => setCorte(c)}>{c}</button>)}
          </div>
        )}
      </div>
      {!p ? <p className="text-sm" style={{ color: "var(--fg-mute)" }}>No hay lista nominal por edad para esta sección (solo existe en los cortes DERFE 2021-2026; puede ser una sección nueva o ya inexistente).</p> : (
        <div className="grid xl:grid-cols-[1fr_1fr] gap-5">
          <Piramide grupos={d.grupos} h={p.h} m={p.m} nb={p.nb} />
          <div className="overflow-auto">
            <table className="t">
              <thead><tr><th>Edad</th><th>Hombres</th><th>Mujeres</th><th>Total</th><th>% de la lista</th></tr></thead>
              <tbody>
                {d.grupos.map((g, i) => { const t = p.h[i] + p.m[i]; return (
                  <tr key={g}><td className="font-bold">{g}</td><td className="num">{fmt(p.h[i])}</td><td className="num">{fmt(p.m[i])}</td><td className="num font-semibold">{fmt(t)}</td><td className="num">{pct(tot ? (100 * t) / tot : null)}</td></tr>); })}
                {!!p.nb && <tr><td className="font-bold">No binario</td><td colSpan={2} style={{ color: "var(--fg-mute)" }}>sin rango de edad</td><td className="num font-semibold">{fmt(p.nb)}</td><td className="num">{pct(tot ? (100 * p.nb) / tot : null)}</td></tr>}
                <tr><td className="font-bold">Total</td><td className="num">{fmt(p.h.reduce((a, b) => a + b, 0))}</td><td className="num">{fmt(p.m.reduce((a, b) => a + b, 0))}</td><td className="num font-bold">{fmt(tot)}</td><td className="num">100%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Fuente: DERFE-INE, lista nominal por sección, sexo y rango de edad (8 cortes de 2021 a 2026; antes no se publica con edad). El corte inicial es el que usa la lectura de esta elección; si la sección se reseccionó, su geografía puede ser otra en otro corte.</p>
    </section>
  );
}
