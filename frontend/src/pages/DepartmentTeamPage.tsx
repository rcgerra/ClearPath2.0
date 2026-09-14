import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, errorMessage, peopleApi } from '../api/client';
import PersonDemandChart from '../components/PersonDemandChart';
import { useAuthStore } from '../store/authStore';
import { weekLabel, weekLabelShort } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';
import { canEditAvailability, canEditDepartment } from '../utils/permissions';
import type { CapacityRow, Person } from '../types';

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

export default function DepartmentTeamPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [fteOnly, setFteOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  const department = useQuery({
    queryKey: ['department', id],
    queryFn: () => departmentsApi.get(id),
    enabled: Boolean(id),
  });
  const capacity = useQuery({
    queryKey: ['capacity', 'department', id],
    queryFn: () => capacityApi.list({ departmentId: id }),
    enabled: Boolean(id),
  });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });

  const editable = canEditAvailability(user, { department: department.data });
  const capacityKey = ['capacity', 'department', id];

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data ?? []) map.set(person.id.toLowerCase(), person);
    return map;
  }, [people.data]);

  /** Demand across every project, per person, for the utilization shading. */
  const demandByPerson = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      const key = row.personId.toLowerCase();
      map.set(key, addInto(map.get(key) ?? emptyWeeks(), row.weeks));
    }
    return map;
  }, [allDemand.data]);

  const rows = useMemo(() => {
    return (capacity.data ?? []).filter((row) => {
      const person = row.personId ? peopleById.get(row.personId.toLowerCase()) : undefined;
      if (!showInactive && (row.isActive === false || person?.isActive === false)) return false;
      if (fteOnly && person?.employmentType && person.employmentType.toLowerCase() !== 'fte') return false;
      return true;
    });
  }, [capacity.data, peopleById, showInactive, fteOnly]);

  const totals = useMemo(() => {
    const total = emptyWeeks();
    for (const row of rows) addInto(total, row.weeks);
    return total;
  }, [rows]);

  const assigned = new Set((capacity.data ?? []).map((row) => row.personId?.toLowerCase()).filter(Boolean) as string[]);
  const available = (people.data ?? []).filter(
    (person) => !assigned.has(person.id.toLowerCase()) && person.isActive !== false,
  );

  const columns = useMemo(() => Array.from({ length: WEEKS }, (_, index) => index), []);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedRow(null);
      return;
    }
    setSelectedRow((current) => (current && rows.some((row) => row.id === current) ? current : rows[0].id));
  }, [rows]);

  const setWeek = useMutation({
    mutationFn: ({ capacityId, week, hours }: { capacityId: string; week: number; hours: number }) =>
      capacityApi.setWeeks(capacityId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<CapacityRow[]>(capacityKey, (current) =>
        current?.map((row) =>
          row.id === variables.capacityId
            ? { ...row, weeks: row.weeks.map((value, index) => (index === variables.week ? variables.hours : value)) }
            : row,
        ),
      );
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const addPerson = useMutation({
    mutationFn: (body: { personId: string }) => capacityApi.create({ departmentId: id, ...body }),
    onSuccess: () => {
      setAdding(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: capacityKey });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setRowActive = useMutation({
    mutationFn: ({ capacityId, isActive }: { capacityId: string; isActive: boolean }) =>
      capacityApi.update(capacityId, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: capacityKey }),
    onError: (err) => setError(errorMessage(err)),
  });

  const checkIn = useMutation({
    mutationFn: () => departmentsApi.update(id, { lastCheckIn: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['department', id] }),
    onError: (err) => setError(errorMessage(err)),
  });

  /** Check-ins go amber after 30 days and red after 60. */
  const daysSinceCheckIn = (() => {
    if (!department.data?.lastCheckIn) return Infinity;
    const last = new Date(department.data.lastCheckIn).getTime();
    return Number.isNaN(last) ? Infinity : Math.floor((Date.now() - last) / 86_400_000);
  })();
  const checkInClass = daysSinceCheckIn > 60 ? 'danger-solid' : daysSinceCheckIn > 30 ? 'warn-solid' : '';

  function commit(row: CapacityRow, week: number, raw: string) {
    const key = `${row.id}:${week}`;
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const hours = Math.max(0, Math.min(MAX_HOURS, Math.round(Number(raw) || 0)));
    if (hours !== (row.weeks[week] ?? 0)) setWeek.mutate({ capacityId: row.id, week, hours });
  }

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

  /** Over-allocation compares the person's total demand with the availability in this row. */
  function utilizationFor(row: CapacityRow, week: number): number | null {
    const demandHours = demandByPerson.get(row.personId?.toLowerCase() ?? '')?.[week] ?? 0;
    const availability = row.weeks[week] ?? 0;
    if (availability <= 0) return demandHours > 0 ? Infinity : null;
    return demandHours / availability;
  }

  const selected = rows.find((row) => row.id === selectedRow);
  const selectedDemand = selected ? demandByPerson.get(selected.personId?.toLowerCase() ?? '') ?? emptyWeeks() : [];

  /** Demand for the selected person, split out per project for the detail table. */
  const selectedProjectDemand = useMemo(() => {
    const personId = selected?.personId?.toLowerCase();
    if (!personId) return [] as { projectId: string; projectName?: string; weeks: number[] }[];
    const map = new Map<string, { projectId: string; projectName?: string; weeks: number[] }>();
    for (const row of allDemand.data ?? []) {
      if (row.personId?.toLowerCase() !== personId) continue;
      const existing = map.get(row.projectId);
      if (existing) addInto(existing.weeks, row.weeks);
      else map.set(row.projectId, { projectId: row.projectId, projectName: row.projectName, weeks: addInto(emptyWeeks(), row.weeks) });
    }
    return Array.from(map.values()).sort((a, b) => (a.projectName ?? '').localeCompare(b.projectName ?? ''));
  }, [allDemand.data, selected?.personId]);

  const chartColumns = useMemo(() => Array.from({ length: CHART_WEEKS }, (_, index) => index), []);

  if (department.isLoading) return <p className="muted">Loading…</p>;

  const details = department.data;

  return (
    <section className="accent-section accent-departments">
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">{details?.name ?? 'Department'}</h1>
          <p className="page-subtitle">Team availability, {WEEKS} weeks from this Monday.</p>
        </div>
        <div className="row-actions">
          {editable && (
            <button
              onClick={() => {
                setAdding((value) => !value);
              }}
            >
              + Add new person
            </button>
          )}
          <button
            className={checkInClass}
            onClick={() => checkIn.mutate()}
            disabled={!canEditDepartment(user, details) || checkIn.isPending}
            title={
              Number.isFinite(daysSinceCheckIn)
                ? `Last checked in ${daysSinceCheckIn} days ago`
                : 'This department has never been checked in'
            }
          >
            {checkIn.isPending ? 'Checking in…' : 'Check in department'}
          </button>
          {canEditDepartment(user, details) && (
            <Link to={`/departments/${id}/edit`}>
              <button className="accent-button">Edit details</button>
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Team availability</h2>
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

        {adding && (
          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const personId = String(form.get('personId') || '');
              if (!personId) return;
              addPerson.mutate({ personId });
            }}
          >
            <div style={{ flex: 2 }}>
              <label htmlFor="personId">Person</label>
              <select id="personId" name="personId" required>
                <option value="">Select…</option>
                {available.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.departmentName ? ` · ${person.departmentName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" type="submit" disabled={addPerson.isPending}>
              Add to department
            </button>
            <button type="button" onClick={() => setAdding(false)}>
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
                            {person?.functionName ?? person?.employmentType ?? '—'}
                            {row.isActive === false && ' · inactive'}
                          </span>
                        </span>
                        {editable && (
                          <span className="person-actions">
                            <button
                              className={row.isActive === false ? '' : 'danger'}
                              title={
                                row.isActive === false
                                  ? `Reactivate ${row.personName ?? 'this person'}'s availability`
                                  : `Inactivate ${row.personName ?? 'this person'}'s availability`
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                const reactivating = row.isActive === false;
                                if (
                                  reactivating ||
                                  window.confirm(`Inactivate ${row.personName ?? 'this person'}'s availability?`)
                                ) {
                                  setRowActive.mutate({ capacityId: row.id, isActive: reactivating });
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
                      const utilization = utilizationFor(row, week);
                      const over = utilization !== null && utilization > 1;
                      return (
                        <td
                          key={week}
                          className={[Number(value) > 0 ? 'has-availability' : '', over ? 'over-allocated' : '']
                            .filter(Boolean)
                            .join(' ')}
                          title={
                            utilization === null
                              ? undefined
                              : `Utilization ${
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
                    No availability recorded for this department yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="matrix-total">
                <th scope="row" className="matrix-label">
                  Total availability
                </th>
                {columns.map((week) => (
                  <td key={week}>{totals[week] || ''}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted table-count">
          {rows.length} {rows.length === 1 ? 'person' : 'people'} · hours per week, maximum {MAX_HOURS} · shaded cells
          are weeks where demand exceeds availability
        </p>
      </div>

      {selected && (
        <div className="card">
          <h2>
            {selected.personName ?? 'Person'} <span className="muted">· next {CHART_WEEKS} weeks</span>
          </h2>
          <PersonDemandChart
            weeks={CHART_WEEKS}
            thisProject={emptyWeeks()}
            otherProjects={selectedDemand}
            availability={selected.weeks}
            showThis={false}
            otherLabel="Demand (all projects)"
          />

          <div className="matrix-scroll">
            <table className="weekly-matrix demand-grid">
              <thead>
                <tr>
                  <th className="matrix-label">Weekly detail</th>
                  {chartColumns.map((week) => (
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
                <tr>
                  <th scope="row" className="matrix-label">
                    Availability
                  </th>
                  {chartColumns.map((week) => (
                    <td key={week}>{selected.weeks[week] || ''}</td>
                  ))}
                </tr>
                {selectedProjectDemand.map((project) => (
                  <tr key={project.projectId}>
                    <th scope="row" className="matrix-label">
                      {project.projectName ?? 'Project'}
                    </th>
                    {chartColumns.map((week) => (
                      <td key={week}>{project.weeks[week] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="matrix-total">
                  <th scope="row" className="matrix-label">
                    Total demand
                  </th>
                  {chartColumns.map((week) => (
                    <td key={week}>{selectedDemand[week] || ''}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="matrix-label">
                    Utilization
                  </th>
                  {chartColumns.map((week) => {
                    const availability = selected.weeks[week] ?? 0;
                    const demandHours = selectedDemand[week] ?? 0;
                    const utilization = availability > 0 ? demandHours / availability : demandHours > 0 ? Infinity : null;
                    const over = utilization !== null && utilization > 1;
                    return (
                      <td key={week} className={over ? 'over-allocated' : undefined}>
                        {utilization === null ? '—' : Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '∞'}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="card project-header">
        <h2>Department summary</h2>
        <div className="detail-grid">
          <div>
            <span className="detail-label">Code</span>
            {details?.code ?? '—'}
          </div>
          <div>
            <span className="detail-label">Department lead</span>
            {details?.leadName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Delegate</span>
            {details?.delegateName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Function</span>
            {details?.functionName ?? '—'}
          </div>
          <div>
            <span className="detail-label">Status</span>
            <span className={`badge ${details?.isActive === false ? 'danger' : 'success'}`}>
              {details?.isActive === false ? 'Inactive' : 'Active'}
            </span>
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
