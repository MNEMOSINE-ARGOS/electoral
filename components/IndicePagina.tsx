"use client";
import { useEffect, useState } from "react";

// Índice de una pantalla larga: barra pegada arriba con un enlace por bloque, que salta a él y marca en cuál vas.
// Cada bloque lleva su `id` en la pantalla; solo se muestran los que están dibujados (muchos dependen del territorio o del año).
// En el celular no se pega (la barra superior ya ocupa mucho alto).

export type ItemIndice = { id: string; t: string };

export function IndicePagina({ items }: { items: ItemIndice[] }) {
  const [presentes, setPresentes] = useState<ItemIndice[]>([]);
  const [actual, setActual] = useState("");
  const firma = items.map((i) => `${i.id}:${i.t}`).join("|");

  // Qué bloques existen ahora (aparecen y desaparecen al cambiar cargo, año o territorio)
  useEffect(() => {
    const revisar = () => {
      const p = items.filter((i) => (document.getElementById(i.id)?.childElementCount ?? 0) > 0); // un contenedor vacío no cuenta
      setPresentes((prev) => (prev.map((x) => x.id + x.t).join() === p.map((x) => x.id + x.t).join() ? prev : p));
    };
    revisar();
    const mo = new MutationObserver(revisar);
    mo.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [firma]); // eslint-disable-line react-hooks/exhaustive-deps

  // En qué bloque vas: el último cuyo borde superior ya pasó bajo la barra
  useEffect(() => {
    let pendiente = false;
    const medir = () => {
      pendiente = false;
      let cual = "";
      for (const i of presentes) { const el = document.getElementById(i.id); if (el && el.getBoundingClientRect().top <= 160) cual = i.id; }
      setActual(cual);
    };
    const alMover = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener("scroll", alMover, { passive: true });
    window.addEventListener("resize", alMover);
    return () => { window.removeEventListener("scroll", alMover); window.removeEventListener("resize", alMover); };
  }, [presentes]);

  if (presentes.length < 2) return null;
  function ir(e: React.MouseEvent, id: string) {
    e.preventDefault();
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  }
  return (
    <nav className="indice-pagina material" aria-label="En esta pantalla">
      <span className="label shrink-0">En esta pantalla</span>
      <div className="flex gap-1.5 overflow-x-auto">
        {presentes.map((i) => (
          <a key={i.id} href={`#${i.id}`} className="chip shrink-0" aria-current={actual === i.id ? "true" : undefined} onClick={(e) => ir(e, i.id)}>{i.t}</a>
        ))}
      </div>
    </nav>
  );
}
