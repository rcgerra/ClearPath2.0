import { useEffect, useRef, useState } from 'react';
import { weekLabel, weekLabelShort } from '../utils/arrayParser';

export interface TeamDemandSeries {
  id: string;
  label: string;
  weeks: number[];
}

interface Props {
  weeks: number;
  /** One stacked segment per person. */
  series: TeamDemandSeries[];
  /** Stepped line: total availability across the filtered people. */
  availability: number[];
  /** Row id currently selected in the table, emphasized in the stack. */
  selectedId?: string | null;
  /** Called with the person's id when their legend entry or bar segment is clicked. */
  onSelect?: (id: string) => void;
  height?: number;
}

const FALLBACK_COL_WIDTH = 16;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PAD_LEFT = 10;

const PALETTE = [
  'var(--sorairo-blue)',
  'var(--matsuba-green)',
  'var(--yamabuki-yellow)',
  'var(--fuji-purple)',
  'var(--asagi-blue)',
  'var(--sakura-pink)',
  'var(--akane-red)',
  'var(--takeda-red)',
];

/** Stacked per-person demand columns against a stepped total-availability line. Column width flexes to fill the container. */
export default function TeamDemandChart({ weeks, series, availability, selectedId, onSelect, height = 240 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const colWidth = containerWidth > 0 ? Math.max(4, (containerWidth - PAD_LEFT - 12) / weeks) : FALLBACK_COL_WIDTH;
  const width = PAD_LEFT + weeks * colWidth + 12;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const totals = Array.from({ length: weeks }, (_, index) =>
    series.reduce((sum, entry) => sum + (entry.weeks[index] ?? 0), 0),
  );
  const peak = Math.max(1, ...totals, ...availability.slice(0, weeks));
  const scale = (value: number) => (value / peak) * plotHeight;
  const y = (value: number) => PAD_TOP + plotHeight - scale(value);

  const ticks = [0, 0.5, 1].map((fraction) => Math.round(peak * fraction));
  const labelEvery = weeks > 60 ? 8 : 4;
  const hasSelection = Boolean(selectedId);

  const stepPoints = Array.from({ length: weeks }, (_, index) => {
    const x = PAD_LEFT + index * colWidth;
    const value = availability[index] ?? 0;
    return `${x},${y(value)} ${x + colWidth},${y(value)}`;
  }).join(' ');

  return (
    <div className="chart-scroll" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label="Weekly demand by person against total availability">
        {ticks.map((tick) => (
          <line key={tick} x1={PAD_LEFT} x2={width - 6} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
        ))}

        {Array.from({ length: weeks }, (_, index) => {
          const x = PAD_LEFT + index * colWidth + 2;
          const barWidth = Math.max(1, colWidth - 4);
          const total = totals[index];
          const available = availability[index] ?? 0;
          let cumulative = 0;

          return (
            <g key={index}>
              {series.map((entry, seriesIndex) => {
                const value = entry.weeks[index] ?? 0;
                const bottom = cumulative;
                cumulative += value;
                if (value <= 0) return null;
                const isSelected = entry.id === selectedId;
                return (
                  <rect
                    key={entry.id}
                    x={x}
                    y={y(bottom + value)}
                    width={barWidth}
                    height={scale(value)}
                    style={{
                      fill: PALETTE[seriesIndex % PALETTE.length],
                      opacity: hasSelection && !isSelected ? 0.3 : 1,
                      stroke: isSelected ? 'var(--dark-grey)' : 'none',
                      strokeWidth: isSelected ? 1 : 0,
                      cursor: onSelect ? 'pointer' : undefined,
                    }}
                    onClick={() => onSelect?.(entry.id)}
                  >
                    <title>{`${entry.label}\nWeek of ${weekLabel(index)}\nDemand: ${value} h`}</title>
                  </rect>
                );
              })}
              {total > 0 && (
                <text
                  x={PAD_LEFT + index * colWidth + colWidth / 2}
                  y={y(total) - 4}
                  className="chart-value-label"
                  textAnchor="middle"
                >
                  {total}
                </text>
              )}
              {/* Only label where availability changes, so the step line stays readable. */}
              {available !== (availability[index - 1] ?? null) && (
                <text x={PAD_LEFT + index * colWidth + 2} y={y(available) - 5} className="chart-availability-label">
                  {available}
                </text>
              )}
              {index % labelEvery === 0 && (
                <text
                  x={PAD_LEFT + index * colWidth + colWidth / 2}
                  y={height - PAD_BOTTOM + 16}
                  className="chart-axis-label"
                  textAnchor="middle"
                >
                  {weekLabelShort(index)}
                </text>
              )}
            </g>
          );
        })}

        <polyline points={stepPoints} className="chart-step chart-step-dotted" />
        <line x1={PAD_LEFT} x2={width - 6} y1={PAD_TOP + plotHeight} y2={PAD_TOP + plotHeight} className="chart-axis" />
      </svg>

      <div className="chart-legend team-chart-legend">
        {series.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            className="legend-entry legend-entry-button"
            style={{ opacity: hasSelection && entry.id !== selectedId ? 0.5 : 1 }}
            onClick={() => onSelect?.(entry.id)}
          >
            <span className="legend-swatch" style={{ background: PALETTE[index % PALETTE.length] }} />
            {entry.label}
          </button>
        ))}
        <span className="legend-entry">
          <span className="legend-swatch availability" /> Total availability
        </span>
      </div>
    </div>
  );
}
