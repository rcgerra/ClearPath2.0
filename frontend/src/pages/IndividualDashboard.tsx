import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi } from '../api/client';
import CapacityChart from '../components/CapacityChart';
import WeeklyMatrix, { MatrixRow } from '../components/WeeklyMatrix';
import { useAuthStore } from '../store/authStore';
import { MAX_POSITIONS } from '../utils/arrayParser';

const DEFAULT_WEEKS = 52;

function sumArrays(rows: number[][], weeks: number): number[] {
  const total = new Array(weeks).fill(0);
  for (const row of rows) {
    for (let index = 0; index < weeks; index += 1) total[index] += row[index] ?? 0;
  }
  return total;
}

export default function IndividualDashboard() {
  const personId = useAuthStore((state) => state.user?.personId);
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [hideZeroRows, setHideZeroRows] = useState(true);

  const capacity = useQuery({
    queryKey: ['capacity', 'mine'],
    queryFn: () => capacityApi.list({ mine: true }),
    enabled: Boolean(personId),
  });
  const demand = useQuery({
    queryKey: ['demand', 'mine'],
    queryFn: () => demandApi.list({ mine: true }),
    enabled: Boolean(personId),
  });

  const availability = useMemo(
    () => sumArrays((capacity.data ?? []).map((row) => row.weeks), weeks),
    [capacity.data, weeks],
  );

  const projectRows = useMemo<MatrixRow[]>(() => {
    const byProject = new Map<string, MatrixRow>();
    for (const row of demand.data ?? []) {
      const key = row.projectId ?? row.id;
      const existing = byProject.get(key);
      if (existing) {
        for (let index = 0; index < weeks; index += 1) existing.weeks[index] += row.weeks[index] ?? 0;
      } else {
        byProject.set(key, {
          id: key,
          label: row.projectName ?? 'Unnamed project',
          weeks: Array.from({ length: weeks }, (_, index) => row.weeks[index] ?? 0),
        });
      }
    }
    return [...byProject.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [demand.data, weeks]);

  const totalDemand = useMemo(
    () => sumArrays(projectRows.map((row) => row.weeks), weeks),
    [projectRows, weeks],
  );

  const metrics = useMemo(() => {
    const assignedProjects = projectRows.filter((row) => row.weeks.some((value) => value > 0)).length;
    let overWeeks = 0;
    let overHours = 0;
    for (let index = 0; index < weeks; index += 1) {
      const over = totalDemand[index] - (availability[index] ?? 0);
      if (over > 0) {
        overWeeks += 1;
        overHours += over;
      }
    }
    const demandHours = totalDemand.reduce((sum, value) => sum + value, 0);
    const availableHours = availability.reduce((sum, value) => sum + value, 0);
    return {
      assignedProjects,
      overWeeks,
      overHours,
      utilization: availableHours > 0 ? Math.round((demandHours / availableHours) * 100) : 0,
    };
  }, [projectRows, totalDemand, availability, weeks]);

  const visibleRows = hideZeroRows ? projectRows.filter((row) => row.weeks.some((value) => value > 0)) : projectRows;

  if (!personId) {
    return (
      <div className="card">
        <h2>No person record linked</h2>
        <p className="muted">
          Your directory account is not linked to a _People record yet. Ask an administrator to run the user sync.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">My work</h1>
      <p className="page-subtitle">Weekly demand against your availability.</p>

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div style={{ width: 180 }}>
            <label htmlFor="weeks">Weeks to look ahead</label>
            <input
              id="weeks"
              type="number"
              min={1}
              max={MAX_POSITIONS}
              value={weeks}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setWeeks(Math.min(MAX_POSITIONS, Math.max(1, Math.round(next))));
              }}
            />
          </div>
          <div className="row-actions">
            {[26, 52, 104].map((preset) => (
              <button
                key={preset}
                type="button"
                className={weeks === preset ? 'primary' : ''}
                onClick={() => setWeeks(preset)}
              >
                {preset} wks
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="label">Projects assigned</div>
          <div className="value">{metrics.assignedProjects}</div>
        </div>
        <div className="stat">
          <div className="label">Weeks over-allocated</div>
          <div className="value" style={{ color: metrics.overWeeks ? 'var(--danger)' : 'var(--success)' }}>
            {metrics.overWeeks}
          </div>
        </div>
        <div className="stat">
          <div className="label">Hours over-allocated</div>
          <div className="value" style={{ color: metrics.overHours ? 'var(--danger)' : 'var(--success)' }}>
            {metrics.overHours}
          </div>
        </div>
        <div className="stat">
          <div className="label">Utilization</div>
          <div className="value">{metrics.utilization}%</div>
        </div>
      </div>

      <div className="card">
        <h2>Demand vs. availability</h2>
        {capacity.isLoading || demand.isLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <CapacityChart weeks={weeks} demand={totalDemand} availability={availability} />
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Weekly detail</h2>
          <label className="switch">
            <input type="checkbox" checked={hideZeroRows} onChange={(event) => setHideZeroRows(event.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Hide projects with no demand</span>
          </label>
        </div>
        <WeeklyMatrix weeks={weeks} availability={availability} projects={visibleRows} />
      </div>
    </>
  );
}
