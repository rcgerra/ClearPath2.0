import { useEffect, useRef, useState } from 'react';
import AllocationConflictQueue from './AllocationConflictQueue';
import { weekLabelShort } from '../utils/arrayParser';
import type { AllocationConflict } from '../utils/allocationRisk';

export interface ProjectFunctionWeeklyDemand {
  id: string;
  label: string;
  weeks: number[];
}

export interface ProjectFunctionTotalDemand {
  id: string;
  label: string;
  total: number;
}

interface Props {
  weeklyDemandByFunction: ProjectFunctionWeeklyDemand[];
  weeksToShow: number;
  demandByFunctionTotals: ProjectFunctionTotalDemand[];
  /** Fraction (0-1) of the project's timeline that has elapsed, or null if unknown. */
  timelineElapsedFraction: number | null;
  /** Set to false to omit the allocation conflicts panel when it's shown elsewhere (e.g. a separate Risk tab). */
  showConflicts?: boolean;
  conflicts?: AllocationConflict[];
  onResolveConflict?: (conflict: AllocationConflict) => void;
}

const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const PAD_LEFT = 12;

const FUNCTION_COLORS = [
  'var(--sorairo-blue)',
  'var(--matsutake-green)',
  'var(--sakura-pink)',
  'var(--fuji-purple)',
  'var(--yamabuki-yellow)',
  'var(--asagi-blue)',
  'var(--akane-red)',
  'var(--matsuba-green)',
];

function formatWholeNumber(value: number) {
  return Math.round(value).toLocaleString();
}

