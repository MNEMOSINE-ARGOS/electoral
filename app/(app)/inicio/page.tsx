"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Crosshair, MousePointerClick, Search, Layers3 } from "lucide-react";
import { GRUPOS, type Pantalla } from "@/lib/navegacion";
import { CARGOS } from "@/lib/cargos";
import { ENFOQUES, clasesDe } from "@/lib/analisis";
import { api } from "@/lib/api";
import { fmt, compacto } from "@/lib/format";
import { useEnfoque } from "@/components/Enfoque";
import { Ayuda } from "@/components/Ayuda";
import { Plegable } from "@/components/Plegable";
import { BarrasAnio, BarrasH, Sparkline } from "@/components/MiniGraficas";
import { Contador } from "@/components/Contador";
import { VotoAnimado } from "@/components/VotoAnimado";

// Portada después de iniciar sesión: el enfoque con su selector (arriba, para que se vea el cambio al elegir), qué cubre la base
// (cifras y gráficas reales de /api/inicio), cómo se recorre y una tarjeta por pantalla. La lista de pantallas sale de lib/navegacion.ts (la misma que la barra lateral).

type Stats = {
  anios: { min: number; max: number; n: number };
  por_anio: { anio: number; federal: number; local: number }[];
  por_cargo: { eleccion: string; elecciones: number; min: number; max: number }[];
  participacion_presidente: { anio: number; votos: number | null; lista: number | null }[];
  lista_nominal: { fecha: string; lista: number }[];
  secciones: number; resultados_seccion: number; municipios: number; distritos_federales: number;
  judicial: { cargos: number; candidaturas: number };
};

const mute = { color: "var(--fg-mute)" };
const NOMBRE_CARGO: Record<string, string> = { ...Object.fromEntries(CARGOS.map((c) => [c.id, c.nombre])), diputados_locales_rp: "Diputaciones locales RP", diputados_locales_mr: "Diputaciones locales" };
const FEDERALES = new Set(["presidente", "senado", "diputados_federales"]);
const CONCEPTOS: [string, string][] = [["participacion", "Participación"], ["margen", "Margen"], ["competitividad", "Competitividad"], ["lectura_candidatura", "Por candidatura"],
  ["lectura_boleta", "Por boleta"], ["lectura_alcance", "Alcance"], ["lectura_bloque", "Por bloque"], ["piso", "Piso"], ["techo", "Techo"],
  ["votos_aspirables", "Votos posibles"], ["frente_al_pais", "Frente al país"], ["votos_para_ganar", "Votos para ganar"]];

