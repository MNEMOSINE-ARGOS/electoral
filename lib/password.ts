// Contraseñas con bcrypt (bcryptjs, costo 12). El hash guarda su propia sal y su costo: «$2b$12$…».
import bcrypt from "bcryptjs";

export const COSTO_BCRYPT = 12;
export const MIN_PASSWORD = 10;

export async function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, COSTO_BCRYPT);
}

export async function verificarPassword(p: string, guardado: string | null | undefined): Promise<boolean> {
  if (!guardado || !/^\$2[aby]\$\d{2}\$/.test(guardado)) return false;
  return bcrypt.compare(p, guardado);
}

/** Hash con el que se compara cuando el usuario no existe: así la respuesta tarda lo mismo y no revela qué usuarios existen. */
let falso: Promise<string> | null = null;
export function hashFalso(): Promise<string> {
  return (falso ??= bcrypt.hash("no-existe-" + Math.random(), COSTO_BCRYPT));
}

/** Reglas mínimas de contraseña. Devuelve el error o null. */
export function validarPassword(p: string | undefined): string | null {
  if (!p || p.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  if (p.length > 72) return "La contraseña no puede pasar de 72 caracteres (límite de bcrypt)";
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "La contraseña debe combinar letras y números";
  return null;
}
