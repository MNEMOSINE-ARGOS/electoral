// Crea (o restablece) superusuarios en app_usuario con contraseña bcrypt y activo = true.
// Uso (desde electoral-app/):  bun scripts/crear_superusuarios.ts "correo1=Nombre Uno" "correo2=Nombre Dos" [--restablecer]
// Genera una contraseña temporal aleatoria por usuario y la imprime UNA vez (no se guarda en claro en ningún lado):
// entrégala por un canal seguro y pide que la cambien en «Cambiar mi contraseña».
// Sin --restablecer, un usuario que ya existe no se toca. Con --restablecer, se le asigna contraseña nueva, rol super y activo.
import { randomInt } from "node:crypto";
import { Pool } from "pg";
import { hashPassword, validarPassword } from "../lib/password";
import { RE_USUARIO } from "../lib/config";

const args = process.argv.slice(2);
const restablecer = args.includes("--restablecer");
const pares = args.filter((a) => !a.startsWith("--")).map((a) => { const [c, ...n] = a.split("="); return { usuario: c.trim().toLowerCase(), nombre: n.join("=").trim() || c.trim() }; });
if (!pares.length) { console.error('Uso: bun scripts/crear_superusuarios.ts "correo=Nombre" ... [--restablecer]'); process.exit(1); }
for (const p of pares) if (!RE_USUARIO.test(p.usuario)) { console.error(`Usuario inválido: ${p.usuario}`); process.exit(1); }

function generar(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz", D = "23456789", T = A + D;
  for (;;) {
    const p = Array.from({ length: 16 }, () => T[randomInt(T.length)]).join("");
    if (!validarPassword(p) && /[A-Z]/.test(p) && /[a-z]/.test(p)) return p;
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE IF NOT EXISTS app_usuario (
  id serial PRIMARY KEY, usuario text UNIQUE NOT NULL, nombre text NOT NULL,
  rol text NOT NULL DEFAULT 'usuario' CHECK (rol IN ('super','usuario')),
  password_hash text NOT NULL, activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(), creado_por text, ultimo_acceso timestamptz)`);
for (const p of pares) {
  const { rows } = await pool.query("SELECT id FROM app_usuario WHERE lower(usuario) = $1", [p.usuario]);
  if (rows.length && !restablecer) { console.log(`${p.usuario}: ya existe, no se modificó (usa --restablecer)`); continue; }
  const clave = generar();
  const hash = await hashPassword(clave);
  if (rows.length) await pool.query("UPDATE app_usuario SET password_hash = $1, rol = 'super', activo = true WHERE id = $2", [hash, rows[0].id]);
  else await pool.query("INSERT INTO app_usuario (usuario, nombre, rol, password_hash, activo, creado_por) VALUES ($1, $2, 'super', $3, true, 'script')", [p.usuario, p.nombre, hash]);
  console.log(`${p.usuario}\t${rows.length ? "restablecido" : "creado"}\tcontraseña temporal: ${clave}`);
}
await pool.end();
