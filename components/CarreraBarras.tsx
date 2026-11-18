"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { Resultado } from "@/lib/api";
import { BLOQUES, porBloque, porCandidatura } from "@/lib/analisis";
import { colorPartido } from "@/lib/partidos";
import { Ayuda } from "@/components/Ayuda";

// «Carrera de barras»: el reparto del voto de un cargo en un territorio, elección por elección, animado.
// Cada barra es el partido que encabeza la candidatura (o el bloque, con la lectura por bloque). Entre dos elecciones las barras
// se mueven solo para animar: no hay datos entre un año y otro. Cada elección es independiente; nunca se suman años.

const ORDEN_CABEZA = ["morena", "pan", "pri", "prd", "mc", "conve", "pvem", "pt"] as const;
const NOMBRE: Record<string, string> = { pri: "PRI", pan: "PAN", prd: "PRD", morena: "Morena", mc: "MC", pvem: "PVEM", pt: "PT", ind: "Independiente", otros: "Otros" };
const GRIS = "#9aa0a6";
/** Partido que encabeza la candidatura: el de más votos propios dentro de la coalición en esa elección (PAN-PRI-PRD es PRI en Coahuila 2023
 *  y PAN en la presidencia 2024). Sin votos propios de ningún integrante, el primero de Morena, PAN, PRI, PRD, MC, PVEM, PT. Sin anacronismos (PT 1994 es PT). */
