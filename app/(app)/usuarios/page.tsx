"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Trash2, User, UserPlus } from "lucide-react";

type U = { id: number; usuario: string; nombre: string; rol: "super" | "usuario"; activo: boolean; creado_por: string | null; creado_en: string; ultimo_acceso: string | null };
const VACIO = { usuario: "", nombre: "", password: "", rol: "usuario" as "super" | "usuario", activo: true };

export default function Usuarios() {
  const [lista, setLista] = useState<U[] | null>(null);
  const [yo, setYo] = useState("");
  const [prohibido, setProhibido] = useState(false);
  const [f, setF] = useState(VACIO);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/usuarios");
    if (r.status === 403) { setProhibido(true); return; }
    if (r.ok) { const d = await r.json(); setLista(d.usuarios); setYo(d.yo); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiar(u: U, cambios: Partial<U> & { password?: string }, aviso: string) {
    setMsg(null);
    const r = await fetch(`/api/usuarios/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, t: aviso } : { ok: false, t: d.error || "Error" });
    cargar();
  }
  async function crear(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const r = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setMsg({ ok: true, t: `Usuario «${f.usuario}» creado${f.activo ? "" : " (inactivo)"}.` }); setF(VACIO); cargar(); }
    else setMsg({ ok: false, t: d.error || "Error" });
  }
  async function restablecer(u: U) {
    const p = prompt(`Nueva contraseña para ${u.usuario} (mín. 10 caracteres, letras y números):`);
    if (p) cambiar(u, { password: p }, `Contraseña de ${u.usuario} restablecida.`);
  }
  async function borrar(u: U) {
    if (!confirm(`¿Eliminar a ${u.usuario}? No se puede deshacer. (Para quitarle el acceso sin borrarlo, desmarca «Activo».)`)) return;
    const r = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, t: `${u.usuario} eliminado.` } : { ok: false, t: d.error || "Error" });
    cargar();
  }

  if (prohibido) return <p className="material p-6">Solo un superusuario puede administrar usuarios.</p>;
  const activos = (lista ?? []).filter((u) => u.activo).length;
  return (
    <>
      <header className="space-y-1"><h1 className="text-3xl md:text-[2.6rem] font-bold">Usuarios</h1>
        <p style={{ color: "var(--fg-soft)" }}>Los superusuarios crean y administran usuarios. Los usuarios consultan los datos, pero no ven esta pantalla. Desmarca «Activo» para quitarle el acceso a alguien sin borrarlo (su sesión se cierra en menos de un minuto).</p></header>

      <form onSubmit={crear} className="material p-4 space-y-3">
        <p className="label">Crear usuario</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_auto_auto_auto] gap-3 items-end">
          <label className="space-y-1"><span className="label">Usuario (correo)</span><input className="field" type="text" autoComplete="off" placeholder="nombre@correo.com" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} required /></label>
          <label className="space-y-1"><span className="label">Nombre</span><input className="field" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></label>
          <label className="space-y-1"><span className="label">Contraseña (mín. 10, letras y números)</span><input className="field" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={10} /></label>
          <label className="space-y-1"><span className="label">Rol</span>
            <select className="field" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as "super" | "usuario" })}><option value="usuario">Usuario</option><option value="super">Superusuario</option></select></label>
          <label className="flex items-center gap-2 pb-2.5 text-sm font-semibold"><input type="checkbox" className="size-4" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activo</label>
          <button className="btn"><UserPlus size={16} />Crear</button>
        </div>
        {msg && <p role="status" className="text-sm font-semibold" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.t}</p>}
      </form>

      <section className="material p-4 overflow-x-auto space-y-2">
        <p className="label">{lista ? `${lista.length} usuarios · ${activos} activos` : "Cargando…"}</p>
        <table className="t">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Creado por</th><th>Último acceso</th><th /></tr></thead>
          <tbody>
            {lista?.length === 0 && <tr><td colSpan={7}>Aún no hay usuarios.</td></tr>}
            {lista?.map((u) => {
              const propio = u.usuario === yo;
              return (
                <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.6 }}>
                  <td className="font-bold">{u.usuario}{propio && <span className="text-xs font-semibold" style={{ color: "var(--fg-mute)" }}> (tú)</span>}</td>
                  <td><button className="text-left hover:underline" title="Cambiar nombre" onClick={() => { const n = prompt(`Nombre de ${u.usuario}:`, u.nombre); if (n && n.trim() !== u.nombre) cambiar(u, { nombre: n }, `Nombre actualizado.`); }}>{u.nombre}</button></td>
                  <td>
                    <select className="field !py-1 !w-auto text-sm" value={u.rol} disabled={propio} aria-label={`Rol de ${u.usuario}`}
                      onChange={(e) => cambiar(u, { rol: e.target.value as "super" | "usuario" }, `${u.usuario} ahora es ${e.target.value === "super" ? "superusuario" : "usuario"}.`)}>
                      <option value="usuario">Usuario</option><option value="super">Superusuario</option>
                    </select>
                    {u.rol === "super" ? <ShieldCheck size={14} className="inline ml-1.5" style={{ color: "var(--rose)" }} /> : <User size={14} className="inline ml-1.5" style={{ color: "var(--fg-mute)" }} />}
                  </td>
                  <td>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="checkbox" className="size-4" checked={u.activo} disabled={propio} aria-label={`${u.usuario} activo`}
                        onChange={(e) => cambiar(u, { activo: e.target.checked }, `${u.usuario} ${e.target.checked ? "activado" : "desactivado"}.`)} />
                      <span style={{ color: u.activo ? "var(--ok)" : "var(--bad)" }}>{u.activo ? "true" : "false"}</span>
                    </label>
                  </td>
                  <td>{u.creado_por ?? "—"}</td>
                  <td>{u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString("es-MX") : "nunca"}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn btn-ghost" onClick={() => restablecer(u)} aria-label={`Restablecer contraseña de ${u.usuario}`} title="Restablecer contraseña"><KeyRound size={15} /></button>
                    {!propio && <button className="btn btn-ghost" onClick={() => borrar(u)} aria-label={`Eliminar a ${u.usuario}`} title="Eliminar"><Trash2 size={15} /></button>}
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
        <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Contraseñas guardadas con bcrypt (costo 12); nadie, ni los superusuarios, puede verlas: solo restablecerlas. No puedes desactivarte, quitarte el rol ni eliminarte a ti mismo, y siempre debe quedar al menos un superusuario activo.</p>
      </section>
    </>
  );
}