export default function Inicio() {
  const [nombre, setNombre] = useState<string | null>(null);
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => d?.nombre && setNombre(String(d.nombre).split(" ")[0])).catch(() => {});
    api<Stats>("/api/inicio").then(setS).catch(() => {});
  }, []);
  const part = useMemo(() => s?.participacion_presidente.map((p) => ({ x: p.anio, v: p.votos && p.lista ? (100 * p.votos) / p.lista : null })) ?? [], [s]);
  const ln = s?.lista_nominal.at(-1);
  const totalElecciones = s?.por_cargo.reduce((a, c) => a + c.elecciones, 0) ?? 0;

  return (
    <div className="inicio space-y-12 md:space-y-16 pb-10">
      {/* Hero */}
      <section className="pt-2 md:pt-6 space-y-6">
        <div className="inicio-hero">
        <div className="inicio-hero-texto space-y-4">
          <p className="label">{nombre ? `Hola, ${nombre}` : "Arg.Os Electoral"}</p>
          <h1 className="inicio-titulo">Las elecciones de México, <span style={{ color: "var(--titulo-acento)" }}>sección por sección.</span></h1>
          <p className="inicio-lead">Del país a la unidad más pequeña del mapa electoral, con décadas de historia para comparar.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/" className="btn btn-suave">Ver resultados <ArrowRight size={16} /></Link>
            <a href="#enfoque" className="btn btn-gris">Elegir mi enfoque</a>
          </div>
        </div>
        <VotoAnimado className="inicio-hero-escena" />
        </div>
        <dl className="inicio-cifras">
          <Cifra valor={s ? <Contador valor={s.anios.n} /> : null} titulo="años con elecciones" nota={s ? `de ${s.anios.min} a ${s.anios.max}` : ""} />
          <Cifra valor={s ? <Contador valor={s.por_cargo.length + (s.judicial.cargos ? 1 : 0)} /> : null} titulo="tipos de elección" nota={s ? `${fmt(totalElecciones)} elecciones cargo-año, más la judicial 2025` : ""} />
          <Cifra valor={s ? <Contador valor={s.secciones} /> : null} titulo="secciones con historial" nota={s ? `${compacto(s.resultados_seccion)} resultados por sección` : ""} />
          <Cifra valor={ln ? <Contador valor={ln.lista / 1e6} decimales={1} sufijo=" M" /> : null} titulo="personas en la lista nominal" nota={ln ? `corte ${ln.fecha}` : ""} />
        </dl>
      </section>

      <SeccionEnfoque />

      {/* Cobertura */}
      <section aria-labelledby="cobertura" className="space-y-4">
        <div className="space-y-1">
          <h2 id="cobertura" className="inicio-h2">Lo que cubre la base</h2>
          <p className="text-sm" style={mute}>Pasa el cursor sobre una barra o un punto para ver el detalle.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="inicio-panel space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">Cargos con resultados, por año</p>
              <div className="flex gap-3 text-xs" style={{ color: "var(--fg-soft)" }}>
                <span className="inline-flex items-center gap-1.5"><i className="mg-ley" style={{ background: "var(--serie-fed)" }} />Federales</span>
                <span className="inline-flex items-center gap-1.5"><i className="mg-ley" style={{ background: "var(--serie-loc)" }} />Locales</span>
              </div>
            </div>
            {s ? <BarrasAnio datos={s.por_anio} /> : <div className="inicio-esqueleto h-40" />}
            <p className="text-xs" style={mute}>Cada barra cuenta los tipos de cargo con datos ese año. Los cargos locales siguen el calendario de cada estado.</p>
          </div>
          <div className="inicio-panel space-y-3">
            <p className="font-bold">Tipos de elección <span className="font-normal text-sm" style={mute}>· años con datos</span></p>
            {s ? <BarrasH filas={[...s.por_cargo.map((c) => ({ k: c.eleccion, etiqueta: NOMBRE_CARGO[c.eleccion] ?? c.eleccion, valor: c.elecciones, nota: `${c.min}–${c.max}`,
              color: FEDERALES.has(c.eleccion) ? "var(--serie-fed)" : "var(--serie-loc)" })),
              ...(s.judicial.cargos ? [{ k: "judicial", etiqueta: "Poder Judicial", valor: 1, nota: `2025 · ${s.judicial.cargos} cargos`, color: "var(--fg-mute)" }] : [])]} />
              : <div className="inicio-esqueleto h-48" />}
          </div>
        </div>
      </section>

      {/* Tres pasos */}
      <section aria-labelledby="pasos" className="space-y-4">
        <h2 id="pasos" className="inicio-h2">Cómo se recorre</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          <Paso n={1} icon={Crosshair} titulo="Elige tu perspectiva" href="#enfoque" texto="General, o un partido." />
          <Paso n={2} icon={MousePointerClick} titulo="Elige cargo, año y territorio" href="/" texto="Del país a la sección." />
          <Paso n={3} icon={Search} titulo="Baja a la sección" href="/secciones" texto="Su historia, su gente y su potencial." />
        </ol>
      </section>

      {/* Pantallas */}
      <section aria-labelledby="mapa" className="space-y-6">
        <h2 id="mapa" className="inicio-h2">Las pantallas</h2>
        {GRUPOS.map((g, gi) => {
          const base = GRUPOS.slice(0, gi).reduce((a, x) => a + x.items.length, 0);
          return (
            <div key={g.titulo}>
              <p className="label pb-1">{g.titulo}</p>
              <ol className="inicio-indice">{g.items.map((p, i) => <FilaPantalla key={p.href} n={base + i + 1} p={p} s={s} part={part} />)}</ol>
            </div>);
        })}
      </section>

      {/* Conceptos */}
      <section aria-labelledby="conceptos" className="space-y-3">
        <h2 id="conceptos" className="inicio-h2">Palabras que vas a encontrar</h2>
        <p className="text-sm" style={mute}>Toca el «?» para ver qué es y cómo se calcula.</p>
        <div className="flex flex-wrap gap-2">{CONCEPTOS.map(([k, t]) => <span key={k} className="inicio-concepto">{t}<Ayuda clave={k} /></span>)}</div>
      </section>

      {/* Datos */}
      <section aria-labelledby="datos" className="inicio-datos space-y-2">
        <div className="flex items-center gap-2"><Layers3 size={18} style={{ color: "var(--azul)" }} /><h2 id="datos" className="inicio-h2 !text-lg">De dónde salen los datos</h2></div>
        <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Cómputos oficiales del INE por casilla y compilaciones académicas, estandarizados por sección. Son las cifras oficiales en su fecha de corte, antes de las resoluciones del Tribunal Electoral.</p>
        <Plegable resumen="Lo que conviene saber antes de comparar">
          <ul className="nota-metodo">
            <li><b>La sección cambia.</b> El INE resecciona cada año; una sección que no existe en ambos años queda «sin comparación».</li>
            <li><b>Los distritos cambian</b> en 1979, 1997, 2006, 2018 y 2024: las series por distrito usan solo el mapa vigente.</li>
            <li><b>Cargos locales a nivel nacional</b> suman estados distintos cada año: elige una entidad para comparar.</li>
            <li><b>Casillas especiales y sección 0</b> reciben votos de otras secciones o del extranjero: la participación puede pasar de 100%.</li>
            <li><b>Elección judicial</b>: se vota por personas y cada elector marca varias; no se compara con votos de partido.</li>
            <li><b>Lista nominal con edad</b> solo existe de 2021 a 2026; antes, solo por sexo (desde 2017).</li>
            <li>Todo lo que dice «lectura» (bloques, tendencia, estrategia, votos posibles) es <b>análisis</b>, no resultado oficial.</li>
          </ul>
        </Plegable>
      </section>
    </div>
  );
}

