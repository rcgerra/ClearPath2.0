import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, errorMessage, lookupsApi, peopleApi, projectsApi } from '../api/client';
import PersonDemandChart from '../components/PersonDemandChart';
import UserSelect from '../components/admin/UserSelect';
import { useAuthStore } from '../store/authStore';
import { weekLabelShort, weekLabel } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';
import { canEditDemand, canEditProject } from '../utils/permissions';
import type { DemandRow, Person } from '../types';

const WEEKS = 104;
const CHART_WEEKS = 52;
const MAX_HOURS = 60;

function emptyWeeks() {
  return new Array(WEEKS).fill(0);
}

function addInto(target: number[], source: number[] | undefined) {
  if (!source) return target;
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
  return target;
}

export default function ProjectTeamPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [duplicating, setDuplicating] = useState<DemandRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [fteOnly, setFteOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  const project = useQuery({ queryKey: ['project', id], queryFn: () => projectsApi.get(id), enabled: Boolean(id) });
  const team = useQuery({ queryKey: ['project-team', id], queryFn: () => projectsApi.team(id), enabled: Boolean(id) });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const allCapacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });

  const editable = canEditDemand(user, project.data);
  const teamKey = ['project-team', id];

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data ?? []) map.set(person.id.toLowerCase(), person);
    return map;
  }, [people.data]);

  /** Demand across every project, and availability, per person. */
  const totals = useMemo(() => {
    const demandByPerson = new Map<string, number[]>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      const key = row.personId.toLowerCase();
      demandByPerson.set(key, addInto(demandByPerson.get(key) ?? emptyWeeks(), row.weeks));
    }
    const availabilityByPerson = new Map<string, number[]>();
    for (const row of allCapacity.data ?? []) {
      if (!row.personId) continue;
      const key = row.personId.toLowerCase();
      availabilityByPerson.set(key, addInto(availabilityByPerson.get(key) ?? emptyWeeks(), row.weeks));
    }
    return { demandByPerson, availabilityByPerson };
  }, [allDemand.data, allCapacity.data]);

  const rows = useMemo(() => {
    return (team.data ?? []).filter((row) => {
      const person = row.personId ? peopleById.get(row.personId.toLowerCase()) : undefined;
      if (!showInactive && (row.isActive === false || person?.isActive === false)) return false;
      if (fteOnly && person?.employmentType && person.employmentType.toLowerCase() !== 'fte') return false;
      return true;
    });
  }, [team.data, peopleById, showInactive, fteOnly]);

  const projectTotals = useMemo(() => {
    const total = emptyWeeks();
    for (const row of rows) addInto(total, row.weeks);
    return total;
  }, [rows]);

  const setWeek = useMutation({
    mutationFn: ({ demandId, week, hours }: { demandId: string; week: number; hours: number }) =>
      demandApi.setWeeks(demandId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<DemandRow[]>(teamKey, (current) =>
        current?.map((row) =>
          row.id === variables.demandId
            ? { ...row, weeks: row.weeks.map((value, index) => (index === variables.week ? variables.hours : value)) }
            : row,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['demand', 'all'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const addPerson = useMutation({
    mutationFn: (body: { personId: string; functionId?: string; weeks?: number[] }) =>
      demandApi.create({ projectId: id, ...body }),
    onSuccess: () => {
      setAdding(false);
      setDuplicating(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: teamKey });
      queryClient.invalidateQueries({ queryKey: ['demand', 'all'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setRowActive = useMutation({
    mutationFn: ({ demandId, isActive }: { demandId: string; isActive: boolean }) =>
      demandApi.update(demandId, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKey });
      queryClient.invalidateQueries({ queryKey: ['demand', 'all'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const checkIn = useMutation({
    mutationFn: () => projectsApi.update(id, { lastCheckIn: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
    onError: (err) => setError(errorMessage(err)),
  });

  const columns = useMemo(() => Array.from({ length: WEEKS }, (_, index) => index), []);

  // Default to the first visible member, and follow along if filtering removes the selection.
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedRow(null);
      return;
    }
    setSelectedRow((current) => (current && rows.some((row) => row.id === current) ? current : rows[0].id));
  }, [rows]);

  /** Check-ins go amber after 30 days and red after 60. */
  const daysSinceCheckIn = (() => {
    if (!project.data?.lastCheckIn) return Infinity;
    const last = new Date(project.data.lastCheckIn).getTime();
    if (Number.isNaN(last)) return Infinity;
    return Math.floor((Date.now() - last) / 86_400_000);
  })();
  const checkInClass = daysSinceCheckIn > 60 ? 'danger-solid' : daysSinceCheckIn > 30 ? 'warn-solid' : '';

  function commit(row: DemandRow, week: number, raw: string) {
    const key = `${row.id}:${week}`;
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const hours = Math.max(0, Math.min(MAX_HOURS, Math.round(Number(raw) || 0)));
    if (hours !== (row.weeks[week] ?? 0)) setWeek.mutate({ demandId: row.id, week, hours });
  }

  /** Arrow keys and Enter move between cells, like a spreadsheet. */
  function handleKey(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, week: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      Enter: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const caret = event.currentTarget.selectionStart;
      const atStart = caret === 0;
      const atEnd = caret === event.currentTarget.value.length;
      if ((event.key === 'ArrowLeft' && !atStart) || (event.key === 'ArrowRight' && !atEnd)) return;
    }
    const target = gridRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${rowIndex + move[0]}"][data-week="${week + move[1]}"]`,
    );
    if (target) {
      event.preventDefault();
      target.focus();
      target.select();
    }
  }

  /** Over-allocation is judged on the person's total demand, not just this project. */
  function utilizationFor(personId: string | undefined, week: number): number | null {
    if (!personId) return null;
    const key = personId.toLowerCase();
    const availability = totals.availabilityByPerson.get(key)?.[week] ?? 0;
    const demandHours = totals.demandByPerson.get(key)?.[week] ?? 0;
    if (availability <= 0) return demandHours > 0 ? Infinity : null;
    return demandHours / availability;
  }

  const selected = rows.find((row) => row.id === selectedRow);
  const selectedKey = selected?.personId?.toLowerCase() ?? '';
  const selectedAvailability = totals.availabilityByPerson.get(selectedKey) ?? emptyWeeks();
  const selectedTotal = totals.demandByPerson.get(selectedKey) ?? emptyWeeks();
  // Everything the person owes other projects, so the stack sums to their true load.
  const selectedOthers = selectedTotal.map((value, index) =>
    Math.max(0, value - (selected?.weeks[index] ?? 0)),
  );

  if (project.isLoading) return <p className="muted">Loading…</p>;

  const details = project.data;

  return (
    <section className="accent-section accent-projects">
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">{details?.name ?? 'Project'}</h1>
          <p className="page-subtitle">Team demand, {WEEKS} weeks from this Monday.</p>
        </div>
        <div className="row-actions">
          {editable && (
            <button
              onClick={() => {
                setDuplicating(null);
                setAdding((value) => !value);
              }}
            >
              + Add new person
            </button>
          )}
          <button
            className={checkInClass}
            onClick={() => checkIn.mutate()}
            disabled={!editable || checkIn.isPending}
            title={
              Number.isFinite(daysSinceCheckIn)
                ? `Last checked in ${daysSinceCheckIn} days ago`
                : 'This project has never been checked in'
            }
          >
            {checkIn.isPending ? 'Checking in…' : 'Check in project'}
          </button>
          {canEditProject(user, details) && (
            <Link to={`/projects/${id}/edit`}>
              <button className="accent-button">Edit details</button>
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Team demand</h2>
          <label className="switch">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Show inactive members</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={fteOnly} onChange={(event) => setFteOnly(event.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">FTE only</span>
          </label>
        </div>

        {(adding || duplicating) && (
          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const personId = String(form.get('personId') || '');
              if (!personId) return;
              addPerson.mutate({
                personId,
                functionId: String(form.get('functionId') || '') || duplicating?.functionId || undefined,
                weeks: duplicating ? duplicating.weeks.slice(0, WEEKS) : undefined,
              });
            }}
          >
            <div style={{ flex: 2 }}>
              <UserSelect
                id="personId"
                name="personId"
                label={duplicating ? `Copy ${duplicating.personName ?? 'this row'}'s hours to` : 'Person'}
                personValue
                required
              />
            </div>
            {!duplicating && (
              <div style={{ flex: 1 }}>
                <label htmlFor="functionId">Function</label>
                <select id="functionId" name="functionId">
                  <option value="">—</option>
                  {functions.data?.map((fn) => (
                    <option key={fn.id} value={fn.id}>
                      {fn.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="primary" type="submit" disabled={addPerson.isPending}>
              {duplicating ? 'Duplicate' : 'Add to team'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDuplicating(null);
              }}
            >
              Cancel
            </button>
          </form>
        )}

        <div className="matrix-scroll">
          <table className="weekly-matrix demand-grid" ref={gridRef}>
            <thead>
              <tr>
                <th className="matrix-label">Person</th>
                {columns.map((week) => (
                  <th key={week}>
                    <span className="week-head">
                      <span>{weekLabelShort(week)}</span>
                      <span className="week-year">{weekLabel(week).slice(-2)}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const person = row.personId ? peopleById.get(row.personId.toLowerCase()) : undefined;
                const isMe = Boolean(user?.personId && row.personId?.toLowerCase() === user.personId.toLowerCase());
                return (
                  <tr
                    key={row.id}
                    className={selectedRow === row.id ? 'row-selected' : undefined}
                    onClick={() => setSelectedRow(row.id)}
                  >
                    <th scope="row" className="matrix-label">
                      <span className="person-row">
                        <span className="person-identity">
                          <span className={isMe ? 'person-name person-me' : 'person-name'}>
                            {row.personName ?? 'Unassigned'}
                          </span>
                          <span className="person-department">
                            {person?.departmentName ?? row.functionName ?? '—'}
                            {row.isActive === false && ' · inactive'}
                          </span>
                        </span>
                        {editable && (
                          <span className="person-actions">
                            <button
                              title={`Copy ${row.personName ?? 'this person'}'s hours to someone else`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setAdding(false);
                                setDuplicating(row);
                              }}
                            >
                              ⧉
                            </button>
                            <button
                              className={row.isActive === false ? 'success' : 'danger'}
                              title={
                                row.isActive === false
                                  ? `Reactivate ${row.personName ?? 'this person'} on the team`
                                  : `Inactivate ${row.personName ?? 'this person'} on the team`
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                const reactivating = row.isActive === false;
                                if (
                                  reactivating ||
                                  window.confirm(`Inactivate ${row.personName ?? 'this person'} on this project team?`)
                                ) {
                                  setRowActive.mutate({ demandId: row.id, isActive: reactivating });
                                }
                              }}
                            >
                              {row.isActive === false ? '↻' : '⊘'}
                            </button>
                          </span>
                        )}
                      </span>
                    </th>
                    {columns.map((week) => {
                      const key = `${row.id}:${week}`;
                      const value = draft[key] ?? String(row.weeks[week] ?? 0);
                      const utilization = utilizationFor(row.personId, week);
                      const over = utilization !== null && utilization > 1;
                      return (
                        <td
                          key={week}
                          className={[Number(value) > 0 ? 'has-demand' : '', over ? 'over-allocated' : '']
                            .filter(Boolean)
                            .join(' ')}
                          title={
                            utilization === null
                              ? undefined
                              : `Total utilization ${
                                  Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : 'no availability'
                                } in week of ${weekLabel(week)}`
                          }
                        >
                          <input
                            type="number"
                            min={0}
                            max={MAX_HOURS}
                            step={1}
                            data-row={rowIndex}
                            data-week={week}
                            value={value === '0' ? '' : value}
                            readOnly={!editable}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                            onFocus={(event) => event.target.select()}
                            onBlur={(event) => commit(row, week, event.target.value)}
                            onKeyDown={(event) => handleKey(event, rowIndex, week)}
                            aria-label={`${row.personName ?? 'Person'} week of ${weekLabel(week)}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={WEEKS + 1} className="muted">
                    No one is assigned to this project yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="matrix-total">
                <th scope="row" className="matrix-label">
                  Total demand
                </th>
                {columns.map((week) => (
                  <td key={week}>{projectTotals[week] || ''}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted table-count">
          {rows.length} team {rows.length === 1 ? 'member' : 'members'} · hours per week, maximum {MAX_HOURS} · shaded
          cells are weeks where that person is over-allocated across all projects
        </p>
      </div>

      {selected && (
        <div className="card">
          <h2>
            {selected.personName ?? 'Person'} <span className="muted">· next {CHART_WEEKS} weeks</span>
          </h2>
          <PersonDemandChart
            weeks={CHART_WEEKS}
            thisProject={selected.weeks}
            otherProjects={selectedOthers}
            availability={selectedAvailability}
          />
        </div>
      )}

      <div className="card project-header">
        <h2>Project summary</h2>
        <div className="detail-grid">
          <div>
            <span className="detail-label">SPOT ID</span>
            <span className="mono">{details?.spotId ?? '—'}</span>
          </div>
          <div>
            <span className="detail-label">Project manager</span>
            {details?.managerName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Delegate</span>
            {details?.delegateName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Sponsor</span>
            {details?.sponsorName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Department</span>
            {details?.departmentName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Status</span>
            <span className="badge">{details?.status ?? '—'}</span>
          </div>
          <div>
            <span className="detail-label">Last check-in</span>
            <span className={checkInClass ? `check-in-${checkInClass}` : undefined}>
              {formatDate(details?.lastCheckIn)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
