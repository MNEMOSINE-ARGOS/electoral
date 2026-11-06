import { Pool } from "pg";

// Un solo pool por proceso (también en desarrollo, donde Next recarga los módulos).
const g = globalThis as unknown as { __pool?: Pool };

export function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL en el .env");
    g.__pool = new Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
    g.__pool.on("error", () => {
      /* una conexión inactiva murió: el pool abre otra */
    });
  }
  return g.__pool;
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query(sql, params);
  return r.rows as T[];
}

/** Crea la tabla de usuarios si no existe (la carga de datos también la crea). */
let listo: Promise<void> | null = null;
export function asegurarUsuarios(): Promise<void> {
  if (!listo) {
    listo = pool()
      .query(
        `CREATE TABLE IF NOT EXISTS app_usuario (
           id serial PRIMARY KEY, usuario text UNIQUE NOT NULL, nombre text NOT NULL,
           rol text NOT NULL DEFAULT 'usuario' CHECK (rol IN ('super','usuario')),
           password_hash text NOT NULL, activo boolean NOT NULL DEFAULT true,
           creado_en timestamptz NOT NULL DEFAULT now(), creado_por text, ultimo_acceso timestamptz)`,
      )
      .then(() => undefined);
  }
  return listo;
}
