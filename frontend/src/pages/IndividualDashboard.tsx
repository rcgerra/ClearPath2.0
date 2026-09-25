import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { capacityApi, demandApi, errorMessage, nonProjectDemandApi, projectsApi } from '../api/client';
import PersonDemandChart from '../components/PersonDemandChart';
import { useAuthStore } from '../store/authStore';
import { weekLabel, weekLabelShort, weekYear, PLANNING_HORIZONS } from '../utils/arrayParser';
import { DemandRow, NonProjectDemandRow } from '../types';

const DEFAULT_WEEKS = 26;
const MAX_HOURS = 60;

function sumArrays(rows: number[][], weeks: number): number[] {
  const total = new Array(weeks).fill(0);
  for (const row of rows) {
    for (let index = 0; index < weeks; index += 1) total[index] += row[index] ?? 0;
  }
  return total;
}

/** Availability is whole hours only — block minus/plus/decimal/exponent keys before they're typed. */
function blockNonIntegerKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (['-', '+', '.', 'e', 'E'].includes(event.key)) event.preventDefault();
}

/** Appends the "highlighted" class for a week column when it matches the selected overage chip. */
function weekColumnClass(week: number, highlightedWeek: number | null, base?: string): string | undefined {
  return [base, week === highlightedWeek ? 'week-highlighted' : ''].filter(Boolean).join(' ') || undefined;
}

