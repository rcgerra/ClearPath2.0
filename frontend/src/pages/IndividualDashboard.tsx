import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, errorMessage, nonProjectDemandApi, projectsApi } from '../api/client';
import PersonDemandChart from '../components/PersonDemandChart';
import { useAuthStore } from '../store/authStore';
import { weekLabel, weekLabelShort, weekYear, MAX_POSITIONS } from '../utils/arrayParser';
import { DemandRow, NonProjectDemandRow } from '../types';

const DEFAULT_WEEKS = 52;
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

export default function IndividualDashboard() {
  const personId = useAuthStore((state) => state.user?.personId);
  const queryClient = useQueryClient();
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [draftDemand, setDraftDemand] = useState<Record<string, string>>({});
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [addingNonProjectDemand, setAddingNonProjectDemand] = useState(false);
  const [nonProjectCategoryId, setNonProjectCategoryId] = useState('');
  const [hideZeroProjectRows, setHideZeroProjectRows] = useState(false);
  const [hideZeroOtherRows, setHideZeroOtherRows] = useState(false);
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
    mutationFn: async (body: { categoryId: string; subcategoryId?: string; newSubcategoryName?: string; description: string }) => {
      let subcategoryId = body.subcategoryId;
      if (body.newSubcategoryName) {
        subcategoryId = (await nonProjectDemandApi.createSubcategory({
          categoryId: body.categoryId,
          name: body.newSubcategoryName,
        })).id;
      }
      if (!subcategoryId) throw new Error('Select a subcategory or add a new one.');
      return nonProjectDemandApi.create({ subcategoryId, personId: personId!, description: body.description });
    },
    onSuccess: () => {
      setAddingNonProjectDemand(false);
      setNonProjectCategoryId('');
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
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [demand.data]);

  const selectedNonProjectDemand = useMemo(() => {
    return (nonProjectDemand.data ?? [])
      .slice()
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || (a.subcategoryName ?? '').localeCompare(b.subcategoryName ?? ''));
  }, [nonProjectDemand.data]);

  const selectedProjectTotal = useMemo(
    () => sumArrays(selectedProjectDemand.map((row) => row.weeks), weeks),
    [selectedProjectDemand, weeks],
  );

  const selectedNonProjectTotal = useMemo(
    () => sumArrays(selectedNonProjectDemand.map((row) => row.weeks), weeks),
    [selectedNonProjectDemand, weeks],
  );

  const totalDemand = useMemo(
    () => sumArrays([selectedProjectTotal, selectedNonProjectTotal], weeks),
    [selectedProjectTotal, selectedNonProjectTotal, weeks],
  );

  const availableNonProjectCategories = useMemo(() => {
    return (nonProjectCategories.data ?? []).filter((category) => category.isActive);
  }, [nonProjectCategories.data]);

  const availableNonProjectSubcategories = useMemo(() => {
    return (nonProjectSubcategories.data ?? []).filter(
      (subcategory) => subcategory.isActive && subcategory.categoryId === nonProjectCategoryId,
    );
  }, [nonProjectSubcategories.data, nonProjectCategoryId]);

  const nonProjectDemandGroups = useMemo(() => {
    return availableNonProjectCategories
      .map((category) => {
        const assignedRows = selectedNonProjectDemand.filter((row) => row.categoryId === category.id);
        const rows = assignedRows
          .map((row) => ({ id: row.id, name: row.subcategoryName ?? 'General', description: row.description ?? '', demand: row }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
        const total = sumArrays(assignedRows.map((row) => row.weeks), weeks);
        return { ...category, rows, total };
      })
      .filter((category) => category.rows.length > 0);
  }, [availableNonProjectCategories, selectedNonProjectDemand, weeks]);

  /** Assignment rows to render, honoring the "hide zero rows" toggle. */
  const visibleProjectDemand = useMemo(() => {
    if (!hideZeroProjectRows) return selectedProjectDemand;
    return selectedProjectDemand.filter((project) => project.weeks.slice(0, weeks).some((hours) => hours > 0));
  }, [selectedProjectDemand, hideZeroProjectRows, weeks]);

  /** Other-demand categories/rows to render, honoring the "hide zero rows" toggle. */
  const visibleNonProjectGroups = useMemo(() => {
    if (!hideZeroOtherRows) return nonProjectDemandGroups;
    return nonProjectDemandGroups
      .map((category) => ({
        ...category,
        rows: category.rows.filter((row) => row.demand.weeks.slice(0, weeks).some((hours) => hours > 0)),
      }))
      .filter((category) => category.rows.length > 0);
  }, [nonProjectDemandGroups, hideZeroOtherRows, weeks]);

  const metrics = useMemo(() => {
    const assignedProjects = selectedProjectDemand.filter((row) => row.weeks.slice(0, weeks).some((value) => value > 0)).length;
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
  }, [selectedProjectDemand, totalDemand, availability, weeks]);

  const assignedProjectIds = new Set((demand.data ?? []).map((row) => row.projectId));
  const availableProjects = (projects.data ?? []).filter((project) => !assignedProjectIds.has(project.id));
  const chartColumns = useMemo(() => Array.from({ length: weeks }, (_, index) => index), [weeks]);

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
        <div>
          <h1 className="page-title">My work</h1>
          <p className="page-subtitle">Weekly demand against your availability.</p>
        </div>
        <div className="department-header-kpis" aria-label="My work KPIs">
          <div className="department-header-kpi">
            <span className="value">{metrics.assignedProjects}</span>
            <span className="label">Current assignments</span>
          </div>
          <div className="department-header-kpi">
            <span className="value" style={{ color: metrics.overWeeks ? 'var(--danger)' : undefined }}>{metrics.overWeeks}</span>
            <span className="label">Weeks overallocated</span>
          </div>
          <div className="department-header-kpi">
            <span className="value" style={{ color: metrics.overHours ? 'var(--danger)' : undefined }}>{metrics.overHours}</span>
            <span className="label">Hours overallocated</span>
          </div>
          <div className="department-header-kpi">
            <span className="value">{metrics.utilization}%</span>
            <span className="label">Utilization</span>
          </div>
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
            />
          )}

          <div className="demand-section-toolbar">
            <h3 className="demand-section-title">Project demand</h3>
            <button
              type="button"
              className="icon-button icon-button-add icon-button-add-labeled person-detail-action my-work-action"
              title="Add assignment"
              aria-label="Add assignment"
              onClick={() => {
                setAddingAssignment((value) => !value);
                setAddingNonProjectDemand(false);
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
            <label className="switch demand-zero-toggle" title="Hide rows with zero demand">
              <input
                type="checkbox"
                checked={hideZeroProjectRows}
                onChange={(event) => setHideZeroProjectRows(event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Hide zero rows</span>
            </label>
          </div>

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
              <thead>
                <tr>
                  <th className="matrix-label" aria-hidden="true" />
                  {chartColumns.map((week) => (
                    <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
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
                  <tr key={project.demandId} className={`assignment-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}`}>
                    <th scope="row" className="matrix-label">
                      {project.projectName}
                    </th>
                    {chartColumns.map((week) => {
                      const key = `${project.demandId}:${week}`;
                      const currentHours = project.weeks[week] ?? 0;
                      const value = draftDemand[key] ?? (currentHours ? String(currentHours) : '');
                      return (
                        <td key={week} className="assignment-demand-cell">
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
                    Subtotal
                  </th>
                  {chartColumns.map((week) => <td key={week}>{selectedProjectTotal[week] || ''}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="demand-section-toolbar">
            <h3 className="demand-section-title">Other demand</h3>
            <button
              type="button"
              className="icon-button icon-button-add icon-button-add-labeled person-detail-action my-work-action"
              title="Add assignment"
              aria-label="Add assignment"
              onClick={() => {
                setAddingNonProjectDemand((value) => !value);
                setAddingAssignment(false);
              }}
            >
              <span aria-hidden="true">+</span>
              <span>Add assignment</span>
            </button>
            <label className="switch demand-zero-toggle" title="Hide rows with zero demand">
              <input
                type="checkbox"
                checked={hideZeroOtherRows}
                onChange={(event) => setHideZeroOtherRows(event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Hide zero rows</span>
            </label>
          </div>

          {addingNonProjectDemand && (
            <form
              className="toolbar assignment-picker non-project-demand-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const categoryId = String(form.get('categoryId') || '');
                const subcategoryId = String(form.get('subcategoryId') || '');
                const newSubcategoryName = String(form.get('newSubcategoryName') || '').trim();
                const description = String(form.get('description') || '').trim();
                if (!categoryId) return;
                if (!subcategoryId && !newSubcategoryName) {
                  setError('Select a subcategory or add a new one.');
                  return;
                }
                if (!description) {
                  setError('Describe the task briefly.');
                  return;
                }
                addNonProjectDemand.mutate({
                  categoryId,
                  subcategoryId: subcategoryId || undefined,
                  newSubcategoryName: newSubcategoryName || undefined,
                  description,
                });
              }}
            >
              <div>
                <label htmlFor="nonProjectCategoryId">Category</label>
                <select
                  id="nonProjectCategoryId"
                  name="categoryId"
                  required
                  value={nonProjectCategoryId}
                  onChange={(event) => setNonProjectCategoryId(event.target.value)}
                >
                  <option value="" disabled>
                    {nonProjectCategories.isLoading ? 'Loading categories…' : 'Select…'}
                  </option>
                  {availableNonProjectCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="nonProjectSubcategoryId">Subcategory</label>
                <select id="nonProjectSubcategoryId" name="subcategoryId" defaultValue="" disabled={!nonProjectCategoryId}>
                  <option value="">Select existing…</option>
                  {availableNonProjectSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="newNonProjectSubcategory">Or add a new subcategory</label>
                <input
                  id="newNonProjectSubcategory"
                  name="newSubcategoryName"
                  maxLength={200}
                  disabled={!nonProjectCategoryId}
                />
              </div>
              <div>
                <label htmlFor="nonProjectDescription">Description</label>
                <input
                  id="nonProjectDescription"
                  name="description"
                  maxLength={200}
                  required
                  placeholder="e.g. Work order #12345"
                  disabled={!nonProjectCategoryId}
                />
              </div>
              <button className="primary non-project-demand-action" type="submit" disabled={addNonProjectDemand.isPending || !nonProjectCategoryId}>
                {addNonProjectDemand.isPending ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => setAddingNonProjectDemand(false)}>Cancel</button>
            </form>
          )}

          <div className="matrix-scroll">
            <table className="weekly-matrix demand-grid department-person-matrix">
              <thead>
                <tr>
                  <th className="matrix-label" aria-hidden="true" />
                  {chartColumns.map((week) => (
                    <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
                      {weekLabelShort(week)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleNonProjectGroups.length === 0 && (
                  <tr className="no-demand-notice-row">
                    <td colSpan={chartColumns.length + 1}>
                      You have no other demand assigned over the selected period.
                    </td>
                  </tr>
                )}
                {visibleNonProjectGroups.map((category, categoryIndex) => (
                  <Fragment key={category.id}>
                    <tr className={`non-project-category-row ${categoryIndex % 2 === 0 ? 'category-band-70' : 'category-band-60'}`}>
                      <th scope="row" className="matrix-label">{category.name}</th>
                      {chartColumns.map((week) => <td key={week}>{category.total[week] || ''}</td>)}
                    </tr>
                    {category.rows.map((subcategory, rowIndex) => (
                      <tr key={subcategory.id} className={`assignment-row non-project-demand-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}`}>
                        <th scope="row" className="matrix-label">
                          {subcategory.name}
                          {subcategory.description && <span className="non-project-demand-description"> — {subcategory.description}</span>}
                        </th>
                        {chartColumns.map((week) => {
                          const demandRow = subcategory.demand;
                          const key = `${demandRow?.id ?? subcategory.id}:${week}`;
                          const currentHours = demandRow?.weeks[week] ?? 0;
                          const value = demandRow ? draftDemand[key] ?? (currentHours ? String(currentHours) : '') : '';
                          return (
                            <td key={week} className="assignment-demand-cell">
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
                                aria-label={`${category.name}, ${subcategory.name}, week of ${weekLabel(week)}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="non-project-demand-section-row non-project-demand-total-row">
                  <th scope="row" className="matrix-label">
                    Subtotal
                  </th>
                  {chartColumns.map((week) => <td key={week}>{selectedNonProjectTotal[week] || ''}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="matrix-scroll">
            <table className="weekly-matrix demand-grid department-person-matrix">
              <thead>
                <tr>
                  <th className="matrix-label" aria-hidden="true" />
                  {chartColumns.map((week) => (
                    <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
                      {weekLabelShort(week)}
                    </th>
                  ))}
                </tr>
              </thead>
              {!totalDemand.some((hours) => hours > 0) && (
                <tbody>
                  <tr className="no-demand-notice-row">
                    <td colSpan={chartColumns.length + 1}>
                      There is no assigned demand for you over the selected period.
                    </td>
                  </tr>
                </tbody>
              )}
              <tfoot>
                <tr className="matrix-total row-total-demand">
                  <th scope="row" className="matrix-label">
                    Total demand
                  </th>
                  {chartColumns.map((week) => <td key={week}>{totalDemand[week] || ''}</td>)}
                </tr>
                <tr className="row-availability">
                  <th scope="row" className="matrix-label">
                    My availability
                  </th>
                  {chartColumns.map((week) => (
                    <td key={week} className={(availability[week] ?? 0) > 0 ? 'has-availability' : undefined}>
                      {availability[week] ?? 0}
                    </td>
                  ))}
                </tr>
                <tr className="row-utilization">
                  <th scope="row" className="matrix-label">
                    Utilization
                  </th>
                  {chartColumns.map((week) => {
                    const availableHours = availability[week] ?? 0;
                    const demandHours = totalDemand[week] ?? 0;
                    const utilization = availableHours > 0 ? demandHours / availableHours : demandHours > 0 ? Infinity : null;
                    const utilClass =
                      utilization === null ? undefined : utilization > 1.25 ? 'utilization-danger' : utilization > 1 ? 'utilization-warn' : undefined;
                    return (
                      <td key={week} className={utilClass}>
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
    </>
  );
}
