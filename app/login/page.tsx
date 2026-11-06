"use client";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { ArgosLogo } from "@/components/ArgosLogo";

export default function Login() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setError("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, password }) });
    if (r.ok) { location.href = "/"; return; }
    setError((await r.json().catch(() => ({})))?.error || "No se pudo iniciar sesión");
    setCargando(false);
  }

  return (
    <main className="min-h-screen grid place-items-center px-4" style={{ background: "radial-gradient(900px 500px at 15% 0%, color-mix(in srgb, #D81B60 9%, transparent), transparent 60%), radial-gradient(900px 500px at 90% 100%, color-mix(in srgb, #0E71AF 10%, transparent), transparent 60%), var(--bg)" }}>
      <div className="w-full max-w-sm space-y-6 entra">
        <div className="flex justify-center"><ArgosLogo alto={40} /></div>
        <form onSubmit={enviar} className="material p-7 space-y-5" style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-lg)" }}>
          <div className="space-y-1"><h1 className="text-2xl font-bold">Inicia sesión</h1>
            <p className="text-sm" style={{ color: "var(--fg-mute)" }}>Resultados electorales de México, del país a la sección.</p></div>
          <label className="block space-y-1.5"><span className="label">Usuario</span>
            <input className="field" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required /></label>
          <label className="block space-y-1.5"><span className="label">Contraseña</span>
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <p role="alert" className="text-sm font-semibold" style={{ color: "var(--bad)" }}>{error}</p>}
          <button className="btn w-full" disabled={cargando}><LogIn size={16} />{cargando ? "Entrando…" : "Entrar"}</button>
        </form>
        <p className="text-center text-xs" style={{ color: "var(--fg-mute)" }}>Argos · Electoral</p>
      </div>
    </main>
  );
}