export default function IndividualDashboard() {
  const user = useAuthStore((state) => state.user);
  const personId = user?.personId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [draftDemand, setDraftDemand] = useState<Record<string, string>>({});
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [addingNonProjectDemand, setAddingNonProjectDemand] = useState(false);
  const [addingNewActivity, setAddingNewActivity] = useState(false);
  const [hideInactiveProjectRows, setHideInactiveProjectRows] = useState(true);
  const [hideInactiveOtherRows, setHideInactiveOtherRows] = useState(true);
  const [activeDemandTab, setActiveDemandTab] = useState<'project' | 'other'>('project');
  const [highlightedWeek, setHighlightedWeek] = useState<number | null>(null);
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
  const nonProjectDemand = useQuery({
    queryKey: ['non-project-demand', 'mine', personId],
    queryFn: () => nonProjectDemandApi.list({ personId }),
    enabled: Boolean(personId),
  });
  const nonProjectCategories = useQuery({
    queryKey: ['non-project-demand-categories'],
    queryFn: () => nonProjectDemandApi.categories(),
  });
  const nonProjectSubcategories = useQuery({
    queryKey: ['non-project-demand-subcategories'],
    queryFn: () => nonProjectDemandApi.subcategories(),
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
    onError: (cause) => setError(errorMessage(cause)),
  });
  const addNonProjectDemand = useMutation({
    mutationFn: async (body: { categoryId?: string; subcategoryId?: string; newActivityName?: string; description: string }) => {
      let subcategoryId = body.subcategoryId;
      if (body.newActivityName && body.categoryId) {
        subcategoryId = (await nonProjectDemandApi.createSubcategory({ categoryId: body.categoryId, name: body.newActivityName })).id;
      }
      if (!subcategoryId) throw new Error('Select an activity or create a new one.');
      return nonProjectDemandApi.create({ subcategoryId, personId: personId!, description: body.description });
    },
    onSuccess: () => {
      setAddingNonProjectDemand(false);
      setAddingNewActivity(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['non-project-demand', 'mine', personId] });
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-subcategories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const setNonProjectDemandWeek = useMutation({
    mutationFn: ({ demandId, week, hours }: { demandId: string; week: number; hours: number }) =>
      nonProjectDemandApi.setWeeks(demandId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<NonProjectDemandRow[]>(['non-project-demand', 'mine', personId], (current) =>
        current?.map((row) =>
          row.id === variables.demandId
            ? { ...row, weeks: row.weeks.map((value, index) => (index === variables.week ? variables.hours : value)) }
            : row,
        ),
      );
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const setNonProjectDemandActive = useMutation({
    mutationFn: ({ demandId, isActive }: { demandId: string; isActive: boolean }) =>
      nonProjectDemandApi.update(demandId, { isActive }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<NonProjectDemandRow[]>(['non-project-demand', 'mine', personId], (current) =>
        current?.map((row) => (row.id === variables.demandId ? { ...row, isActive: variables.isActive } : row)),
      );
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  function commitDemand(demandId: string, currentHours: number, week: number, raw: string) {
    const key = `${demandId}:${week}`;
    setDraftDemand((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const hours = Math.max(0, Math.min(MAX_HOURS, Math.round(Number(raw) || 0)));
    if (hours !== currentHours) setDemandWeek.mutate({ assignmentId: demandId, week, hours });
  }

  function commitNonProjectDemand(demandId: string, currentHours: number, week: number, raw: string) {
    const key = `${demandId}:${week}`;
    setDraftDemand((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const hours = Math.max(0, Math.min(MAX_HOURS, Math.round(Number(raw) || 0)));
    if (hours !== currentHours) setNonProjectDemandWeek.mutate({ demandId, week, hours });
  }

  const availability = useMemo(
    () => sumArrays((capacity.data ?? []).map((row) => row.weeks), weeks),
    [capacity.data, weeks],
  );

  /** Project demand for this person, one row per assignment. */
  const selectedProjectDemand = useMemo(() => {
    return (demand.data ?? [])
      .map((row) => ({
        demandId: row.id,
        projectId: row.projectId,
        projectName: row.projectName ?? row.name ?? 'Unnamed project',
        weeks: row.weeks,
        isActive: row.isActive !== false,
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [demand.data]);

  const selectedNonProjectDemand = useMemo(() => {
    return (nonProjectDemand.data ?? [])
      .slice()
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || (a.subcategoryName ?? '').localeCompare(b.subcategoryName ?? ''));
  }, [nonProjectDemand.data]);

  const selectedProjectTotal = useMemo(
    () => sumArrays(selectedProjectDemand.filter((row) => row.isActive).map((row) => row.weeks), weeks),
    [selectedProjectDemand, weeks],
  );

  const selectedNonProjectTotal = useMemo(
    () => sumArrays(selectedNonProjectDemand.filter((row) => row.isActive !== false).map((row) => row.weeks), weeks),
    [selectedNonProjectDemand, weeks],
  );

  const totalDemand = useMemo(
    () => sumArrays([selectedProjectTotal, selectedNonProjectTotal], weeks),
    [selectedProjectTotal, selectedNonProjectTotal, weeks],
  );

  const availableNonProjectCategories = useMemo(() => {
    return (nonProjectCategories.data ?? [])
      .filter((category) => category.isActive)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nonProjectCategories.data]);

  const availableNonProjectSubcategories = useMemo(
    () => (nonProjectSubcategories.data ?? [])
      .filter((subcategory) => subcategory.isActive)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
    [nonProjectSubcategories.data],
  );

  const nonProjectDemandRows = useMemo(() => {
    return selectedNonProjectDemand
      .map((row) => ({ id: row.id, name: row.subcategoryName ?? 'General', description: row.description ?? '', demand: row }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
  }, [selectedNonProjectDemand]);

  /** Assignment rows to render, honoring the "hide inactive" toggle. */
  const visibleProjectDemand = useMemo(() => {
    if (!hideInactiveProjectRows) return selectedProjectDemand;
    return selectedProjectDemand.filter((project) => project.isActive);
  }, [selectedProjectDemand, hideInactiveProjectRows]);

  /** Other-demand rows to render, honoring the "hide inactive" toggle. */
  const visibleNonProjectRows = useMemo(() => {
    if (!hideInactiveOtherRows) return nonProjectDemandRows;
    return nonProjectDemandRows.filter((row) => row.demand.isActive !== false);
  }, [nonProjectDemandRows, hideInactiveOtherRows]);

  const assignedProjectIds = new Set((demand.data ?? []).map((row) => row.projectId));
  const availableProjects = (projects.data ?? [])
    .filter((project) => !assignedProjectIds.has(project.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const chartColumns = useMemo(() => Array.from({ length: weeks }, (_, index) => index), [weeks]);
  /** Weeks where total demand exceeds availability, chronological, for the overage chip strip. */
  const overallocatedWeeks = useMemo(
    () => Array.from({ length: weeks }, (_, week) => ({
      week,
      over: Math.max(0, (totalDemand[week] ?? 0) - (availability[week] ?? 0)),
    })).filter((entry) => entry.over > 0),
    [availability, totalDemand, weeks],
  );

  /** Highlights the chosen week in the chart and scrolls/flashes its column in the visible table. */
  function highlightWeek(week: number) {
    setHighlightedWeek((current) => (current === week ? null : week));
  }

  useEffect(() => {
    if (highlightedWeek === null) return;
    const id = activeDemandTab === 'project' ? `project-week-${highlightedWeek}` : `other-week-${highlightedWeek}`;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    const timeout = setTimeout(() => setHighlightedWeek(null), 3000);
    return () => clearTimeout(timeout);
  }, [highlightedWeek, activeDemandTab]);

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
      <div className="my-work-header-row">
        <div className="department-title-row">
        <button type="button" className="back-button department-inline-back" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
          ←
        </button>
        <div>
          <h1 className="page-title">My Workload</h1>
          <p className="page-subtitle">Review and update project and run-the-business demand, {weeks} weeks from this Monday.</p>
        </div>
        </div>
      </div>

      <div className="workspace-tabs-row">
      <div className="workspace-horizon-bar">
        <span>Planning horizon</span>
        <div className="pill-toggle" role="group" aria-label="Planning horizon">
          {PLANNING_HORIZONS.map((horizon) => (
            <button key={horizon} type="button" className={weeks === horizon ? 'active' : ''} onClick={() => setWeeks(horizon)}>{horizon} weeks</button>
          ))}
        </div>
      </div>
      </div>

      <div className="card my-workload-card">
        <div id="my-workload-content">
          {error && <div className="alert error">{error}</div>}
          {(nonProjectDemand.isError || nonProjectCategories.isError || nonProjectSubcategories.isError) && (
            <div className="alert error">
              Other demand is unavailable:{' '}
              {errorMessage(nonProjectDemand.error ?? nonProjectCategories.error ?? nonProjectSubcategories.error)}
            </div>
          )}
          {capacity.isLoading || demand.isLoading ? (
            <p className="muted">Loading…</p>
          ) : (
            <PersonDemandChart
              weeks={weeks}
              thisProject={selectedNonProjectTotal}
              otherProjects={selectedProjectTotal}
              availability={availability}
              showThis={selectedNonProjectDemand.length > 0}
              thisLabel="Other demand"
              otherLabel="Project demand"
              thisColor="var(--asagi-blue)"
              otherColor="var(--sorairo-blue)"
              maxY={MAX_HOURS}
              highlightWeek={highlightedWeek}
            />
          )}

          {overallocatedWeeks.length > 0 && (
            <div className="overage-chip-row" role="group" aria-label="Weeks with overallocation">
              {overallocatedWeeks.map((entry) => (
                <button
                  key={entry.week}
                  type="button"
                  className={entry.week === highlightedWeek ? 'overage-chip active' : 'overage-chip'}
                  title={`Week of ${weekLabel(entry.week)}: ${Math.round(entry.over)} hours over availability`}
                  onClick={() => highlightWeek(entry.week)}
                >
                  {weekLabelShort(entry.week)}
                  <span className="overage-chip-token">{Math.round(entry.over)}h</span>
                </button>
              ))}
            </div>
          )}

          <div className="demand-section-toolbar">
            <div className="demand-tabs" role="tablist" aria-label="Demand type">
              <button
                type="button"
                role="tab"
                className={activeDemandTab === 'project' ? 'demand-tab active' : 'demand-tab'}
                aria-selected={activeDemandTab === 'project'}
                onClick={() => setActiveDemandTab('project')}
              >
                Project demand
              </button>
              <button
                type="button"
                role="tab"
                className={activeDemandTab === 'other' ? 'demand-tab active' : 'demand-tab'}
                aria-selected={activeDemandTab === 'other'}
                onClick={() => setActiveDemandTab('other')}
              >
                Other demand
              </button>
            </div>
            <button
              type="button"
              className="icon-button icon-button-add icon-button-add-labeled person-detail-action my-work-action"
              title="Add assignment"
              aria-label="Add assignment"
              onClick={() => {
                if (activeDemandTab === 'project') {
                  setAddingAssignment((value) => !value);
                  setAddingNonProjectDemand(false);
                } else {
                  setAddingNonProjectDemand((value) => !value);
                  setAddingAssignment(false);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
                <rect x="5" y="6" width="14" height="15" rx="2" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              <span>Add assignment</span>
            </button>
            <button
              type="button"
              className="icon-button icon-button-add-labeled my-workload-export-action"
              title="Export chart and full tables for printing or saving as PDF"
              aria-label="Export my workload"
              onClick={() => window.print()}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V3h12v6" />
                <rect x="6" y="13" width="12" height="8" />
                <path d="M6 17H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2" />
              </svg>
              <span>Export</span>
            </button>
            <label className="switch demand-zero-toggle" title="Hide inactive">
              <input
                type="checkbox"
                checked={activeDemandTab === 'project' ? hideInactiveProjectRows : hideInactiveOtherRows}
                onChange={(event) => {
                  if (activeDemandTab === 'project') setHideInactiveProjectRows(event.target.checked);
                  else setHideInactiveOtherRows(event.target.checked);
                }}
              />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Hide inactive</span>
            </label>
          </div>

          <div id="active-demand-content" hidden={activeDemandTab !== 'project'}>
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
              <button type="submit" className="primary" disabled={addAssignment.isPending || availableProjects.length === 0}>
                {addAssignment.isPending ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => setAddingAssignment(false)}>
                Cancel
              </button>
            </form>
          )}

          <div className="matrix-scroll">
            <table className="weekly-matrix demand-grid department-person-matrix">
              <colgroup>
                <col className="matrix-label-column" />
                <col span={chartColumns.length} />
              </colgroup>
              <thead>
                <tr>
                  <th className="matrix-label" aria-hidden="true" />
                  {chartColumns.map((week) => (
                    <th
                      key={week}
                      id={`project-week-${week}`}
                      className={weekColumnClass(week, highlightedWeek, weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined)}
                    >
                      {weekLabelShort(week)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleProjectDemand.length === 0 && (
                  <tr className="no-demand-notice-row">
                    <td colSpan={chartColumns.length + 1}>
                      You have no project assignments with demand over the selected period.
                    </td>
                  </tr>
                )}
                {visibleProjectDemand.map((project, rowIndex) => (
                  <tr
                    key={project.demandId}
                    id={`assignment-row-${project.projectId}`}
                    className={['assignment-row', rowIndex % 2 === 0 ? 'band-strong' : 'band-light'].join(' ')}
                  >
                    <th scope="row" className="matrix-label">
                      {project.projectName}
                    </th>
                    {chartColumns.map((week) => {
                      const key = `${project.demandId}:${week}`;
                      const currentHours = project.weeks[week] ?? 0;
                      const value = draftDemand[key] ?? (currentHours ? String(currentHours) : '');
                      return (
                        <td key={week} className={weekColumnClass(week, highlightedWeek, 'assignment-demand-cell')}>
                          <input
                            type="number"
                            min={0}
                            max={MAX_HOURS}
                            step={1}
                            value={value}
                            onChange={(event) => setDraftDemand((prev) => ({ ...prev, [key]: event.target.value }))}
                            onFocus={(event) => event.target.select()}
                            onBlur={(event) => commitDemand(project.demandId, currentHours, week, event.target.value)}
                            onKeyDown={blockNonIntegerKeys}
                            aria-label={`${project.projectName} demand week of ${weekLabel(week)}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="project-demand-section-row project-demand-total-row">
                  <th scope="row" className="matrix-label">
                    Column total
                  </th>
                  {chartColumns.map((week) => (
                    <td key={week} className={weekColumnClass(week, highlightedWeek)}>{visibleProjectDemand.reduce((sum, project) => sum + (project.weeks[week] ?? 0), 0) || ''}</td>
                  ))}
                </tr>
                <tr className="project-demand-section-row project-demand-total-row">
                  <th scope="row" className="matrix-label">
                    Subtotal
                  </th>
                  {chartColumns.map((week) => <td key={week} className={weekColumnClass(week, highlightedWeek)}>{selectedProjectTotal[week] || ''}</td>)}
                </tr>
                <tr className="matrix-total row-total-demand">
                  <th scope="row" className="matrix-label">Total demand</th>
                  {chartColumns.map((week) => <td key={week} className={weekColumnClass(week, highlightedWeek)}>{totalDemand[week] || ''}</td>)}
                </tr>
                <tr className="row-availability">
                  <th scope="row" className="matrix-label">My availability</th>
                  {chartColumns.map((week) => (
                    <td key={week} className={weekColumnClass(week, highlightedWeek, (availability[week] ?? 0) > 0 ? 'has-availability' : undefined)}>
                      {availability[week] ?? 0}
                    </td>
                  ))}
                </tr>
                <tr className="row-utilization">
                  <th scope="row" className="matrix-label">Utilization</th>
                  {chartColumns.map((week) => {
                    const availableHours = availability[week] ?? 0;
                    const demandHours = totalDemand[week] ?? 0;
                    const utilization = availableHours > 0 ? demandHours / availableHours : demandHours > 0 ? Infinity : null;
                    const utilClass =
                      utilization === null ? undefined : utilization > 1.25 ? 'utilization-danger' : utilization > 1 ? 'utilization-warn' : undefined;
                    return (
                      <td key={week} className={weekColumnClass(week, highlightedWeek, utilClass)}>
                        {utilization === null ? '—' : Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '∞'}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          </div>

          <div id="other-demand-content" hidden={activeDemandTab !== 'other'}>
          {addingNonProjectDemand && (
            <form
              className="toolbar assignment-picker non-project-demand-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const subcategoryId = String(form.get('subcategoryId') || '');
                const categoryId = String(form.get('categoryId') || '');
                const newActivityName = String(form.get('newActivityName') || '').trim();
                const description = String(form.get('description') || '').trim();
                if (addingNewActivity ? !categoryId || !newActivityName : !subcategoryId) {
                  setError('Select an activity.');
                  return;
                }
                if (!description) {
                  setError('Describe the task briefly.');
                  return;
                }
                addNonProjectDemand.mutate({
                  categoryId: categoryId || undefined,
                  subcategoryId: addingNewActivity ? undefined : subcategoryId,
                  newActivityName: addingNewActivity ? newActivityName : undefined,
                  description,
                });
              }}
            >
              <div>
                <label htmlFor="nonProjectSubcategoryId">Activity</label>
                <select
                  id="nonProjectSubcategoryId"
                  name="subcategoryId"
                  className="activity-selector"
                  defaultValue=""
                  required={!addingNewActivity}
                  onChange={(event) => setAddingNewActivity(event.target.value === '__new__')}
                >
                  <option value="">Select activity…</option>
                  {availableNonProjectSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                  <option value="__new__">Add new activity…</option>
                </select>
              </div>
              {addingNewActivity && (
                <>
                  <div>
                    <label htmlFor="newActivityCategory">Category</label>
                    <select id="newActivityCategory" name="categoryId" required defaultValue="">
                      <option value="">Select category…</option>
                      {availableNonProjectCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="newActivityName">New activity</label>
                    <input id="newActivityName" name="newActivityName" maxLength={200} required />
                  </div>
                </>
              )}
              <div>
                <label htmlFor="nonProjectDescription">Description</label>
                <input
                  id="nonProjectDescription"
                  name="description"
                  maxLength={200}
                  required
                  placeholder="e.g. Work order #12345"
                />
              </div>
              <button className="primary non-project-demand-action" type="submit" disabled={addNonProjectDemand.isPending}>
                {addNonProjectDemand.isPending ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => setAddingNonProjectDemand(false)}>Cancel</button>
            </form>
          )}

          <div className="matrix-scroll">
            <table className="weekly-matrix demand-grid department-person-matrix">
              <colgroup>
                <col className="matrix-label-column" />
                <col span={chartColumns.length} />
              </colgroup>
              <thead>
                <tr>
                  <th className="matrix-label" aria-hidden="true" />
                  {chartColumns.map((week) => (
                    <th
                      key={week}
                      id={`other-week-${week}`}
                      className={weekColumnClass(week, highlightedWeek, weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined)}
                    >
                      {weekLabelShort(week)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleNonProjectRows.length === 0 && (
                  <tr className="no-demand-notice-row">
                    <td colSpan={chartColumns.length + 1}>
                      You have no other demand assigned over the selected period.
                    </td>
                  </tr>
                )}
                {visibleNonProjectRows.map((subcategory, rowIndex) => (
                  <tr
                    key={subcategory.id}
                    className={`assignment-row non-project-demand-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}${
                      subcategory.demand.isActive === false ? ' inactive-row' : ''
                    }`}
                  >
                    <th scope="row" className="matrix-label">
                      <span className="non-project-demand-label">
                        <span>{subcategory.name}</span>
                        {subcategory.description && <span className="non-project-demand-description">{subcategory.description}</span>}
                      </span>
                      <span className="person-actions non-project-demand-actions">
                        <button
                          type="button"
                          className={`icon-button non-project-demand-toggle ${subcategory.demand.isActive === false ? 'success' : 'danger'}`}
                          title={
                            subcategory.demand.isActive === false
                              ? `Reopen ${subcategory.name}`
                              : `Mark ${subcategory.name} as finished and stop tracking`
                          }
                          aria-label={
                            subcategory.demand.isActive === false
                              ? `Reopen ${subcategory.name}`
                              : `Mark ${subcategory.name} as finished and stop tracking`
                          }
                          onClick={() =>
                            setNonProjectDemandActive.mutate({
                              demandId: subcategory.demand.id,
                              isActive: subcategory.demand.isActive === false,
                            })
                          }
                        >
                          {subcategory.demand.isActive === false ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                              <circle cx="12" cy="12" r="2.5" />
                              <line x1="3" y1="3" x2="21" y2="21" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </svg>
                          )}
                        </button>
                      </span>
                    </th>
                    {chartColumns.map((week) => {
                      const demandRow = subcategory.demand;
                      const key = `${demandRow?.id ?? subcategory.id}:${week}`;
                      const currentHours = demandRow?.weeks[week] ?? 0;
                      const value = demandRow ? draftDemand[key] ?? (currentHours ? String(currentHours) : '') : '';
                      return (
                        <td key={week} className={weekColumnClass(week, highlightedWeek, 'assignment-demand-cell')}>
                          <input
                            type="number"
                            min={0}
                            max={MAX_HOURS}
                            step={1}
                            value={value}
                            placeholder="0"
                            readOnly={!demandRow}
                            onChange={(event) => setDraftDemand((prev) => ({ ...prev, [key]: event.target.value }))}
                            onFocus={(event) => event.target.select()}
                            onBlur={(event) => {
                              if (demandRow) commitNonProjectDemand(demandRow.id, currentHours, week, event.target.value);
                            }}
                            onKeyDown={blockNonIntegerKeys}
                            aria-label={`${subcategory.name}, week of ${weekLabel(week)}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="non-project-demand-section-row non-project-demand-total-row">
                  <th scope="row" className="matrix-label">
                    Column total
                  </th>
                  {chartColumns.map((week) => (
                    <td key={week} className={weekColumnClass(week, highlightedWeek)}>{visibleNonProjectRows.reduce((sum, row) => sum + (row.demand.weeks[week] ?? 0), 0) || ''}</td>
                  ))}
                </tr>
                <tr className="non-project-demand-section-row non-project-demand-total-row">
                  <th scope="row" className="matrix-label">
                    Subtotal
                  </th>
                  {chartColumns.map((week) => <td key={week} className={weekColumnClass(week, highlightedWeek)}>{selectedNonProjectTotal[week] || ''}</td>)}
                </tr>
                <tr className="matrix-total row-total-demand">
                  <th scope="row" className="matrix-label">Total demand</th>
                  {chartColumns.map((week) => <td key={week} className={weekColumnClass(week, highlightedWeek)}>{totalDemand[week] || ''}</td>)}
                </tr>
                <tr className="row-availability">
                  <th scope="row" className="matrix-label">My availability</th>
                  {chartColumns.map((week) => (
                    <td key={week} className={weekColumnClass(week, highlightedWeek, (availability[week] ?? 0) > 0 ? 'has-availability' : undefined)}>
                      {availability[week] ?? 0}
                    </td>
                  ))}
                </tr>
                <tr className="row-utilization">
                  <th scope="row" className="matrix-label">Utilization</th>
                  {chartColumns.map((week) => {
                    const availableHours = availability[week] ?? 0;
                    const demandHours = totalDemand[week] ?? 0;
                    const utilization = availableHours > 0 ? demandHours / availableHours : demandHours > 0 ? Infinity : null;
                    const utilClass =
                      utilization === null ? undefined : utilization > 1.25 ? 'utilization-danger' : utilization > 1 ? 'utilization-warn' : undefined;
                    return (
                      <td key={week} className={weekColumnClass(week, highlightedWeek, utilClass)}>
                        {utilization === null ? '—' : Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '∞'}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          </div>

        </div>

      </div>
    </>
  );
}
