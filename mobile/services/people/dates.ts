/** Day / month / year typed as numbers → `YYYY-MM-DD`. All empty → null (not provided). Anything else invalid → undefined. */
export function toIsoDate(day: string, month: string, year: string, today: Date = new Date()): string | null | undefined {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (!d && !m && !y) return null;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return undefined;
  const dd = Number(d);
  const mm = Number(m);
  const yy = Number(y);
  if (yy < 1900 || mm < 1 || mm > 12 || dd < 1) return undefined;
  const probe = new Date(Date.UTC(yy, mm - 1, dd));
  if (probe.getUTCFullYear() !== yy || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) return undefined;
  if (probe.getTime() > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) return undefined;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
