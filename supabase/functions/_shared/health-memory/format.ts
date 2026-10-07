/** Deterministic, locale-independent formatting for generated neutral text. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string | null): string {
  if (!iso) return 'an undated record';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Numbers as recorded: no rounding beyond what's needed to drop float noise. */
export function formatNumber(n: number): string {
  return String(Number(n.toPrecision(12)));
}

export function withUnit(value: string, unit: string | null): string {
  if (!unit) return value;
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}
