/** Whole-number formatting with thousands separators, e.g. 1234.5 -> "1,235". */
export function formatCount(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '—';

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';

  return Math.round(numeric).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
