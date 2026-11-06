"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { UserCog, Moon, Sun, LogOut, PanelLeft } from "lucide-react";
import { GRUPOS, INICIO, type Pantalla } from "@/lib/navegacion";
import { ArgosLogo } from "@/components/ArgosLogo";
import { MenuUsuario } from "@/components/MenuUsuario";
import { EnfoqueProvider, SelectorEnfoque } from "@/components/Enfoque";

type Yo = { usuario: string; nombre: string; rol: "super" | "usuario" };
const NAV = [{ titulo: "Guía", items: [INICIO] }, ...GRUPOS];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [yo, setYo] = useState<Yo | null>(null);
  const [oscuro, setOscuro] = useState(false);
  const [lateral, setLateral] = useState(true); // true = completa; false = solo iconos
  useEffect(() => {
    // En pantallas medianas (lg) la barra arranca en modo mini para que el contenido quepa
    try { const g = localStorage.getItem("lateral"); setLateral(g ? g === "1" : window.innerWidth >= 1280); } catch { setLateral(window.innerWidth >= 1280); }
  }, []);
  function alternar() { setLateral((v) => { try { localStorage.setItem("lateral", v ? "0" : "1"); } catch {} return !v; }); }

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setYo(d));
    setOscuro(document.documentElement.dataset.theme === "dark");
  }, []);
  function tema() {
    const n = oscuro ? "light" : "dark";
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem("tema", n); } catch {}
    setOscuro(!oscuro);
  }
  async function salir() { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login"; }
  const admin: Pantalla = { href: "/usuarios", label: "Usuarios", icon: UserCog, color: "#64748b", resumen: "", preguntas: [], contiene: [] };
  const grupos = yo?.rol === "super" ? [...NAV, { titulo: "Administración", items: [admin] }] : NAV;
  const todos = grupos.flatMap((g) => g.items);
  const activo = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const actual = todos.find((i) => activo(i.href));
  const ghost = "grid size-9 place-items-center rounded-full transition-[background-color,transform] duration-100 active:scale-95 hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]";

  return (
    <EnfoqueProvider>
    <div className="min-h-screen">
      <header className="material-bar sticky top-0 z-40 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="flex h-14 items-center justify-between gap-3 px-3 md:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <button className={`${ghost} hidden md:grid`} onClick={alternar} aria-label={lateral ? "Contraer la barra lateral" : "Expandir la barra lateral"} style={{ color: "var(--fg-mute)" }}><PanelLeft size={18} /></button>
            <Link href="/inicio" aria-label="Inicio" className="rounded-lg px-1 py-1 active:scale-[.98] transition-transform"><ArgosLogo alto={26} /></Link>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="hidden sm:block"><SelectorEnfoque /></div>
            {actual && <span className="hidden 2xl:block text-sm font-semibold mr-2" style={{ color: "var(--fg-mute)" }} aria-live="polite">{actual.label}</span>}
            <button className={ghost} onClick={tema} aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} style={{ color: "var(--fg-mute)" }}>{oscuro ? <Sun size={18} /> : <Moon size={18} />}</button>
            <span className="mx-1 h-6 w-px" style={{ background: "var(--line-strong)" }} />
            {yo ? <MenuUsuario yo={yo} oscuro={oscuro} onTema={tema} onSalir={salir} />
              : <button className={ghost} onClick={salir} aria-label="Cerrar sesión" style={{ color: "var(--fg-mute)" }}><LogOut size={17} /></button>}
          </div>
        </div>
        <div className="sm:hidden px-3 pb-2 overflow-x-auto"><SelectorEnfoque /></div>
        <nav className="md:hidden flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Secciones">
          {todos.map(({ href, label, icon: I }) => (
            <Link key={href} href={href} className="chip shrink-0" aria-pressed={activo(href)}><I size={14} />{label}</Link>
          ))}
        </nav>
      </header>
      <div className="flex">
        <aside className={`hidden md:block sticky top-14 h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto overflow-x-hidden py-5 border-r transition-[width] duration-300 ease-out ${lateral ? "w-64 px-3" : "w-[4.5rem] px-2 nav-mini"}`}
          style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--card-solid) 55%, transparent)" }}>
          <nav className="space-y-5" aria-label="Secciones">
            {grupos.map((g) => (
              <div key={g.titulo} className="space-y-0.5">
                {lateral ? <p className="label px-3 pb-1.5">{g.titulo}</p> : <div className="mx-3 mb-2 border-t" style={{ borderColor: "var(--line)" }} />}
                {g.items.map(({ href, label, icon: I, color }) => {
                  const a = activo(href);
                  return (
                    <Link key={href} href={href} aria-current={a ? "page" : undefined} title={lateral ? undefined : label} aria-label={label}
                      className="nav-item" style={{ ["--nav-color" as string]: color }}>
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-opacity" style={{ background: color, opacity: a ? 1 : 0 }} />
                      <I size={22} strokeWidth={2} />
                      {lateral && <span className="truncate">{label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 px-3 py-5 md:px-8 md:py-7 space-y-6 max-w-[1560px] mx-auto">{children}</main>
      </div>
    </div>
    </EnfoqueProvider>
  );
}
