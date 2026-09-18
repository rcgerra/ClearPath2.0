/** Whole-number formatting with thousands separators, e.g. 1234.5 -> "1,235". */
export function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