function Cifra({ valor, titulo, nota }: { valor: ReactNode | null; titulo: string; nota: string }) {
  return (
    <div className="inicio-cifra">
      <dd className="inicio-cifra-valor">{valor ?? <span className="inicio-esqueleto inline-block h-8 w-20 align-middle" />}</dd>
      <dt className="font-semibold text-sm">{titulo}</dt>
      <dd className="text-xs" style={mute}>{nota || " "}</dd>
    </div>);
}

function Paso({ n, icon: I, titulo, texto, href }: { n: number; icon: typeof Search; titulo: string; texto: string; href: string }) {
  const contenido = (<>
    <div className="flex items-center gap-2.5"><span className="inicio-num">{n}</span><I size={18} style={mute} /></div>
    <p className="font-bold pt-2.5">{titulo}</p>
    <p className="text-sm pt-0.5" style={{ color: "var(--fg-soft)" }}>{texto}</p>
  </>);
  return <li>{href.startsWith("#") ? <a href={href} className="inicio-paso">{contenido}</a> : <Link href={href} className="inicio-paso">{contenido}</Link>}</li>;
}

/** Cifra principal y vista previa de cada pantalla. Las gráficas con datos son reales; las demás son ilustraciones (aria-hidden). */
function vistaDe(href: string, s: Stats | null, part: { x: number; v: number | null }[], colores: string[]): { cifra: string | null; nota: string; vista: ReactNode } {
  const anios = s?.por_anio ?? [];
  switch (href) {
    case "/": {
      const ult = anios.slice(-24), max = Math.max(1, ...ult.map((d) => d.federal + d.local));
      return { cifra: s ? `${s.por_cargo.length} cargos` : null, nota: "del país a la sección",
        vista: <div className="inicio-mini-barras" aria-hidden>{ult.map((d) => <i key={d.anio} style={{ height: `${(100 * (d.federal + d.local)) / max}%` }} />)}</div> };
    }
    case "/secciones":
      return { cifra: s ? fmt(s.secciones) : null, nota: "secciones",
        vista: <div className="inicio-mosaico" aria-hidden>{Array.from({ length: 56 }, (_, i) => <i key={i} style={{ background: colores[(i * 7 + (i % 5) * 3) % colores.length] }} />)}</div> };
    case "/electorado":
      return { cifra: s?.lista_nominal.length ? `${(s.lista_nominal.at(-1)!.lista / 1e6).toFixed(1)} M` : null, nota: "lista nominal más reciente",
        vista: <Sparkline valores={s?.lista_nominal.map((x) => x.lista) ?? []} /> };
    case "/historico": {
      const v = part.filter((p) => p.v !== null).map((p) => p.v!);
      return { cifra: s ? `${s.anios.min}–${s.anios.max}` : null, nota: "series por cargo", vista: <Sparkline valores={v} /> };
    }
    case "/estados":
      return { cifra: "32", nota: "entidades",
        vista: <div className="inicio-entidades" aria-hidden>{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ opacity: 0.35 + ((i * 37) % 65) / 100 }} />)}</div> };
    case "/municipios":
      return { cifra: s ? fmt(s.municipios) : null, nota: "municipios",
        vista: <div className="inicio-comparar" aria-hidden><i style={{ width: "82%" }} /><i style={{ width: "58%" }} /><i style={{ width: "70%" }} /></div> };
    case "/distritos":
      return { cifra: s ? String(s.distritos_federales) : null, nota: "distritos federales",
        vista: <div className="inicio-puntos" aria-hidden>{Array.from({ length: s?.distritos_federales || 300 }, (_, i) => <i key={i} />)}</div> };
    case "/judicial":
      return { cifra: s ? fmt(s.judicial.candidaturas) : null, nota: "candidaturas",
        vista: <div className="inicio-mini-barras inicio-mini-barras--h" aria-hidden>{[92, 74, 61, 48, 40, 31, 22].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div> };
  }
  return { cifra: null, nota: "", vista: null };
}

