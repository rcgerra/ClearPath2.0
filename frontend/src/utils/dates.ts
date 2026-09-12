const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** dd-MMM-yy, e.g. 07-Sep-26. Dates are treated as UTC so day-only values never shift. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day}-${MONTHS[date.getUTCMonth()]}-${String(date.getUTCFullYear()).slice(2)}`;
}

/** dd-MMM, for dense column headers. */
export function formatDayMonth(value?: string | Date | null): string {
  const full = formatDate(value);
  return full === '—' ? full : full.slice(0, 6);
}