function cabeza(k: string, partidos: Record<string, number>): string {
  const ts = k.split("-");
  if (ts.length === 1) return k.startsWith("ind") ? "ind" : k === "conve" ? "mc" : k;
  const mejor = ts.map((x) => [x, partidos[x] ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
  if (mejor[1] > 0) return mejor[0] === "conve" ? "mc" : mejor[0];
  const t = new Set(ts);
  for (const p of ORDEN_CABEZA) if (t.has(p)) return p === "conve" ? "mc" : p;
  return ts[0];
}
const sigla = (k: string) => k.split("-").map((x) => x.toUpperCase()).join(" · ");

type Cuadro = { anio: number; reconstruida: boolean; f: Record<string, { p: number; cand: string }> };

/** Avisos de datos por año (presidencia): lo que la fuente trae distinto de lo histórico, sin corregirlo aquí */
function avisoDe(cargo: string, anio: number): string {
  if (cargo !== "presidente") return "";
  if (anio === 1976) return "1976: PRI, PPS y PARM postularon al mismo candidato; la fuente registra por separado los votos de PPS-PARM.";
  if (anio === 1988) return "1988: la fuente atribuye a PDM y PRT cerca de una cuarta parte de los votos y no registra al Frente Democrático Nacional como tal. Es un dato a revisar en la fuente, no se corrigió aquí.";
  return "";
}

export function CarreraBarras({ serie, cargo, cargoNombre, lugar, bloque }: { serie: Resultado[]; cargo: string; cargoNombre: string; lugar: string; bloque: boolean }) {
  // Un cuadro por elección: % de los votos a candidaturas por partido que encabeza (o por bloque)
  const { cuadros, claves } = useMemo(() => {
    const cs: Cuadro[] = serie.filter((r) => !r.extraordinaria && Object.keys(r.partidos).length).sort((a, b) => a.anio - b.anio).map((r) => {
      const f: Cuadro["f"] = {};
      if (bloque) {
        const b = porBloque(r.partidos, r.anio), t = Object.values(b).reduce((x, y) => x + y, 0);
        for (const [k, v] of Object.entries(b)) f[k] = { p: t ? (100 * v) / t : 0, cand: "" };
      } else {
        const cand = porCandidatura(r.partidos), t = Object.values(cand).reduce((x, y) => x + y, 0);
        for (const [k, v] of Object.entries(cand).sort((a, b) => b[1] - a[1])) {
          const c = cabeza(k, r.partidos);
          if (!f[c]) f[c] = { p: 0, cand: k };
          f[c].p += t ? (100 * v) / t : 0;
        }
      }
      return { anio: r.anio, reconstruida: !!r.reconstruida, f };
    });
    // Las fuerzas que nunca llegan a 2% se juntan en «Otros» (en la lectura por bloque ya existe «otros»)
    const max: Record<string, number> = {};
    for (const c of cs) for (const [k, x] of Object.entries(c.f)) max[k] = Math.max(max[k] ?? 0, x.p);
    if (!bloque) for (const c of cs) for (const k of Object.keys(c.f)) if (max[k] < 2 && k !== "otros") {
      c.f.otros = { p: (c.f.otros?.p ?? 0) + c.f[k].p, cand: "" }; delete c.f[k];
    }
    return { cuadros: cs, claves: [...new Set(cs.flatMap((c) => Object.keys(c.f)))] };
  }, [serie, bloque]);
  const color = (k: string) => (bloque ? BLOQUES[k]?.color ?? GRIS : k === "otros" ? GRIS : k === "ind" ? "#64748b" : colorPartido(k));
  const nombre = (k: string) => (bloque ? BLOQUES[k]?.nombre ?? k : NOMBRE[k] ?? k.toUpperCase());

  // Ancho real: en celular el dibujo se hace a su tamaño, con letra legible
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(Math.min(1100, Math.max(320, el.clientWidth)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chico = W < 620, FILAS = 7;
  const X0 = chico ? 100 : bloque ? 230 : 190, X1 = W - (chico ? 56 : 84), ALTO = chico ? 34 : 46, PASO = chico ? 44 : 56, Y0 = 10, H = Y0 + FILAS * PASO + 24;

  // Momento 0..1000 a lo largo de la serie; abre en la última elección (se lee sin reproducir)
  const N = cuadros.length, TRAMO = 1000 / Math.max(1, N - 1);
  const [t, setT] = useState(1000);
  const [corriendo, setCorriendo] = useState(false);
  const [vel, setVel] = useState(1);
  const tRef = useRef(1000);
  useEffect(() => { tRef.current = 1000; setT(1000); setCorriendo(false); }, [cuadros]);
  useEffect(() => {
    if (!corriendo) return;
    let id = 0, ultimo = 0;
    const paso = (ahora: number) => {
      const dt = Math.min(64, ahora - (ultimo || ahora)); ultimo = ahora;
      // ~2.6 s por elección a velocidad normal, sin importar cuántas haya
      tRef.current = Math.min(1000, tRef.current + (dt * vel * TRAMO) / 2600);
      setT(tRef.current);
      if (tRef.current >= 1000) { setCorriendo(false); return; }
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [corriendo, vel, TRAMO]);
  function reproducir() { if (tRef.current >= 1000) { tRef.current = 0; setT(0); } setCorriendo((c) => !c); }
  function ir(v: number) { setCorriendo(false); tRef.current = v; setT(v); }

  if (N < 2) return null;
  // Estado en t: pausa en cada elección (45% del tramo) y movimiento suavizado hacia la siguiente
  const i = Math.min(N - 2, Math.floor(t / TRAMO)), u = Math.min(1, (t - i * TRAMO) / TRAMO);
  const m = u < 0.45 ? 0 : Math.min(1, (u - 0.45) / 0.55), s = m * m * (3 - 2 * m);
  const a = cuadros[i], b = cuadros[i + 1], actual = s < 0.5 ? a : b;
  const val = Object.fromEntries(claves.map((k) => [k, (a.f[k]?.p ?? 0) * (1 - s) + (b.f[k]?.p ?? 0) * s]));
  // Posición de cada fila interpolada entre el orden de una elección y el de la siguiente (sin saltos al rebasar)
  const rango = (c: Cuadro) => { const o = Object.keys(c.f).sort((x, y) => c.f[y].p - c.f[x].p); return (k: string) => { const r = o.indexOf(k); return r < 0 || r >= FILAS ? FILAS + 0.3 : r; }; };
  const ra = rango(a), rb = rango(b);
  const anio = Math.round(a.anio + (b.anio - a.anio) * s);
  const aviso = [avisoDe(cargo, actual.anio), actual.reconstruida ? `${actual.anio}: elección de otra distritación, reconstruida sumando las secciones del distrito vigente.` : ""].filter(Boolean).join(" ");
  const ancho = (v: number) => Math.max(0, ((X1 - X0) * v) / 100);
  // Años bajo la línea de tiempo: uno de cada «paso» para que no se encimen (5 en celular, 9 en escritorio)
  const paso = Math.max(1, Math.ceil((N - 1) / (chico ? 4 : 8)));

  return (
    <section id="carrera" className="material p-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="label">{lugar}</p><h2 className="text-xl font-bold pt-1 flex items-center gap-1">{cargoNombre}: carrera de {bloque ? "bloques" : "partidos"} · {cuadros[0].anio}–{cuadros[N - 1].anio}<Ayuda clave="carrera_barras" /></h2></div>
        <p className="text-xs" style={{ color: "var(--fg-mute)" }}>% de los votos a candidaturas</p>
      </div>
      <div ref={caja}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Reparto del voto de ${cargoNombre.toLowerCase()} en ${lugar}, ${anio}`}>
          {[0, 25, 50, 75, 100].map((p) => { const x = X0 + ((X1 - X0) * p) / 100; return (
            <g key={p}><line x1={x} x2={x} y1={2} y2={H - 18} stroke="var(--line)" />
              <text x={x} y={H - 5} textAnchor="middle" fontSize={11} fill="var(--fg-mute)">{p}%</text></g>); })}
          <text x={X1} y={H - 28} textAnchor="end" fontSize={chico ? 60 : 108} fontWeight={800} fill="var(--fg)" fillOpacity={0.09} style={{ fontFamily: "var(--font-display)" }}>{anio}</text>
          {claves.map((k) => {
            const v = val[k], y = Y0 + (ra(k) * (1 - s) + rb(k) * s) * PASO, w = ancho(v), c = actual.f[k]?.cand ?? "";
            const op = Math.min(1, v / 1.2) * (ra(k) * (1 - s) + rb(k) * s < FILAS ? 1 : 0);
            return (
              <g key={k} transform={`translate(0 ${y.toFixed(1)})`} opacity={op}>
                <rect x={X0} y={0} width={w} height={ALTO} rx={chico ? 6 : 8} fill={color(k)} />
                <text x={X0 - 10} y={ALTO / 2 - (c.includes("-") ? (chico ? 5 : 6) : 0)} textAnchor="end" dominantBaseline="middle" fontSize={chico ? 13 : 16} fontWeight={700} fill="var(--fg)">{nombre(k)}</text>
                {c.includes("-") && <text x={X0 - 10} y={ALTO / 2 + (chico ? 9 : 12)} textAnchor="end" dominantBaseline="middle" fontSize={chico ? 9 : 11} fill="var(--fg-mute)">{chico && c.split("-").length > 3 ? `${sigla(c.split("-").slice(0, 3).join("-"))}…` : sigla(c)}</text>}
                <text x={X0 + w + 8} y={ALTO / 2} dominantBaseline="middle" fontSize={chico ? 12.5 : 15} fontWeight={700} fill="var(--fg)" className="num">{v.toFixed(1)}%</text>
              </g>);
          })}
        </svg>
      </div>
      <p className="text-xs rounded-xl px-3 py-2 transition-opacity" aria-live="polite"
        style={{ color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 9%, transparent)", opacity: aviso ? 1 : 0, minHeight: "2.4rem" }}>{aviso}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="btn !py-1.5" onClick={reproducir}>
          {corriendo ? <><Pause size={15} />Pausa</> : <><Play size={15} />{t >= 1000 ? `Reproducir desde ${cuadros[0].anio}` : "Seguir"}</>}</button>
        <button type="button" className="chip" onClick={() => { ir(0); setCorriendo(true); }}><RotateCcw size={13} />Desde {cuadros[0].anio}</button>
        <label className="flex-1 min-w-[12rem] space-y-0.5">
          <input type="range" min={0} max={1000} step={1} value={Math.round(t)} onChange={(e) => ir(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--accion)" }} aria-label="Elección" />
          {/* Cada año bajo su punto de la línea; si no caben, uno de cada «paso» (siempre el último) */}
          <span className="relative block h-4 text-[0.68rem] num" style={{ color: "var(--fg-mute)" }}>
            {cuadros.map((c, j) => (j % paso && j !== N - 1) || (j !== N - 1 && N - 1 - j < paso) ? null : (
              <span key={c.anio} className="absolute top-0" style={{ left: `${(100 * j) / (N - 1)}%`, transform: `translateX(${j === 0 ? "0" : j === N - 1 ? "-100%" : "-50%"})` }}>{c.anio}</span>))}</span>
        </label>
        <div className="seg" role="group" aria-label="Velocidad">
          {([[0.6, "Lenta"], [1, "Normal"], [1.8, "Rápida"]] as const).map(([v, txt]) => <button key={v} type="button" aria-pressed={vel === v} onClick={() => setVel(v)}>{txt}</button>)}
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
        {bloque ? "Cada barra es un bloque (agrupación analítica de las coaliciones de cada elección, no oficial). "
          : "Cada barra es el partido que encabeza la candidatura: en una coalición, el integrante con más votos propios en esa elección; debajo, la coalición de ese año. Las fuerzas que nunca llegan a 2% van en «Otros». "}
        Votos por candidatura inferida de la boleta, sin nulos ni no registrados. Entre una elección y otra las barras se mueven solo para animar: no hay datos intermedios. Lectura analítica, no oficial.
      </p>
    </section>
  );
}
