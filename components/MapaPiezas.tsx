"use client";
import { ETIQ_CLASE, nombreCandidatura } from "@/lib/analisis";
import { colorPartido } from "@/lib/partidos";
import { fmt, pct } from "@/lib/format";
import { type ItemLeyenda, type UnidadMapa, type Metrica } from "@/lib/mapa";
import { useEnfoque } from "@/components/Enfoque";

/** Leyenda del mapa con cuántas unidades hay en cada categoría. Al pasar el cursor (o enfocar) por una, el mapa resalta esas unidades. */
export function LeyendaMapa({ items, escala, unidad, onHover, titulo }: {
  items: ItemLeyenda[]; escala?: { color: string; t: string; n: number }[]; unidad: [string, string]; onHover?: (k: string | null) => void; titulo?: string;
}) {
  const total = items.reduce((a, b) => a + b.n, 0);
  return (
    <div className="space-y-2.5">
      {titulo && <p className="label">{titulo}</p>}
      {total > 0 && (
        <div className="mapa-barra" aria-hidden>
          {items.filter((i) => i.n).map((i) => <i key={i.k} style={{ flexGrow: i.n, background: i.color }} title={`${i.t}: ${i.n}`} />)}
        </div>
      )}
      <ul className="mapa-ley">
        {items.map((i) => (
          <li key={i.k} tabIndex={onHover ? 0 : undefined} title={i.d} onPointerEnter={() => onHover?.(i.k)} onPointerLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(i.k)} onBlur={() => onHover?.(null)} data-vacio={i.n === 0 || undefined}>
            <span className="mapa-ley-c" style={{ background: i.color }} />
            <span className="mapa-ley-t">{i.t}</span>
            <b className="num">{i.n}</b>
          </li>))}
      </ul>
      {escala && (
        <div className="space-y-1">
          <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Intensidad del color = margen de victoria</p>
          <div className="mapa-escala">{escala.map((s) => <span key={s.t}><i style={{ background: s.color }} />{s.t}<small className="num"> · {s.n}</small></span>)}</div>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--fg-mute)" }}>{fmt(total)} {total === 1 ? unidad[0] : unidad[1]} con datos</p>
    </div>
  );
}

/** Meta de un PREP (lib/prep.ts): resultados preliminares, con su corte y su avance de actas. */
export type PrepMeta = { fuente: "prep"; corte: string; pct_actas: number; actas_contabilizadas: number; actas_esperadas: number; titulo?: string };

/** Aviso de resultados preliminares: siempre visible cuando lo que se pinta viene del PREP. */
export function AvisoPrep({ meta, donde }: { meta: PrepMeta; donde?: string }) {
  return (
    <p className="aviso aviso-prep text-sm">
      <span className="chip-prep">PREP</span> <b>Resultados preliminares{donde ? ` de ${donde}` : ""}</b>: corte {meta.corte}, {meta.pct_actas.toFixed(1)}% de actas contabilizadas
      ({meta.actas_contabilizadas.toLocaleString("es-MX")} de {meta.actas_esperadas.toLocaleString("es-MX")}). No es el cómputo oficial: las cifras pueden cambiar.
    </p>);
}

/** Contenido de la tarjeta flotante de una unidad. Con `completo`, también la lista de candidaturas (si la unidad las trae). */
export function FichaUnidad({ nombre, u, metrica, partido, nota, completo }: { nombre: string; u: UnidadMapa | undefined; metrica: Metrica; partido: string; nota?: string; completo?: boolean }) {
  const { enfoque } = useEnfoque();
  if (!u) return <div className="space-y-0.5"><b>{nombre}</b><p style={{ color: "var(--fg-mute)" }}>{nota ?? "Sin datos de esta elección"}</p></div>;
  const top = Object.entries(u.alc).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = top[0]?.[1] ?? 1;
  return (
    <div className="space-y-1.5">
      <b className="block text-[.82rem]">{nombre}</b>
      {u.ganador && (
        <p><span className="mapa-ley-c inline-block align-middle mr-1.5" style={{ background: colorPartido(u.ganador) }} />
          <b>{nombreCandidatura(u.ganador)}</b> {pct(u.p_ganador)} <span style={{ color: "var(--fg-mute)" }}>· margen {u.margen?.toFixed(1)} pts</span></p>)}
      {u.clase && (
        <p><b style={{ color: ETIQ_CLASE[u.clase].color }}>{ETIQ_CLASE[u.clase].t}</b>
          {enfoque !== "general" && u.margen_enfoque !== null && <span style={{ color: "var(--fg-mute)" }}> · {enfoque.toUpperCase()} {pct(u.p_enfoque)} ({u.margen_enfoque > 0 ? "+" : ""}{u.margen_enfoque.toFixed(1)})</span>}</p>)}
      {u.ganador && u.candidatos?.[u.ganador] && <p>Candidatura ganadora: <b>{titulo(u.candidatos[u.ganador])}</b></p>}
      <p style={{ color: "var(--fg-mute)" }}>Participación <b style={{ color: metrica === "participacion" ? "var(--azul)" : "var(--fg)" }}>{pct(u.participacion)}</b> · {fmt(u.votos_totales)} votos</p>
      {metrica === "partido" && <p>{partido.toUpperCase()}: <b>{pct(u.alc[partido] ?? 0)}</b> <span style={{ color: "var(--fg-mute)" }}>(solo o en coalición)</span></p>}
      <div className="space-y-0.5 pt-0.5">
        {top.map(([p, v]) => (
          <div key={p} className="grid grid-cols-[3.2rem_1fr_2.6rem] items-center gap-1.5 text-[.7rem]">
            <span className="font-semibold uppercase truncate">{p}</span>
            <span className="h-1.5 rounded-full" style={{ background: colorPartido(p), width: `${(100 * v) / max}%` }} />
            <span className="num text-right">{v.toFixed(1)}%</span>
          </div>))}
      </div>
      {completo && u.candidatos && (
        <div className="pt-1.5 space-y-0.5">
          <p className="label">Candidaturas</p>
          {Object.entries(u.candidatos).map(([p, n]) => (
            <p key={p} className="text-[.72rem] flex gap-1.5"><span className="mapa-ley-c inline-block mt-0.5" style={{ background: colorPartido(p) }} />
              <span><b>{nombreCandidatura(p)}</b> · {titulo(n)}</span></p>))}
        </div>
      )}
    </div>
  );
}
/** «GABRIELA AMANDA ARCE» → «Gabriela Amanda Arce» */
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, (x) => x.toLowerCase());