/** Una pantalla como entrada de índice: número, nombre, resumen, vista previa y su cifra. La vista previa va en tinta neutra y
 *  toma el color de la pantalla al pasar el cursor. Las preguntas que responde, un nivel más abajo. */
function FilaPantalla({ n, p, s, part }: { n: number; p: Pantalla; s: Stats | null; part: { x: number; v: number | null }[] }) {
  const { enfoque } = useEnfoque();
  const colores = clasesDe(enfoque).filter((c) => c.k !== "sin_candidatura").map((c) => c.color);
  const { cifra, nota, vista } = vistaDe(p.href, s, part, colores);
  return (
    <li className="inicio-fila" style={{ ["--c" as string]: p.color }}>
      <Link href={p.href} className="inicio-fila-link">
        <span className="inicio-fila-n" aria-hidden>{String(n).padStart(2, "0")}</span>
        <span className="inicio-fila-txt">
          <span className="inicio-fila-t">{p.label}{p.enfoque && <span className="inicio-fila-enf" title="Se lee desde el partido de enfoque">enfoque</span>}</span>
          <span className="inicio-fila-r">{p.resumen}</span>
        </span>
        <span className="inicio-fila-vista">{vista}</span>
        <span className="inicio-fila-cifra">
          <b>{cifra ?? <span className="inicio-esqueleto inline-block h-6 w-16" />}</b>
          <small>{nota}</small>
        </span>
        <ArrowUpRight size={18} className="inicio-fila-flecha" aria-hidden />
      </Link>
      <Plegable className="inicio-fila-mas" resumen="Qué preguntas responde">
        <ul className="inicio-preguntas pt-1.5">{p.preguntas.map((q) => <li key={q}>{q}</li>)}</ul>
        <p className="label pt-2 pb-1">Contiene</p>
        <ul className="nota-metodo !pt-0">{p.contiene.map((c) => <li key={c}>{c}</li>)}</ul>
      </Plegable>
    </li>
  );
}

/** El enfoque con el control real: elegirlo aquí cambia toda la app y la escala se redibuja en vivo. */
function SeccionEnfoque() {
  const { enfoque, setEnfoque } = useEnfoque();
  const enf = ENFOQUES.find((e) => e.id === enfoque)!;
  const clases = clasesDe(enfoque);
  const conEnfoque = GRUPOS.flatMap((g) => g.items).filter((p) => p.enfoque);
  return (
    <section id="enfoque" aria-labelledby="enfoque-t" className="inicio-enfoque scroll-mt-20" style={{ ["--c" as string]: enf.color }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5 max-w-xl">
          <h2 id="enfoque-t" className="inicio-h2">¿Desde qué perspectiva abordas tu análisis?<Ayuda clave="enfoque" /></h2>
          <p className="text-sm" style={{ color: "var(--fg-soft)" }}>Elige un partido y cada unidad se clasifica desde él: si gana, por cuánto; si pierde, qué tan lejos quedó.</p>
        </div>
        <div className="inicio-selector" role="radiogroup" aria-label="Partido de enfoque">
          {ENFOQUES.map((e) => (
            <button key={e.id} role="radio" aria-checked={e.id === enfoque} onClick={() => setEnfoque(e.id)} style={{ ["--e" as string]: e.color }}>{e.t}</button>))}
        </div>
      </div>
      <ul key={enfoque} className="inicio-escala pt-5">
        {clases.map((c) => <li key={c.k} title={c.d}><span className="inicio-punto" style={{ background: c.color }} /><b>{c.t}</b><span className="text-xs" style={mute}>{c.d}</span></li>)}
      </ul>
      <p className="text-xs pt-4" style={mute}>
        También en la barra superior · se recuerda en este navegador · cambia {conEnfoque.map((p, i) => <span key={p.href}>{i ? (i === conEnfoque.length - 1 ? " y " : ", ") : ""}<Link href={p.href} className="inicio-link">{p.label}</Link></span>)}
      </p>
    </section>
  );
}
