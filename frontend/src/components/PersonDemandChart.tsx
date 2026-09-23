import { useEffect, useRef, useState } from 'react';
import { weekLabel, weekLabelShort } from '../utils/arrayParser';

interface Props {
  weeks: number;
  /** Demand from the project being viewed. */
  thisProject: number[];
  /** Demand from every other project combined. */
  otherProjects: number[];
  availability: number[];
  height?: number;
  thisLabel?: string;
  otherLabel?: string;
  thisColor?: string;
  otherColor?: string;
  /** Hide the upper band when there is no "this project" split to show. */
  showThis?: boolean;
  /** Pin the y-axis to a fixed maximum instead of scaling to the data. */
  maxY?: number;
  /** Highlights total-demand bars above the department alert threshold. */
  alertThreshold?: number;
}

const FALLBACK_COL_WIDTH = 16;
const PAD_TOP = 30;
const PAD_BOTTOM = 34;
const PAD_LEFT = 10;

/** Stacked demand columns against a stepped availability line. Column width flexes to fill the container. */
export default function PersonDemandChart({
  weeks,
  thisProject,
  otherProjects,
  availability,
  height = 240,
  thisLabel = 'This project',
  otherLabel = 'All other projects',
  thisColor = 'var(--asagi-blue)',
  otherColor = 'var(--sorairo-blue)',
  showThis = true,
  maxY,
  alertThreshold,
}: Props) {
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
  const stacked = Array.from({ length: weeks }, (_, i) => (thisProject[i] ?? 0) + (otherProjects[i] ?? 0));
  const peak = maxY ?? Math.max(1, ...stacked, ...availability.slice(0, weeks), alertThreshold ?? 0);
  const scale = (value: number) => (value / peak) * plotHeight;
  const y = (value: number) => PAD_TOP + plotHeight - scale(value);

  const ticks = [0, 0.5, 1].map((fraction) => Math.round(peak * fraction));
  const labelEvery = weeks > 60 ? 8 : 4;

  const stepPoints = Array.from({ length: weeks }, (_, index) => {
    const x = PAD_LEFT + index * colWidth;
    const value = availability[index] ?? 0;
    return `${x},${y(value)} ${x + colWidth},${y(value)}`;
  }).join(' ');

  return (
    <div className="chart-scroll" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label="Weekly demand by project against availability">
        {ticks.map((tick) => (
          <line key={tick} x1={PAD_LEFT} x2={width - 6} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
        ))}
        {Array.from({ length: weeks }, (_, index) => {
          const mine = thisProject[index] ?? 0;
          const others = otherProjects[index] ?? 0;
          const available = availability[index] ?? 0;
          const x = PAD_LEFT + index * colWidth + 2;
          const barWidth = Math.max(1, colWidth - 4);
          const total = mine + others;
          const yellowStart = alertThreshold ?? Number.POSITIVE_INFINITY;
          const yellowEnd = Math.min(total, available);
          const yellowHeight = yellowEnd > yellowStart ? y(yellowStart) - y(yellowEnd) : 0;
          const redHeight = total > available ? Math.max(0, y(available) - y(total)) : 0;

          return (
            <g key={index}>
              <rect
                x={x}
                y={y(others)}
                width={barWidth}
                height={scale(others)}
                className="bar-other-projects"
                style={otherColor ? { fill: otherColor } : undefined}
              />
              <rect
                x={x}
                y={y(total)}
                width={barWidth}
                height={scale(mine)}
                className="bar-this-project"
                style={thisColor ? { fill: thisColor } : undefined}
              />
              {yellowHeight > 0 && (
                <rect
                  x={x}
                  y={y(yellowEnd)}
                  width={barWidth}
                  height={yellowHeight}
                  fill="var(--yamabuki-yellow)"
                >
                  <title>{`Demand above alert threshold: ${Math.round(yellowEnd - yellowStart)} h`}</title>
                </rect>
              )}
              {redHeight > 0 && (
                <rect
                  x={x}
                  y={y(total)}
                  width={barWidth}
                  height={redHeight}
                  fill="var(--takeda-red)"
                >
                  <title>{`Demand above availability: ${Math.round(total - available)} h`}</title>
                </rect>
              )}
              {total > 0 && (
                <text
                  x={PAD_LEFT + index * colWidth + colWidth / 2}
                  y={y(total) - 4}
                  className={total > (alertThreshold ?? Number.POSITIVE_INFINITY) ? 'chart-value-label chart-value-alert' : 'chart-value-label'}
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
              <rect x={x} y={PAD_TOP} width={barWidth} height={plotHeight} fill="transparent">
                <title>
                  {`Week of ${weekLabel(index)}\n${thisLabel}: ${mine} h\n${otherLabel}: ${others} h\nTotal: ${total} h\nAvailability: ${available} h\nUtilization: ${
                    available > 0 ? `${Math.round((total / available) * 100)}%` : 'no availability'
                  }`}
                </title>
              </rect>
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

        {alertThreshold !== undefined && (
          <g className="chart-alert-level">
            <line x1={PAD_LEFT} x2={width - 6} y1={y(alertThreshold)} y2={y(alertThreshold)} className="chart-alert-line" />
            <g transform={`translate(0, ${Math.max(2, y(alertThreshold) - 8)})`}>
              <title>{`Alert level: ${alertThreshold} hours`}</title>
              <path d="M9 0 18 17H0Z" />
              <line x1="9" y1="5" x2="9" y2="11" />
              <circle cx="9" cy="14" r="1" />
            </g>
            <g transform={`translate(${width - 18}, ${Math.max(2, y(alertThreshold) - 8)})`}>
              <title>{`Alert level: ${alertThreshold} hours`}</title>
              <path d="M9 0 18 17H0Z" />
              <line x1="9" y1="5" x2="9" y2="11" />
              <circle cx="9" cy="14" r="1" />
            </g>
          </g>
        )}

        <polyline points={stepPoints} className="chart-step chart-step-dotted" />
        <line x1={PAD_LEFT} x2={width - 6} y1={PAD_TOP + plotHeight} y2={PAD_TOP + plotHeight} className="chart-axis" />
      </svg>

      <div className="chart-legend">
        <span className="legend-entry">
          <span className="legend-swatch swatch-other-projects" style={otherColor ? { background: otherColor } : undefined} /> {otherLabel}
        </span>
        {showThis && (
          <span className="legend-entry">
            <span className="legend-swatch swatch-this-project" style={thisColor ? { background: thisColor } : undefined} /> {thisLabel}
          </span>
        )}
        <span className="legend-entry">
          <span className="legend-swatch availability" /> Availability
        </span>
      </div>
    </div>
  );
}
