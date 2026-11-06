export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-MX"));
export const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !isFinite(n) ? "—" : `${n.toFixed(d)}%`);
export const compacto = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n));
