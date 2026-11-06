// Los usuarios (superusuarios y usuarios) viven en la tabla app_usuario de la base, con contraseña en bcrypt y columna `activo`.
// Ya no hay superusuario fijo en el código. Para crear o restablecer superusuarios: `bun scripts/crear_superusuarios.ts` (ver ahí).
export const COOKIE_SESION = "electoral_sesion";
export const DURACION_SESION_S = 60 * 60 * 12; // 12 horas
/** Formato de usuario: correo electrónico, o nombre corto (letras, números, . _ -). */
export const RE_USUARIO = /^(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[a-z0-9._-]{3,32})$/;
