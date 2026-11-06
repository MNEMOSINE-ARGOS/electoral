// ¿La sesión sigue siendo válida? La cookie firmada dura 12 h; aquí se confirma contra la base que el usuario siga existiendo y
// esté ACTIVO, y se toma su rol actual (así desactivar o cambiar de rol surte efecto sin esperar a que caduque la cookie).
// Caché de 30 s por usuario para no consultar la base en cada petición.
import { asegurarUsuarios, q } from "./db";
import { sesionDe, verificarSesion, type Sesion } from "./auth";

type Estado = { rol: "super" | "usuario"; activo: boolean; nombre: string } | null;
const cache = new Map<string, { t: number; e: Estado }>();
const TTL_MS = 30_000;

export function olvidarUsuario(usuario: string) { cache.delete(usuario.toLowerCase()); }

export async function estadoUsuario(usuario: string): Promise<Estado> {
  const k = usuario.toLowerCase();
  const c = cache.get(k);
  if (c && Date.now() - c.t < TTL_MS) return c.e;
  await asegurarUsuarios();
  const [f] = await q<{ rol: "super" | "usuario"; activo: boolean; nombre: string }>("SELECT rol, activo, nombre FROM app_usuario WHERE lower(usuario) = $1", [k]);
  const e = f ?? null;
  cache.set(k, { t: Date.now(), e });
  return e;
}

async function vigente(s: Sesion | null): Promise<Sesion | null> {
  if (!s) return null;
  const e = await estadoUsuario(s.usuario);
  if (!e || !e.activo) return null;
  return { ...s, rol: e.rol, nombre: e.nombre };
}

/** Sesión firmada + usuario activo en la base (con su rol vigente), o null. */
export async function sesionVigenteDeToken(token: string | undefined | null): Promise<Sesion | null> {
  return vigente(await verificarSesion(token));
}
export async function sesionVigente(req: Request): Promise<Sesion | null> {
  return vigente(await sesionDe(req));
}
