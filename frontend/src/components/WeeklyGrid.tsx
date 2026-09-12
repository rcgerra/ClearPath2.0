import { useState } from 'react';
import { weekLabel } from '../utils/arrayParser';

interface Props {
  values: number[];
  startWeek?: number;
  weekCount?: number;
  readOnly?: boolean;
  /** Weeks where the value exceeds available capacity are highlighted. */
  overAllocated?: number[];
  onChange?: (week: number, hours: number) => void;
}

/** Editable strip of weekly hours backed by the 2-digit encoded array. */
export default function WeeklyGrid({
  values,
  startWeek = 0,
  weekCount = 16,
  readOnly = false,
  overAllocated = [],
  onChange,
}: Props) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const overSet = new Set(overAllocated);

  return (
    <div className="week-grid">
      {Array.from({ length: weekCount }, (_, offset) => {
        const week = startWeek + offset;
        const value = draft[week] ?? String(values[week] ?? 0);
        return (
          <div key={week} className={`week-cell${overSet.has(week) ? ' over' : ''}`}>
            <div className="week-label">{weekLabel(week)}</div>
            <input
              type="number"
              min={0}
              max={99}
              value={value}
              readOnly={readOnly}
              onChange={(event) => setDraft((prev) => ({ ...prev, [week]: event.target.value }))}
              onBlur={(event) => {
                if (readOnly) return;
                const hours = Math.max(0, Math.min(99, Math.round(Number(event.target.value) || 0)));
                setDraft((prev) => {
                  const next = { ...prev };
                  delete next[week];
                  return next;
                });
                if (hours !== (values[week] ?? 0)) onChange?.(week, hours);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
