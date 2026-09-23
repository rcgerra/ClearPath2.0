import { useEffect, useRef, useState } from 'react';
import AllocationConflictQueue from './AllocationConflictQueue';
import { weekLabelShort } from '../utils/arrayParser';
import type { AllocationConflict } from '../utils/allocationRisk';

interface Workstream {
  id: string;
  label: string;
  weeks: number[];
  peopleCount?: number;
}

interface PersonInsight {
  id: string;
  label: string;
  overAllocated: number;
  overWeeks: number;
  available: number;
  assignments: number;
}

interface Props {
  weeks: number;
  totalDemand: number[];
  availability: number[];
  workstreams: Workstream[];
  people: PersonInsight[];
  conflicts: AllocationConflict[];
  onResolveConflict: (conflict: AllocationConflict) => void;
}

const PAD_TOP = 22;
const PAD_BOTTOM = 32;
const PAD_LEFT = 12;

function scale(value: number, max: number, height: number) {
  return max > 0 ? (value / max) * height : 0;
}

export default function DepartmentAnalyticsInsights({ weeks, totalDemand, availability, workstreams, people, conflicts, onResolveConflict }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [workstreamSort, setWorkstreamSort] = useState<'name' | 'total'>('total');
  const height = 190;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const colWidth = containerWidth > 0 ? Math.max(4, (containerWidth - PAD_LEFT - 12) / weeks) : 16;
  const width = PAD_LEFT + weeks * colWidth + 12;
  const gapValues = availability.slice(0, weeks).map((value, index) => value - (totalDemand[index] ?? 0));
  const maxGap = Math.max(1, ...gapValues.map((value) => Math.abs(value)));
  const topWorkstreams = workstreams
    .map((workstream) => ({ ...workstream, total: workstream.weeks.slice(0, weeks).reduce((sum, value) => sum + value, 0) }))
    .filter((workstream) => workstream.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const lowestWorkstreams = workstreams
    .map((workstream) => ({ ...workstream, total: workstream.weeks.slice(0, weeks).reduce((sum, value) => sum + value, 0) }))
    .filter((workstream) => workstream.total > 0)
    .sort((a, b) => a.total - b.total)
    .slice(0, 8);
  const maxWorkstream = Math.max(1, ...topWorkstreams.map((workstream) => workstream.total));
  const maxLowestWorkstream = Math.max(1, ...lowestWorkstreams.map((workstream) => workstream.total));
  const sortWorkstreams = (items: typeof topWorkstreams, lowest = false) => [...items].sort((a, b) => {
    if (workstreamSort === 'name') return a.label.localeCompare(b.label);
    return lowest ? a.total - b.total : b.total - a.total;
  });
  const sortedTopWorkstreams = sortWorkstreams(topWorkstreams);
  const sortedLowestWorkstreams = sortWorkstreams(lowestWorkstreams, true);
  const mostAvailable = people.filter((person) => person.available > 0).sort((a, b) => b.available - a.available).slice(0, 5);
  const maxAvailable = Math.max(1, ...mostAvailable.map((person) => person.available));
  const gapWeeks = gapValues.map((gap, index) => ({ index, gap })).filter((entry) => entry.gap !== 0);
  const highestDeficits = gapWeeks.filter((entry) => entry.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 5);
  const highestCapacityWeeks = gapWeeks.filter((entry) => entry.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="department-analytics-insights" ref={containerRef}>
      <section className="analytics-chart-panel analytics-capacity-gap-panel">
        <h3>Weekly capacity gap</h3>
        <div className="chart-scroll">
          <svg width={width} height={height} role="img" aria-label="Weekly capacity gap">
            {gapValues.map((gap, index) => {
              const x = PAD_LEFT + index * colWidth + 2;
              const barWidth = Math.max(1, colWidth - 4);
              const zeroY = PAD_TOP + plotHeight / 2;
              const barHeight = scale(Math.abs(gap), maxGap, plotHeight / 2);
              return (
                <g key={index}>
                  <rect x={x} y={gap >= 0 ? zeroY - barHeight : zeroY} width={barWidth} height={barHeight} fill={gap >= 0 ? 'var(--matsutake-green)' : 'var(--takeda-red)'} />
                  {gap !== 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={gap >= 0 ? zeroY - barHeight - 4 : zeroY + barHeight + 12}
                      className="chart-value-label"
                      textAnchor="middle"
                    >
                      {Math.round(gap)}
                    </text>
                  )}
                  {index % (weeks > 60 ? 8 : 4) === 0 && <text x={x + barWidth / 2} y={height - PAD_BOTTOM + 16} className="chart-axis-label" textAnchor="middle">{weekLabelShort(index)}</text>}
                </g>
              );
            })}
            <line x1={PAD_LEFT} x2={width - 6} y1={PAD_TOP + plotHeight / 2} y2={PAD_TOP + plotHeight / 2} className="chart-capacity-line" />
          </svg>
        </div>
        <div className="chart-legend team-chart-legend">
          <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--matsutake-green)' }} /> Capacity surplus</span>
          <span className="legend-entry"><span className="legend-swatch" style={{ background: 'var(--takeda-red)' }} /> Capacity deficit</span>
        </div>
      </section>

      <section className="analytics-chart-panel analytics-workstream-panel">
        <h3>Top demand workstreams</h3>
        <div className="analytics-workstream-list">
          <div className="analytics-workstream-row analytics-workstream-header" aria-hidden="true">
            <button type="button" className="analytics-sort-header" onClick={() => setWorkstreamSort('name')}>Workstream</button><button type="button" className="analytics-sort-header" onClick={() => setWorkstreamSort('total')}>Hours</button><span>Relative demand</span><strong>People</strong>
          </div>
          {sortedTopWorkstreams.map((workstream) => (
            <div className="analytics-workstream-row" key={workstream.id}>
              <span title={workstream.label}>{workstream.label}</span>
              <strong>{Math.round(workstream.total).toLocaleString('en-US')}</strong>
              <div className="analytics-workstream-bar-track"><div className="analytics-workstream-bar" style={{ width: `${(workstream.total / maxWorkstream) * 100}%` }} /></div>
              <strong>{workstream.peopleCount ?? 0}</strong>
            </div>
          ))}
          {topWorkstreams.length === 0 && <p className="muted">No demand in the selected horizon.</p>}
        </div>
      </section>

      <section className="analytics-chart-panel analytics-workstream-panel">
        <h3>Lowest demand workstreams</h3>
        <div className="analytics-workstream-list">
          <div className="analytics-workstream-row analytics-workstream-header" aria-hidden="true">
            <button type="button" className="analytics-sort-header" onClick={() => setWorkstreamSort('name')}>Workstream</button><button type="button" className="analytics-sort-header" onClick={() => setWorkstreamSort('total')}>Hours</button><span>Relative demand</span><strong>People</strong>
          </div>
          {sortedLowestWorkstreams.map((workstream) => (
            <div className="analytics-workstream-row" key={workstream.id}>
              <span title={workstream.label}>{workstream.label}</span>
              <strong>{Math.round(workstream.total).toLocaleString('en-US')}</strong>
              <div className="analytics-workstream-bar-track"><div className="analytics-workstream-bar analytics-low-demand-bar" style={{ width: `${(workstream.total / maxLowestWorkstream) * 100}%` }} /></div>
              <strong>{workstream.peopleCount ?? 0}</strong>
            </div>
          ))}
          {lowestWorkstreams.length === 0 && <p className="muted">No demand in the selected horizon.</p>}
        </div>
      </section>

      <section className="analytics-chart-panel analytics-people-panel allocation-conflict-panel">
        <h3>Allocation conflicts</h3>
        <p className="muted">Review severity, timing, and the assignments contributing to each conflict.</p>
        <AllocationConflictQueue conflicts={conflicts} onOpen={onResolveConflict} />
      </section>

      <section className="analytics-chart-panel analytics-people-panel">
        <h3>Most available capacity</h3>
        <div className="analytics-workstream-list">
          <div className="analytics-workstream-row analytics-workstream-header" aria-hidden="true">
            <span>Person</span><span>Relative capacity</span><strong>Assignments</strong><strong>Hours</strong>
          </div>
          {mostAvailable.map((person) => (
            <div className="analytics-workstream-row" key={person.id}>
              <span>{person.label}</span>
              <div className="analytics-workstream-bar-track"><div className="analytics-workstream-bar analytics-available-bar" style={{ width: `${(person.available / maxAvailable) * 100}%` }} /></div>
              <strong>{person.assignments}</strong>
              <strong>{Math.round(person.available).toLocaleString('en-US')}</strong>
            </div>
          ))}
          {mostAvailable.length === 0 && <p className="muted">No available capacity in the selected horizon.</p>}
        </div>
      </section>

      <section className="analytics-chart-panel analytics-gap-weeks-panel analytics-gap-deficit-panel">
        <h3>Highest deficit weeks</h3>
        <table className="analytics-gap-weeks-table">
          <thead><tr><th>Week</th><th>Deficit hours</th></tr></thead>
          <tbody>
            {highestDeficits.map((entry) => (
              <tr key={entry.index}>
                <td>{weekLabelShort(entry.index)}</td>
                <td className="analytics-gap-deficit">{Math.round(Math.abs(entry.gap)).toLocaleString('en-US')}</td>
              </tr>
            ))}
            {highestDeficits.length === 0 && <tr><td colSpan={2} className="muted">No deficit weeks</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="analytics-chart-panel analytics-gap-weeks-panel analytics-gap-surplus-panel">
        <h3>Highest capacity weeks</h3>
        <table className="analytics-gap-weeks-table">
          <thead><tr><th>Week</th><th>Surplus hours</th></tr></thead>
          <tbody>
            {highestCapacityWeeks.map((entry) => (
              <tr key={entry.index}>
                <td>{weekLabelShort(entry.index)}</td>
                <td className="analytics-gap-surplus">{Math.round(entry.gap).toLocaleString('en-US')}</td>
              </tr>
            ))}
            {highestCapacityWeeks.length === 0 && <tr><td colSpan={2} className="muted">No surplus weeks</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