export default function ProjectAnalyticsInsights({
  weeklyDemandByFunction,
  weeksToShow,
  demandByFunctionTotals,
  timelineElapsedFraction,
  showConflicts = true,
  conflicts = [],
  onResolveConflict,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const sortedFunctionTotals = [...demandByFunctionTotals].filter((entry) => entry.total > 0).sort((a, b) => b.total - a.total);
  const maxFunctionTotal = Math.max(1, ...sortedFunctionTotals.map((entry) => entry.total));
  const toDateFraction = timelineElapsedFraction ?? 0;
  const totalOverallDemand = demandByFunctionTotals.reduce((sum, entry) => sum + entry.total, 0);
  const totalToDateDemand = totalOverallDemand * toDateFraction;

  const activeWeeklyFunctions = weeklyDemandByFunction.filter((entry) => entry.weeks.some((value) => value > 0));
  const weeklyTotals = Array.from({ length: weeksToShow }, (_, week) =>
    activeWeeklyFunctions.reduce((sum, entry) => sum + (entry.weeks[week] ?? 0), 0),
  );
  const maxWeeklyTotal = Math.max(1, ...weeklyTotals) * 1.12;
  const height = 220;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const colWidth = containerWidth > 0 ? Math.max(4, (containerWidth - PAD_LEFT - 12) / weeksToShow) : 16;
  const chartWidth = PAD_LEFT + weeksToShow * colWidth + 12;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="project-analytics-insights" ref={containerRef}>
      <section className="analytics-chart-panel analytics-project-weekly-panel">
        <h3>Total demand by function per week</h3>
        {activeWeeklyFunctions.length === 0 ? (
          <p className="muted">No demand recorded for this project yet.</p>
        ) : (
          <>
            <div className="chart-scroll">
              <svg width={chartWidth} height={height} role="img" aria-label="Total demand by function per week">
                {Array.from({ length: weeksToShow }, (_, week) => {
                  const x = PAD_LEFT + week * colWidth + 2;
                  const barWidth = Math.max(1, colWidth - 4);
                  let cursorY = PAD_TOP + plotHeight;
                  const weekTotal = weeklyTotals[week] ?? 0;
                  const stackHeight = (weekTotal / maxWeeklyTotal) * plotHeight;
                  return (
                    <g key={week}>
                      {activeWeeklyFunctions.map((entry, functionIndex) => {
                        const value = entry.weeks[week] ?? 0;
                        if (value <= 0) return null;
                        const segmentHeight = (value / maxWeeklyTotal) * plotHeight;
                        cursorY -= segmentHeight;
                        return (
                          <rect
                            key={entry.id}
                            x={x}
                            y={cursorY}
                            width={barWidth}
                            height={segmentHeight}
                            fill={FUNCTION_COLORS[functionIndex % FUNCTION_COLORS.length]}
                          >
                            <title>{`${entry.label}: ${formatWholeNumber(value)}`}</title>
                          </rect>
                        );
                      })}
                      {weekTotal > 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={PAD_TOP + plotHeight - stackHeight - 4}
                          className="chart-value-label"
                          textAnchor="middle"
                        >
                          {formatWholeNumber(weekTotal)}
                        </text>
                      )}
                      {week % (weeksToShow > 60 ? 8 : 4) === 0 && (
                        <text x={x + barWidth / 2} y={height - PAD_BOTTOM + 16} className="chart-axis-label" textAnchor="middle">
                          {weekLabelShort(week)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="chart-legend team-chart-legend">
              {activeWeeklyFunctions.map((entry, functionIndex) => (
                <span className="legend-entry" key={entry.id}>
                  <span className="legend-swatch" style={{ background: FUNCTION_COLORS[functionIndex % FUNCTION_COLORS.length] }} /> {entry.label}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <div className={showConflicts ? 'analytics-project-half-grid' : 'analytics-project-half-grid compact-two'}>
        <section className="analytics-chart-panel analytics-project-function-totals-panel">
          <h3>Total demand by function</h3>
          {sortedFunctionTotals.length === 0 ? (
            <p className="muted">No demand recorded for this project yet.</p>
          ) : (
            <>
              <div className="chart-scroll">
                <svg
                  width={Math.max(220, sortedFunctionTotals.length * 72)}
                  height={220}
                  role="img"
                  aria-label="Total demand by function"
                >
                  {sortedFunctionTotals.map((entry, index) => {
                    const columnWidth = 72;
                    const barWidth = 40;
                    const x = index * columnWidth + (columnWidth - barWidth) / 2;
                    const plotHeight = 220 - PAD_TOP - PAD_BOTTOM;
                    const totalHeight = (entry.total / maxFunctionTotal) * plotHeight;
                    const toDateHeight = totalHeight * toDateFraction;
                    const remainingHeight = totalHeight - toDateHeight;
                    const baseY = PAD_TOP + plotHeight;
                    return (
                      <g key={entry.id}>
                        <rect x={x} y={baseY - toDateHeight} width={barWidth} height={toDateHeight} fill="var(--sorairo-blue)">
                          <title>{`${entry.label} \u2013 to date: ${formatWholeNumber(entry.total * toDateFraction)}`}</title>
                        </rect>
                        <rect x={x} y={baseY - totalHeight} width={barWidth} height={remainingHeight} fill="var(--matsutake-green)">
                          <title>{`${entry.label} \u2013 remaining: ${formatWholeNumber(entry.total * (1 - toDateFraction))}`}</title>
                        </rect>
                        <text x={x + barWidth / 2} y={baseY - totalHeight - 6} className="chart-value-label" textAnchor="middle">
                          {formatWholeNumber(entry.total)}
                        </text>
                        <text x={x + barWidth / 2} y={220 - PAD_BOTTOM + 16} className="chart-axis-label" textAnchor="middle">
                          {entry.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="chart-legend team-chart-legend">
                <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--sorairo-blue)' }} /> Demand to date</span>
                <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--matsutake-green)' }} /> Total demand over life of project</span>
              </div>
            </>
          )}
        </section>

        <section className="analytics-chart-panel analytics-project-gauge-panel">
          <h3>Percent complete</h3>
          {(() => {
            const gaugeSize = 120;
            const strokeWidth = 12;
            const radius = (gaugeSize - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const progress = Math.max(0, Math.min(1, toDateFraction));
            const dashOffset = circumference * (1 - progress);
            return (
              <>
                <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`} role="img" aria-label="Percent of project labor complete">
                  <circle cx={gaugeSize / 2} cy={gaugeSize / 2} r={radius} fill="none" stroke="var(--light-grey)" strokeWidth={strokeWidth} />
                  <circle
                    cx={gaugeSize / 2}
                    cy={gaugeSize / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--sorairo-blue)"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${gaugeSize / 2} ${gaugeSize / 2})`}
                  />
                  <text x={gaugeSize / 2} y={gaugeSize / 2 + 6} textAnchor="middle" className="analytics-gauge-value" fill="var(--accent-ink, var(--sorairo-blue))">
                    {timelineElapsedFraction === null ? '—' : `${Math.round(progress * 100)}%`}
                  </text>
                </svg>
                <p className="analytics-gauge-caption">
                  {formatWholeNumber(totalToDateDemand)} of {formatWholeNumber(totalOverallDemand)} hrs to date
                </p>
              </>
            );
          })()}
        </section>

        {showConflicts && (
          <section className="analytics-chart-panel analytics-project-risk-panel">
            <h3>Allocation conflicts</h3>
            <p className="muted">Severity reflects peak weekly excess and how long the conflict persists.</p>
            <AllocationConflictQueue conflicts={conflicts} onOpen={onResolveConflict} />
          </section>
        )}
      </div>
    </div>
  );
}
