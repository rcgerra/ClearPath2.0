import { weekLabel, weekLabelShort } from '../utils/arrayParser';

interface Props {
  weeks: number;
  /** Total demand per week across every assignment. */
  demand: number[];
  /** Total availability per week. */
  availability: number[];
}

const BAR_WIDTH = 16;
const HEIGHT = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 44;
const PAD_LEFT = 44;

/** Demand columns (Sorairo blue) against a stepped availability line (Matsuba green). */
export default function CapacityChart({ weeks, demand, availability }: Props) {
  const width = PAD_LEFT + weeks * BAR_WIDTH + 12;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const peak = Math.max(1, ...demand.slice(0, weeks), ...availability.slice(0, weeks));
  const scale = (value: number) => plotHeight - (value / peak) * plotHeight;
  const y = (value: number) => PAD_TOP + scale(value);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(peak * fraction));

  // Two points per week give the availability line its square steps.
  const stepPoints = Array.from({ length: weeks }, (_, index) => {
    const x = PAD_LEFT + index * BAR_WIDTH;
    const value = availability[index] ?? 0;
    return `${x},${y(value)} ${x + BAR_WIDTH},${y(value)}`;
  }).join(' ');

  const labelEvery = weeks > 78 ? 8 : weeks > 40 ? 4 : 2;

  return (
    <div className="chart-scroll">
      <svg width={width} height={HEIGHT} role="img" aria-label="Weekly demand against availability">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD_LEFT} x2={width - 6} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
            <text x={PAD_LEFT - 8} y={y(tick) + 4} className="chart-axis-label" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        {Array.from({ length: weeks }, (_, index) => {
          const demandHours = demand[index] ?? 0;
          const availableHours = availability[index] ?? 0;
          const utilization = availableHours > 0 ? demandHours / availableHours : demandHours > 0 ? Infinity : 0;
          const over = demandHours > availableHours;
          const x = PAD_LEFT + index * BAR_WIDTH;

          return (
            <g key={index}>
              <rect
                x={x + 2}
                y={y(demandHours)}
                width={BAR_WIDTH - 4}
                height={Math.max(0, PAD_TOP + plotHeight - y(demandHours))}
                className={`chart-bar${over ? ' over' : ''}`}
              >
                <title>
                  {`Week of ${weekLabel(index)}\nDemand: ${demandHours} h\nAvailability: ${availableHours} h\nUtilization: ${
                    Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : 'no availability'
                  }`}
                </title>
              </rect>
              {index % labelEvery === 0 && (
                <text
                  x={x + BAR_WIDTH / 2}
                  y={HEIGHT - PAD_BOTTOM + 18}
                  className="chart-axis-label"
                  textAnchor="middle"
                >
                  {weekLabelShort(index)}
                </text>
              )}
            </g>
          );
        })}

        <polyline points={stepPoints} className="chart-step" />
        <line
          x1={PAD_LEFT}
          x2={width - 6}
          y1={PAD_TOP + plotHeight}
          y2={PAD_TOP + plotHeight}
          className="chart-axis"
        />
      </svg>

      <div className="chart-legend">
        <span className="legend-swatch demand" /> Demand
        <span className="legend-swatch availability" /> Availability
        <span className="legend-swatch over" /> Over-allocated week
      </div>
    </div>
  );
}
