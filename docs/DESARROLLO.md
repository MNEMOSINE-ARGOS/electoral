# Argos · Electoral — guía de desarrollo

Panel de análisis de la base electoral de México por sección. Portada del proyecto: [README](../README.md). Guía completa para desarrollar (datos, métodos, seguridad, verificación): [`CLAUDE.md`](../CLAUDE.md).

**Stack:** Next.js 16 (App Router, `proxy.ts`) · React 19 · Tailwind 4 · Recharts · PostgreSQL (`pg`) · bcryptjs · Bun.

> Esta versión de Next.js trae cambios respecto a versiones anteriores (por ejemplo, `middleware` ahora es `proxy` y corre en Node). Antes de tocar el código, consulta `node_modules/next/dist/docs/` (ver [`AGENTS.md`](../AGENTS.md)).

## Correr

```bash
bun install
bun run dev        # http://localhost:3000
bun run build && bun run start
```

Variables de entorno (no se suben al repositorio):

| Variable | Archivo | Uso |
|---|---|---|
| `DATABASE_URL` | `.env` | PostgreSQL con las tablas `agg_*`, `sec_*`, `ln_*`, `jud_*`, `app_*` |
| `AUTH_SECRET` | `.env.local` | Clave para firmar la cookie de sesión (cadena aleatoria larga) |

Las tablas se cargan desde `Data/` con los scripts `scripts/db/preparar_app_*.py` (en el proyecto de datos, fuera de este repositorio).

## Usuarios

- Todos los usuarios están en `app_usuario`, con `rol` (`super` | `usuario`), `activo` (true/false) y contraseña **bcrypt** (costo 12).
- Solo los superusuarios ven `/usuarios`. Desde ahí crean usuarios, marcan o desmarcan *Activo*, cambian roles y restablecen contraseñas.
- `proxy.ts` confirma en cada petición que el usuario siga activo (caché de 30 s).
- Alta o restablecimiento de superusuarios desde la terminal:

  ```bash
  bun scripts/crear_superusuarios.ts "correo@dominio.com=Nombre Apellido" [--restablecer]
  ```

  Imprime una contraseña temporal una sola vez.

## Estructura

```
app/(app)/       pantallas: / · historico · municipios · estados · distritos · secciones · electorado · judicial · usuarios
app/api/         rutas de datos (unidades, presidencial, secciones, seccion, seccion-tendencia, distritos, judicial, …) y auth
components/      Buscador, Territorio, Piramide, PisoTecho, TendenciaSeccion, EdadSeccion, Enfoque, EstrategiaSecciones, …
lib/             analisis.ts (candidaturas, bloques, competitividad, enfoque) · tendencia.ts · pisoTecho.ts
                 db.ts · auth.ts · vigencia.ts · password.ts · consultas.ts · partidos.ts · cargos.ts
scripts/         crear_superusuarios.ts
proxy.ts         sesión y permisos
```

Las funciones de `lib/analisis.ts`, `lib/tendencia.ts` y `lib/pisoTecho.ts` son puras y producen **lecturas analíticas**, no resultados oficiales. `lib/tendencia.ts` replica exactamente `Data/scripts/db/preparar_app_tendencia.py`; se comprobó en 154 secciones al azar.
