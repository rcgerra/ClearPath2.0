/**
 * Weekly planning arrays are stored as fixed-width 2-digit positions.
 * Position N (0-based) holds the hours (0-99) planned for week N.
 */
export const DIGITS_PER_POSITION = 2;
export const MAX_POSITIONS = 1333;
export const MAX_VALUE = 99;

export function encodeArray(values: number[], positions: number = MAX_POSITIONS): string {
  if (values.length > positions) {
    throw new Error(`Array exceeds ${positions} weekly positions.`);
  }
  const padded = [...values, ...new Array(Math.max(0, positions - values.length)).fill(0)];
  return padded
    .map((raw) => {
      const value = Math.round(Number(raw) || 0);
      if (value < 0 || value > MAX_VALUE) {
        throw new Error(`Weekly value ${value} is outside the 0-${MAX_VALUE} range.`);
      }
      return String(value).padStart(DIGITS_PER_POSITION, '0');
    })
    .join('');
}

export function decodeArray(encoded: string | null | undefined, positions: number = MAX_POSITIONS): number[] {
  if (!encoded) return new Array(positions).fill(0);
  const clean = encoded.trim();
  if (!/^\d*$/.test(clean)) {
    throw new Error('Encoded weekly array must contain digits only.');
  }
  const result: number[] = [];
  for (let i = 0; i < positions; i += 1) {
    const chunk = clean.slice(i * DIGITS_PER_POSITION, i * DIGITS_PER_POSITION + DIGITS_PER_POSITION);
    result.push(chunk.length === DIGITS_PER_POSITION ? Number.parseInt(chunk, 10) : 0);
  }
  return result;
}

export function getWeekValue(encoded: string | null | undefined, week: number): number {
  if (week < 0 || week >= MAX_POSITIONS) throw new Error(`Week index ${week} is out of range.`);
  if (!encoded) return 0;
  const chunk = encoded.slice(week * DIGITS_PER_POSITION, week * DIGITS_PER_POSITION + DIGITS_PER_POSITION);
  return chunk.length === DIGITS_PER_POSITION ? Number.parseInt(chunk, 10) : 0;
}

export function setWeekValue(
  encoded: string | null | undefined,
  week: number,
  value: number,
  positions: number = MAX_POSITIONS,
): string {
  const values = decodeArray(encoded, positions);
  if (week < 0 || week >= positions) throw new Error(`Week index ${week} is out of range.`);
  values[week] = value;
  return encodeArray(values, positions);
}

export function setWeekRange(
  encoded: string | null | undefined,
  startWeek: number,
  endWeek: number,
  value: number,
  positions: number = MAX_POSITIONS,
): string {
  const values = decodeArray(encoded, positions);
  for (let week = startWeek; week <= endWeek; week += 1) {
    if (week < 0 || week >= positions) throw new Error(`Week index ${week} is out of range.`);
    values[week] = value;
  }
  return encodeArray(values, positions);
}

export function sumRange(encoded: string | null | undefined, startWeek: number, endWeek: number): number {
  const values = decodeArray(encoded);
  return values.slice(startWeek, endWeek + 1).reduce((total, value) => total + value, 0);
}

/** Element-wise subtraction of demand from availability, clamped at 0. */
export function remainingCapacity(availability: string | null | undefined, demand: string | null | undefined): number[] {
  const avail = decodeArray(availability);
  const dem = decodeArray(demand);
  return avail.map((value, index) => Math.max(0, value - (dem[index] ?? 0)));
}

/** Sums many encoded arrays position-by-position (values are clamped to the 0-99 storage limit). */
export function aggregateArrays(encodedList: Array<string | null | undefined>): number[] {
  const total = new Array(MAX_POSITIONS).fill(0);
  for (const encoded of encodedList) {
    const values = decodeArray(encoded);
    for (let i = 0; i < MAX_POSITIONS; i += 1) total[i] += values[i];
  }
  return total;
}

/** ISO week index relative to a planning epoch (Monday of the epoch week is index 0). */
export function weekIndexFromDate(date: Date, epoch: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const startOfWeek = (d: Date) => {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - day);
    return copy;
  };
  return Math.round((startOfWeek(date).getTime() - startOfWeek(epoch).getTime()) / msPerWeek);
}
