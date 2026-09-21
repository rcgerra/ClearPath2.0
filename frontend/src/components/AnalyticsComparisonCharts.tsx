import { useEffect, useRef, useState } from 'react';
import { weekLabelShort } from '../utils/arrayParser';

interface Props {
  weeks: number;
  projectDemand: number[];
  nonProjectDemand: number[];
  availability: number[];
  totalDemand: number[];
}

const PAD_TOP = 24;
const PAD_BOTTOM = 32;
const PAD_LEFT = 10;

function barScale(value: number, max: number, height: number) {
  return max > 0 ? (value / max) * height : 0;
}

function stats(values: number[]) {
  const visible = values.slice(0, values.length);
  const total = visible.reduce((sum, value) => sum + value, 0);
  return { min: Math.min(0, ...visible), average: visible.length ? total / visible.length : 0, peak: Math.max(0, ...visible) };
}

export default function AnalyticsComparisonCharts({ weeks, projectDemand, nonProjectDemand, availability, totalDemand }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const height = 190;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const colWidth = containerWidth > 0 ? Math.max(4, (containerWidth - PAD_LEFT - 12) / weeks) : 16;
  const width = PAD_LEFT + weeks * colWidth + 12;
  const maxCapacity = Math.max(1, ...availability.slice(0, weeks), ...projectDemand.slice(0, weeks).map((value, index) => value + (nonProjectDemand[index] ?? 0)));
  const demandStats = stats(totalDemand.slice(0, weeks));
  const availabilityStats = stats(availability.slice(0, weeks));
  const statMax = Math.max(1, demandStats.peak, availabilityStats.peak);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="analytics-comparison-charts" ref={containerRef}>
      <section className="analytics-chart-panel">
        <h3>Project vs. non-project demand</h3>
        <div className="chart-scroll">
          <svg width={width} height={height} role="img" aria-label="Weekly project and non-project demand against availability">
            {Array.from({ length: weeks }, (_, index) => {
              const x = PAD_LEFT + index * colWidth + 2;
              const barWidth = Math.max(1, colWidth - 4);
              const project = projectDemand[index] ?? 0;
              const other = nonProjectDemand[index] ?? 0;
              const total = project + other;
              const available = availability[index] ?? 0;
              const projectHeight = barScale(project, maxCapacity, plotHeight);
              const otherHeight = barScale(other, maxCapacity, plotHeight);
              const base = PAD_TOP + plotHeight;
              const capacityY = base - barScale(available, maxCapacity, plotHeight);
              return (
                <g key={index}>
                  <rect x={x} y={base - projectHeight} width={barWidth} height={projectHeight} fill="var(--sorairo-blue)" />
                  <rect x={x} y={base - projectHeight - otherHeight} width={barWidth} height={otherHeight} fill="var(--asagi-blue)" />
                  <line x1={x - 1} x2={x + barWidth + 1} y1={capacityY} y2={capacityY} className="chart-capacity-line" />
                  {index % (weeks > 60 ? 8 : 4) === 0 && <text x={x + barWidth / 2} y={height - PAD_BOTTOM + 16} className="chart-axis-label" textAnchor="middle">{weekLabelShort(index)}</text>}
                  {total > 0 && <title>{`${weekLabelShort(index)}: ${Math.round(total)} h demand, ${Math.round(available)} h availability`}</title>}
                </g>
              );
            })}
            <line x1={PAD_LEFT} x2={width - 6} y1={PAD_TOP + plotHeight} y2={PAD_TOP + plotHeight} className="chart-axis" />
          </svg>
        </div>
        <div className="chart-legend team-chart-legend">
          <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--sorairo-blue)' }} /> Project demand</span>
          <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--asagi-blue)' }} /> Non-project demand</span>
          <span className="legend-entry"><span className="legend-swatch availability" /> Availability</span>
        </div>
      </section>

      <section className="analytics-chart-panel">
        <h3>Demand and availability profile</h3>
        <div className="chart-scroll">
          <svg width="360" height={height} role="img" aria-label="Minimum average and peak demand versus availability">
            {(['min', 'average', 'peak'] as const).map((label, index) => {
              const x = 30 + index * 110;
              const demand = demandStats[label];
              const available = availabilityStats[label];
              const demandHeight = barScale(demand, statMax, plotHeight);
              const availabilityHeight = barScale(available, statMax, plotHeight);
              const base = PAD_TOP + plotHeight;
              return (
                <g key={label}>
                  <rect x={x} y={base - availabilityHeight} width={28} height={availabilityHeight} fill="var(--matsuba-green)" />
                  <rect x={x + 34} y={base - demandHeight} width={28} height={demandHeight} fill="var(--sorairo-blue)" />
                  <text x={x + 31} y={height - PAD_BOTTOM + 16} className="chart-axis-label" textAnchor="middle">{label}</text>
                  <text x={x + 14} y={base - availabilityHeight - 4} className="chart-value-label" textAnchor="middle">{Math.round(available)}</text>
                  <text x={x + 48} y={base - demandHeight - 4} className="chart-value-label" textAnchor="middle">{Math.round(demand)}</text>
                </g>
              );
            })}
            <line x1="10" x2="350" y1={PAD_TOP + plotHeight} y2={PAD_TOP + plotHeight} className="chart-axis" />
          </svg>
        </div>
        <div className="chart-legend team-chart-legend">
          <span className="legend-entry"><span className="legend-swatch availability" /> Availability</span>
          <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--sorairo-blue)' }} /> Demand</span>
        </div>
      </section>
    </div>
  );
}
