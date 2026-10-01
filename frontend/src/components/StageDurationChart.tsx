import { REQUEST_PHASES } from '../constants/phases';
import type { StageDurationAnalytics } from '../types';

interface Props {
  data: StageDurationAnalytics[];
  isLoading?: boolean;
}

const series = [
  { days: 30 as const, label: 'Last 30 days', color: 'var(--sorairo-blue)' },
  { days: 60 as const, label: 'Last 60 days', color: 'var(--matsutake-green)' },
  { days: 90 as const, label: 'Last 90 days', color: 'var(--yamabuki-yellow)' },
];

const chart = { width: 820, height: 300, left: 142, right: 20, top: 18, bottom: 48 };
const plotWidth = chart.width - chart.left - chart.right;
const plotHeight = chart.height - chart.top - chart.bottom;

const compactStage = (stage: string) => stage === 'PIRT Assessment' ? 'PIRT' : stage === 'Prioritization' ? 'Prioritize' : stage;
const formatHours = (hours: number) => hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`;

export default function StageDurationChart({ data, isLoading = false }: Props) {
  const values = new Map(data.map((entry) => [`${entry.windowDays}:${entry.stage}`, entry]));
  const maxHours = Math.max(1, ...data.map((entry) => entry.averageHours));
  const groupWidth = plotWidth / REQUEST_PHASES.length;
  const barWidth = Math.min(18, groupWidth / 4);

  return (
    <section className="analytics-chart-panel stage-duration-panel">
      <div className="stage-duration-heading">
        <div>
          <h3>Average time in workflow stage</h3>
          <p className="muted">Time from one stage completion to the next.</p>
        </div>
        <div className="chart-legend" aria-label="Time windows">
          {series.map((entry) => (
            <span key={entry.days}><i style={{ backgroundColor: entry.color }} />{entry.label}</span>
          ))}
        </div>
      </div>
      {isLoading ? <p className="muted">Loading workflow analytics...</p> : data.length === 0 ? (
        <p className="muted">No workflow transitions are available for these time windows.</p>
      ) : (
        <div className="stage-duration-chart-wrap">
          <svg className="stage-duration-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Average hours spent in each opportunity workflow stage for the last 30, 60, and 90 days">
            {[0, 0.5, 1].map((fraction) => {
              const y = chart.top + plotHeight * (1 - fraction);
              return <line key={fraction} x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="stage-duration-gridline" />;
            })}
            <text x={chart.left - 10} y={chart.top + 4} textAnchor="end" className="stage-duration-axis-label">{formatHours(maxHours)}</text>
            <text x={chart.left - 10} y={chart.top + plotHeight / 2 + 4} textAnchor="end" className="stage-duration-axis-label">{formatHours(maxHours / 2)}</text>
            <text x={chart.left - 10} y={chart.top + plotHeight + 4} textAnchor="end" className="stage-duration-axis-label">0h</text>
            {REQUEST_PHASES.map((stage, stageIndex) => {
              const center = chart.left + groupWidth * (stageIndex + 0.5);
              return (
                <g key={stage}>
                  {series.map((entry, seriesIndex) => {
                    const sample = values.get(`${entry.days}:${stage}`);
                    const height = sample ? (sample.averageHours / maxHours) * plotHeight : 0;
                    const x = center + (seriesIndex - 1) * (barWidth + 3) - barWidth / 2;
                    const y = chart.top + plotHeight - height;
                    return (
                      <rect key={entry.days} x={x} y={y} width={barWidth} height={height} rx="2" fill={entry.color}>
                        <title>{`${stage}, ${entry.label}: ${sample ? formatHours(sample.averageHours) : 'No data'}${sample ? ` (${sample.sampleCount} transitions)` : ''}`}</title>
                      </rect>
                    );
                  })}
                  <text x={center} y={chart.height - 20} textAnchor="middle" className="stage-duration-stage-label">{compactStage(stage)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
