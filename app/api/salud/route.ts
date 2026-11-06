import { NextResponse, connection } from "next/server";
import { Pool } from "pg";

// Diagnóstico de despliegue (público, sin secretos): ¿están las variables de entorno y responde PostgreSQL?
// GET /api/salud → { ok, variables: { DATABASE_URL, AUTH_SECRET }, base: { ok, host, ms, error, codigo, pista } }
// No devuelve contraseñas ni la cadena de conexión; solo host y puerto para confirmar a dónde intenta conectarse.
const PISTAS: Record<string, string> = {
  ECONNREFUSED: "El servidor respondió pero nadie escucha en ese puerto: revisa puerto y que PostgreSQL esté arriba.",
  ETIMEDOUT: "No hubo respuesta: un firewall bloquea la conexión desde este servidor (abre el puerto para su IP) o el host no es alcanzable desde el contenedor.",
  ENOTFOUND: "El nombre del host no se resuelve desde el contenedor.",
  EAI_AGAIN: "Falla de DNS en el contenedor.",
  "28P01": "Usuario o contraseña de PostgreSQL incorrectos.",
  "28000": "pg_hba.conf no permite conexiones desde la IP de este servidor.",
  "3D000": "La base de datos indicada no existe.",
  TIMEOUT: "No hubo respuesta en 8 s: casi siempre es un firewall que descarta la conexión.",
};

export async function GET() {
  await connection();
  const url = process.env.DATABASE_URL;
  const variables = { DATABASE_URL: !!url, AUTH_SECRET: !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16 };
  let host: string | null = null;
  try { const u = new URL(url ?? ""); host = `${u.hostname}:${u.port || 5432}`; } catch {}
  const base: { ok: boolean; host: string | null; ms: number | null; error: string | null; codigo: string | null; pista: string | null } =
    { ok: false, host, ms: null, error: null, codigo: null, pista: null };
  if (url) {
    const t = Date.now();
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000 });
    try {
      await pool.query("SELECT 1");
      const [{ n }] = (await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('sec_resumen','app_usuario','app_estado')")).rows;
      base.ok = n === 3;
      if (!base.ok) { base.error = `Conecta, pero faltan tablas de la app (${n} de 3)`; base.pista = "La base existe pero no tiene los datos cargados."; }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = err.message ?? String(e);
      base.codigo = err.code ?? (/timeout/i.test(msg) ? "TIMEOUT" : null);
      base.error = msg.replace(/postgres(ql)?:\/\/[^\s]+/g, "[url]").slice(0, 200);
      base.pista = (base.codigo && PISTAS[base.codigo]) || null;
    } finally {
      base.ms = Date.now() - t;
      await pool.end().catch(() => {});
    }
  } else base.error = "DATABASE_URL no está definida en el entorno de ejecución";
  const ok = variables.DATABASE_URL && variables.AUTH_SECRET && base.ok;
  return NextResponse.json({ ok, variables, base }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
