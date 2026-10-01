import AllocationConflictQueue from './AllocationConflictQueue';
import type { AllocationConflict } from '../utils/allocationRisk';
import { currentWeekStart } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';

export interface ProjectFunctionTotalDemand {
  id: string;
  label: string;
  total: number;
}

interface Props {
  demandByFunctionTotals: ProjectFunctionTotalDemand[];
  demandStartWeek: number | null;
  demandEndWeek: number | null;
  /** Fraction (0-1) of the project's timeline that has elapsed, or null if unknown. */
  timelineElapsedFraction: number | null;
  /** Set to false to omit the allocation conflicts panel when it's shown elsewhere (e.g. a separate Risk tab). */
  showConflicts?: boolean;
  conflicts?: AllocationConflict[];
  onResolveConflict?: (conflict: AllocationConflict) => void;
}

const PAD_TOP = 16;

function formatWholeNumber(value: number) {
  return Math.round(value).toLocaleString();
}

export default function ProjectAnalyticsInsights({
  demandByFunctionTotals,
  demandStartWeek,
  demandEndWeek,
  timelineElapsedFraction,
  showConflicts = true,
  conflicts = [],
  onResolveConflict,
}: Props) {
  const sortedFunctionTotals = [...demandByFunctionTotals].filter((entry) => entry.total > 0).sort((a, b) => b.total - a.total);
  const maxFunctionTotal = Math.max(1, ...sortedFunctionTotals.map((entry) => entry.total));
  const toDateFraction = timelineElapsedFraction ?? 0;
  const progress = Math.max(0, Math.min(1, toDateFraction));
  const totalOverallDemand = demandByFunctionTotals.reduce((sum, entry) => sum + entry.total, 0);
  const totalToDateDemand = totalOverallDemand * toDateFraction;

  return (
    <div className="project-analytics-insights">
      <div className={showConflicts ? 'analytics-project-half-grid' : 'analytics-project-half-grid compact-two'}>
        <section className="analytics-chart-panel analytics-project-function-totals-panel">
          <div className="project-chart-heading">
            <div className="project-chart-title">
              <span className="home-section-kicker">MBO Support Model</span>
              <h3>Project Demand by Function</h3>
            </div>
          </div>
          {sortedFunctionTotals.length === 0 ? (
            <p className="muted">No demand recorded for this project yet.</p>
          ) : (
            <>
              <div className="chart-scroll">
                <svg
                  width={440}
                  height={Math.max(140, sortedFunctionTotals.length * 28 + 32)}
                  role="img"
                  aria-label="Total demand by function"
                >
                  {sortedFunctionTotals.map((entry, index) => {
                    const labelWidth = 132;
                    const plotWidth = 440 - labelWidth - 20;
                    const barHeight = 16;
                    const rowGap = 12;
                    const y = PAD_TOP + index * (barHeight + rowGap);
                    const totalWidth = (entry.total / maxFunctionTotal) * plotWidth;
                    const toDateWidth = totalWidth * toDateFraction;
                    const remainingWidth = totalWidth - toDateWidth;
                    return (
                      <g key={entry.id}>
                        <text x={labelWidth - 8} y={y + barHeight / 2 + 4} className="chart-axis-label" textAnchor="end">
                          {entry.label}
                        </text>
                        <rect x={labelWidth} y={y} width={toDateWidth} height={barHeight} fill="var(--sorairo-blue)">
                          <title>{`${entry.label} \u2013 to date: ${formatWholeNumber(entry.total * toDateFraction)}`}</title>
                        </rect>
                        <rect x={labelWidth + toDateWidth} y={y} width={remainingWidth} height={barHeight} fill="var(--sorairo-blue)" opacity="0.15">
                          <title>{`${entry.label} \u2013 remaining: ${formatWholeNumber(entry.total * (1 - toDateFraction))}`}</title>
                        </rect>
                        <text x={labelWidth + totalWidth + 8} y={y + barHeight / 2 + 4} className="chart-value-label">
                          {formatWholeNumber(entry.total)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="chart-legend team-chart-legend project-chart-legend" aria-label="Demand series">
                <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--sorairo-blue)' }} /> Demand to date</span>
                <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--sorairo-blue)', opacity: 0.15 }} /> Total demand over life of project</span>
              </div>
            </>
          )}
        </section>

        <section className="analytics-chart-panel analytics-project-gauge-panel">
          <div className="project-chart-heading project-progress-heading">
            <div className="project-chart-title">
              <span className="home-section-kicker">MBO Support Model</span>
              <h3>Percent Complete</h3>
            </div>
            <div className="analytics-progress-value">
              <strong className="analytics-gauge-value">{timelineElapsedFraction === null ? '—' : `${Math.round(progress * 100)}%`}</strong>
            </div>
          </div>
          {(() => {
            return (
              <>
                {demandStartWeek !== null && demandEndWeek !== null && demandEndWeek >= demandStartWeek && (() => {
                  const startDate = currentWeekStart();
                  startDate.setUTCDate(startDate.getUTCDate() + demandStartWeek * 7);
                  const endDate = currentWeekStart();
                  endDate.setUTCDate(endDate.getUTCDate() + (demandEndWeek + 1) * 7 - 1);
                  const rangeMs = Math.max(1, endDate.getTime() - startDate.getTime());
                  const todayPosition = Math.max(0, Math.min(1, (Date.now() - startDate.getTime()) / rangeMs));
                  return (
                    <>
                      <div className="analytics-progress-track-row">
                        <span className="analytics-progress-date">{formatDate(startDate)}</span>
                        <div className="analytics-progress-timeline" aria-label={`Demand data from ${formatDate(startDate)} to ${formatDate(endDate)}`}>
                          <span className="analytics-progress-fill" style={{ width: `${progress * 100}%` }} />
                          <div className="analytics-progress-today" style={{ left: `${todayPosition * 100}%` }}>
                            <span>Today</span>
                          </div>
                        </div>
                        <span className="analytics-progress-date">{formatDate(endDate)}</span>
                      </div>
                    </>
                  );
                })()}
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
