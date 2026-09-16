import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, errorMessage, projectsApi } from '../api/client';
import CapacityChart from '../components/CapacityChart';
import WeeklyMatrix, { MatrixRow } from '../components/WeeklyMatrix';
import { useAuthStore } from '../store/authStore';
import { DemandRow } from '../types';
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
  const queryClient = useQueryClient();
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [hideZeroRows, setHideZeroRows] = useState(true);
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [workloadCollapsed, setWorkloadCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    enabled: addingAssignment,
  });
  const addAssignment = useMutation({
    mutationFn: (projectId: string) => demandApi.create({ projectId, personId }),
    onSuccess: () => {
      setAddingAssignment(false);
      setHideZeroRows(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['demand', 'mine'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const setDemandWeek = useMutation({
    mutationFn: ({ assignmentId, week, hours }: { assignmentId: string; week: number; hours: number }) =>
      demandApi.setWeeks(assignmentId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<DemandRow[]>(['demand', 'mine'], (current) =>
        current?.map((row) =>
          row.id === variables.assignmentId
            ? { ...row, weeks: row.weeks.map((value, index) => (index === variables.week ? variables.hours : value)) }
            : row,
        ),
      );
    },
  });

  const availability = useMemo(
    () => sumArrays((capacity.data ?? []).map((row) => row.weeks), weeks),
    [capacity.data, weeks],
  );

  const projectRows = useMemo<MatrixRow[]>(() => {
    return (demand.data ?? []).map((row) => ({
      id: row.id,
      label: row.projectName ?? row.name ?? 'Unnamed project',
      weeks: Array.from({ length: weeks }, (_, index) => row.weeks[index] ?? 0),
    })).sort((a, b) => a.label.localeCompare(b.label));
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
  const assignedProjectIds = new Set((demand.data ?? []).map((row) => row.projectId));
  const availableProjects = (projects.data ?? []).filter((project) => !assignedProjectIds.has(project.id));

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

      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="label">Current Assignments</div>
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

      <div className="card my-workload-card">
        <div className="toolbar my-workload-header">
          <h2 style={{ margin: 0, flex: 1 }}>My Workload</h2>
          <div className="weeks-lookahead-control">
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
          <button
            type="button"
            className="workload-collapse-button"
            aria-label={workloadCollapsed ? 'Expand My Workload' : 'Collapse My Workload'}
            aria-expanded={!workloadCollapsed}
            aria-controls="my-workload-content"
            title={workloadCollapsed ? 'Expand My Workload' : 'Collapse My Workload'}
            onClick={() => setWorkloadCollapsed((value) => !value)}
          >
            <span className={workloadCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
          </button>
        </div>
        <div id="my-workload-content" hidden={workloadCollapsed}>
        <section className="workload-section">
          <div className="toolbar demand-subheader">
            <h2 className="workload-subheader">Demand vs Availability</h2>
            <label className="switch my-work-filter-switch">
              <input type="checkbox" checked={hideZeroRows} onChange={(event) => setHideZeroRows(event.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Hide projects with no demand</span>
            </label>
          </div>
        {capacity.isLoading || demand.isLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <CapacityChart weeks={weeks} demand={totalDemand} availability={availability} />
        )}
        </section>

        <section className="workload-section workload-weekly-section">
          <div className="toolbar weekly-detail-header" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, flex: 1 }}>Weekly detail</h2>
          <button
            type="button"
            className="icon-button icon-button-add icon-button-add-labeled my-work-add-assignment"
            aria-expanded={addingAssignment}
            onClick={() => setAddingAssignment((value) => !value)}
          >
            <span aria-hidden="true">+</span>
            <span>Add assignment</span>
          </button>
        </div>
        {error && <div className="alert error">{error}</div>}
        {addingAssignment && (
          <form
            className="toolbar assignment-picker"
            onSubmit={(event) => {
              event.preventDefault();
              const projectId = String(new FormData(event.currentTarget).get('projectId') || '');
              if (projectId) addAssignment.mutate(projectId);
            }}
          >
            <div>
              <label htmlFor="selfAssignmentProject">Project</label>
              <select id="selfAssignmentProject" name="projectId" required defaultValue="">
                <option value="" disabled>
                  {projects.isLoading ? 'Loading projects…' : 'Select…'}
                </option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="primary assign-me-button" disabled={addAssignment.isPending || availableProjects.length === 0}>
              {addAssignment.isPending ? 'Adding…' : 'Assign me'}
            </button>
            <button type="button" onClick={() => setAddingAssignment(false)}>Cancel</button>
          </form>
        )}
          <WeeklyMatrix
            weeks={weeks}
            availability={availability}
            projects={visibleRows}
            totalDemand={totalDemand}
            onDemandChange={(assignmentId, week, hours) => setDemandWeek.mutate({ assignmentId, week, hours })}
          />
        </section>
        </div>
      </div>
    </>
  );
}
