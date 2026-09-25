/** Mirror of the backend weekly array codec: fixed-width 2-digit positions. */
import { formatDate, formatDayMonth } from './dates';

export const DIGITS_PER_POSITION = 2;
export const MAX_POSITIONS = 1333;
export const MAX_VALUE = 99;
export const PLANNING_HORIZONS = [4, 13, 26, 52, 104] as const;

export function encodeArray(values: number[], positions: number = MAX_POSITIONS): string {
  if (values.length > positions) throw new Error(`Array exceeds ${positions} weekly positions.`);
  const padded = [...values, ...new Array(Math.max(0, positions - values.length)).fill(0)];
  return padded
    .map((raw) => {
      const value = Math.round(Number(raw) || 0);
      if (value < 0 || value > MAX_VALUE) throw new Error(`Weekly value ${value} is outside 0-${MAX_VALUE}.`);
      return String(value).padStart(DIGITS_PER_POSITION, '0');
    })
    .join('');
}

export function decodeArray(encoded: string | null | undefined, positions: number = MAX_POSITIONS): number[] {
  if (!encoded) return new Array(positions).fill(0);
  const result: number[] = [];
  for (let i = 0; i < positions; i += 1) {
    const chunk = encoded.slice(i * DIGITS_PER_POSITION, i * DIGITS_PER_POSITION + DIGITS_PER_POSITION);
    result.push(chunk.length === DIGITS_PER_POSITION ? Number.parseInt(chunk, 10) : 0);
  }
  return result;
}

export function getWeekValue(encoded: string | null | undefined, week: number): number {
  if (!encoded) return 0;
  const chunk = encoded.slice(week * DIGITS_PER_POSITION, week * DIGITS_PER_POSITION + DIGITS_PER_POSITION);
  return chunk.length === DIGITS_PER_POSITION ? Number.parseInt(chunk, 10) : 0;
}

export function setWeekValue(encoded: string | null | undefined, week: number, value: number): string {
  const values = decodeArray(encoded);
  values[week] = value;
  return encodeArray(values);
}

export function sumWeeks(values: number[], startWeek: number, endWeek: number): number {
  return values.slice(startWeek, endWeek + 1).reduce((total, value) => total + value, 0);
}

export function weekValue(values: number[], weekIndex: number, pastValues?: number[]): number {
  return weekIndex < 0 ? pastValues?.[-weekIndex - 1] ?? 0 : values[weekIndex] ?? 0;
}

/** Monday of the current ISO week, used as week index 0 for display. */
export function currentWeekStart(): Date {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

export function weekLabel(weekIndex: number, epoch: Date = currentWeekStart()): string {
  const date = new Date(epoch);
  date.setUTCDate(date.getUTCDate() + weekIndex * 7);
  return formatDate(date);
}

/** Monday of the given week as dd-MMM, for dense headers. */
export function weekLabelShort(weekIndex: number, epoch: Date = currentWeekStart()): string {
  const date = new Date(epoch);
  date.setUTCDate(date.getUTCDate() + weekIndex * 7);
  return formatDayMonth(date);
}

/** Calendar year the given week's Monday falls in, used to shade weekly headers by year. */
export function weekYear(weekIndex: number, epoch: Date = currentWeekStart()): number {
  const date = new Date(epoch);
  date.setUTCDate(date.getUTCDate() + weekIndex * 7);
  return date.getUTCFullYear();
}
