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
  /** Hide the upper band when there is no "this project" split to show. */
  showThis?: boolean;
}

const BAR_WIDTH = 16;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PAD_LEFT = 10;

/** Stacked demand columns against a stepped availability line. */
export default function PersonDemandChart({
  weeks,
  thisProject,
  otherProjects,
  availability,
  height = 240,
  thisLabel = 'This project',
  otherLabel = 'All other projects',
  showThis = true,
}: Props) {
  const width = PAD_LEFT + weeks * BAR_WIDTH + 12;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const stacked = Array.from({ length: weeks }, (_, i) => (thisProject[i] ?? 0) + (otherProjects[i] ?? 0));
  const peak = Math.max(1, ...stacked, ...availability.slice(0, weeks));
  const scale = (value: number) => (value / peak) * plotHeight;
  const y = (value: number) => PAD_TOP + plotHeight - scale(value);

  const ticks = [0, 0.5, 1].map((fraction) => Math.round(peak * fraction));
  const labelEvery = weeks > 60 ? 8 : 4;

  const stepPoints = Array.from({ length: weeks }, (_, index) => {
    const x = PAD_LEFT + index * BAR_WIDTH;
    const value = availability[index] ?? 0;
    return `${x},${y(value)} ${x + BAR_WIDTH},${y(value)}`;
  }).join(' ');

  return (
    <div className="chart-scroll">
      <svg width={width} height={height} role="img" aria-label="Weekly demand by project against availability">
        {ticks.map((tick) => (
          <line key={tick} x1={PAD_LEFT} x2={width - 6} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
        ))}

        {Array.from({ length: weeks }, (_, index) => {
          const mine = thisProject[index] ?? 0;
          const others = otherProjects[index] ?? 0;
          const available = availability[index] ?? 0;
          const x = PAD_LEFT + index * BAR_WIDTH + 2;
          const barWidth = BAR_WIDTH - 4;
          const total = mine + others;

          return (
            <g key={index}>
              <rect x={x} y={y(others)} width={barWidth} height={scale(others)} className="bar-other-projects" />
              <rect x={x} y={y(total)} width={barWidth} height={scale(mine)} className="bar-this-project" />
              {total > 0 && (
                <text
                  x={PAD_LEFT + index * BAR_WIDTH + BAR_WIDTH / 2}
                  y={y(total) - 4}
                  className="chart-value-label"
                  textAnchor="middle"
                >
                  {total}
                </text>
              )}
              {/* Only label where availability changes, so the step line stays readable. */}
              {available !== (availability[index - 1] ?? null) && (
                <text
                  x={PAD_LEFT + index * BAR_WIDTH + 2}
                  y={y(available) - 5}
                  className="chart-availability-label"
                >
                  {available}
                </text>
              )}
              <rect x={x} y={PAD_TOP} width={barWidth} height={plotHeight} fill="transparent">
                <title>
                  {`Week of ${weekLabel(index)}\nThis project: ${mine} h\nOther projects: ${others} h\nTotal: ${total} h\nAvailability: ${available} h\nUtilization: ${
                    available > 0 ? `${Math.round((total / available) * 100)}%` : 'no availability'
                  }`}
                </title>
              </rect>
              {index % labelEvery === 0 && (
                <text
                  x={PAD_LEFT + index * BAR_WIDTH + BAR_WIDTH / 2}
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

      <div className="chart-legend">
        <span className="legend-entry">
          <span className="legend-swatch swatch-other-projects" /> {otherLabel}
        </span>
        {showThis && (
          <span className="legend-entry">
            <span className="legend-swatch swatch-this-project" /> {thisLabel}
          </span>
        )}
        <span className="legend-entry">
          <span className="legend-swatch availability" /> Availability
        </span>
      </div>
    </div>
  );
}
