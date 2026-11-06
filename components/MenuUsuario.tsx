"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, Moon, ShieldCheck, Sun, UserCog, User, X } from "lucide-react";

type Yo = { usuario: string; nombre: string; rol: "super" | "usuario" };

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

function Avatar({ yo, tam }: { yo: Yo; tam: number }) {
  return (
    <span className="grid place-items-center rounded-full font-bold text-white shrink-0 select-none"
      style={{ width: tam, height: tam, fontSize: tam * 0.38, background: "linear-gradient(135deg, #D81B60 0%, #0E71AF 100%)", boxShadow: "0 0 0 2px var(--card-solid), 0 0 0 3px color-mix(in srgb, #D81B60 35%, transparent)" }}>
      {iniciales(yo.nombre)}
    </span>
  );
}

/** Menú de usuario: avatar con iniciales; al tocarlo, datos de la cuenta, tema y cerrar sesión. */
export function MenuUsuario({ yo, oscuro, onTema, onSalir }: { yo: Yo; oscuro: boolean; onTema: () => void; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, []);
  const rol = yo.rol === "super" ? "Superusuario" : "Usuario";
  const fila = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color,transform] duration-100 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] active:scale-[.98]";

  return (
    <div ref={caja} className="relative">
      <button onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-haspopup="menu" aria-label={`Cuenta de ${yo.nombre}`}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-[background-color,transform] duration-100 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] active:scale-[.97]">
        <Avatar yo={yo} tam={32} />
        <span className="hidden lg:block text-left leading-tight">
          <span className="block text-sm font-bold" style={{ color: "var(--fg)" }}>{yo.nombre}</span>
          <span className="block text-[11px] font-semibold" style={{ color: "var(--fg-mute)" }}>{rol}</span>
        </span>
        <ChevronDown size={15} className="transition-transform duration-200" style={{ color: "var(--fg-mute)", transform: abierto ? "rotate(180deg)" : undefined }} />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 mt-2 w-72 rounded-2xl p-2 entra origin-top-right"
          style={{ background: "var(--card-solid)", border: "1px solid var(--line-strong)", boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center gap-3 p-3">
            <Avatar yo={yo} tam={44} />
            <div className="min-w-0">
              <p className="font-bold truncate">{yo.nombre}</p>
              <p className="text-xs truncate" style={{ color: "var(--fg-mute)" }}>@{yo.usuario}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: yo.rol === "super" ? "var(--rose-soft)" : "var(--amber-soft)", color: yo.rol === "super" ? "var(--rose-deep)" : "var(--azul)" }}>
                {yo.rol === "super" ? <ShieldCheck size={12} /> : <User size={12} />}{rol}
              </span>
            </div>
          </div>
          <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
          {yo.rol === "super" && <Link href="/usuarios" className={fila} role="menuitem" onClick={() => setAbierto(false)}><UserCog size={17} style={{ color: "var(--fg-mute)" }} />Administrar usuarios</Link>}
          <button className={fila} role="menuitem" onClick={() => { setAbierto(false); setClave(true); }}><KeyRound size={17} style={{ color: "var(--fg-mute)" }} />Cambiar mi contraseña</button>
          <button className={fila} role="menuitem" onClick={onTema}>{oscuro ? <Sun size={17} style={{ color: "var(--fg-mute)" }} /> : <Moon size={17} style={{ color: "var(--fg-mute)" }} />}{oscuro ? "Modo claro" : "Modo oscuro"}</button>
          <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
          <button className={fila} role="menuitem" onClick={onSalir} style={{ color: "var(--rose)" }}><LogOut size={17} />Cerrar sesión</button>
        </div>
      )}
      {clave && <CambiarPassword onCerrar={() => setClave(false)} />}
    </div>
  );
}

function CambiarPassword({ onCerrar }: { onCerrar: () => void }) {
  const [f, setF] = useState({ actual: "", nueva: "", repite: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (f.nueva !== f.repite) { setMsg({ ok: false, t: "Las contraseñas nuevas no coinciden" }); return; }
    const r = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actual: f.actual, nueva: f.nueva }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setMsg({ ok: true, t: "Contraseña actualizada." }); setF({ actual: "", nueva: "", repite: "" }); } else setMsg({ ok: false, t: d.error || "Error" });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3" style={{ background: "rgba(2,6,23,.45)" }} onClick={onCerrar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="material w-full max-w-sm p-5 space-y-3" style={{ background: "var(--card-solid)" }}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Cambiar mi contraseña</h2>
          <button type="button" className="btn btn-ghost" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button></div>
        <label className="space-y-1 block"><span className="label">Contraseña actual</span><input className="field" type="password" autoComplete="current-password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} required /></label>
        <label className="space-y-1 block"><span className="label">Nueva (mín. 10, letras y números)</span><input className="field" type="password" autoComplete="new-password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} required minLength={10} /></label>
        <label className="space-y-1 block"><span className="label">Repite la nueva</span><input className="field" type="password" autoComplete="new-password" value={f.repite} onChange={(e) => setF({ ...f, repite: e.target.value })} required minLength={10} /></label>
        {msg && <p role="status" className="text-sm font-semibold" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.t}</p>}
        <button className="btn w-full justify-center">Guardar</button>
      </form>
    </div>
  );
}
