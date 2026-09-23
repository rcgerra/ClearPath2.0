import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, errorMessage, lookupsApi, nonProjectDemandApi, peopleApi, projectsApi } from '../api/client';
import ProjectAnalyticsInsights from '../components/ProjectAnalyticsInsights';
import PersonDemandChart from '../components/PersonDemandChart';
import UserSelect from '../components/admin/UserSelect';
import { useAuthStore } from '../store/authStore';
import { weekLabelShort, weekLabel, currentWeekStart } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';
import { canEditDemand, canEditProject } from '../utils/permissions';
import type { DemandRow, Person } from '../types';

const WEEKS = 104;
const DEFAULT_WEEKS_TO_SHOW = 52;
const MAX_HOURS = 60;

function emptyWeeks() {
  return new Array(WEEKS).fill(0);
}

function addInto(target: number[], source: number[] | undefined) {
  if (!source) return target;
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
  return target;
}

/** How many past weeks actually have data for a row, based on the Monday of its createdOn date.
 *  Unknown creation dates fail open (treated as fully editable) rather than locking history out. */
function weeksOfHistory(createdOn: string | undefined): number {
  if (!createdOn) return WEEKS;
  const created = new Date(createdOn);
  if (Number.isNaN(created.getTime())) return WEEKS;
  const createdMonday = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
  createdMonday.setUTCDate(createdMonday.getUTCDate() - ((createdMonday.getUTCDay() + 6) % 7));
  const weeks = Math.round((currentWeekStart().getTime() - createdMonday.getTime()) / (7 * 86_400_000));
  return Math.max(0, weeks);
}

export default function ProjectTeamPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [duplicating, setDuplicating] = useState<DemandRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [fteOnly, setFteOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [weeksToShow, setWeeksToShow] = useState(DEFAULT_WEEKS_TO_SHOW);
  const [lookDirection, setLookDirection] = useState<'ahead' | 'back'>('ahead');
  const [teamSortColumn, setTeamSortColumn] = useState<'person' | 'totalProject' | 'totalFuture' | number>('person');
  const [teamSortDirection, setTeamSortDirection] = useState<'asc' | 'desc'>('asc');
  const [teamDemandCollapsed, setTeamDemandCollapsed] = useState(false);
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState(false);
  const gridRef = useRef<HTMLTableElement>(null);

  const project = useQuery({ queryKey: ['project', id], queryFn: () => projectsApi.get(id), enabled: Boolean(id) });
  const team = useQuery({ queryKey: ['project-team', id], queryFn: () => projectsApi.team(id), enabled: Boolean(id) });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const allNonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });
  const allCapacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });

  const editable = canEditDemand(user, project.data);
  const teamKey = ['project-team', id];

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data ?? []) map.set(person.id.toLowerCase(), person);
    return map;
  }, [people.data]);

  /** Demand across every project and non-project activity, and availability, per person. */
  const totals = useMemo(() => {
    const demandByPerson = new Map<string, number[]>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      const key = row.personId.toLowerCase();
      demandByPerson.set(key, addInto(demandByPerson.get(key) ?? emptyWeeks(), row.weeks));
    }
    for (const row of allNonProjectDemand.data ?? []) {
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
  }, [allDemand.data, allNonProjectDemand.data, allCapacity.data]);

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
      // .map() only visits real 0..length-1 indices, so it silently drops look-back (negative) weeks.
      // Object.assign (not spread) is required too, since spread also skips negative-indexed keys.
      queryClient.setQueryData<DemandRow[]>(teamKey, (current) =>
        current?.map((row) => {
          if (row.id !== variables.demandId) return row;
          const weeks: number[] = Object.assign([], row.weeks);
          weeks[variables.week] = variables.hours;
          return { ...row, weeks };
        }),
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

  /** Look ahead shows the next N weeks from today, oldest to newest; look back shows the previous
   *  N weeks, most recent first (descending), so the last week is on the left. */
  const columns = useMemo(
    () => Array.from({ length: weeksToShow }, (_, index) => (lookDirection === 'back' ? -(index + 1) : index)),
    [weeksToShow, lookDirection],
  );

  /** Sums every week ever recorded for a row, including look-back edits stored on negative indices
   *  (which Array#reduce/slice silently skip since they aren't real array elements). */
  const totalProjectDemandFor = (row: DemandRow) =>
    Object.keys(row.weeks).reduce((sum, key) => sum + (Number(row.weeks[key as unknown as number]) || 0), 0);

  /** Look ahead: total across the visible forward window. Look back: total across the visible past window. */
  const totalWindowDemandFor = (row: DemandRow) => {
    if (lookDirection === 'back') {
      let total = 0;
      for (let week = 1; week <= weeksToShow; week += 1) total += row.weeks[-week] ?? 0;
      return total;
    }
    return row.weeks.slice(0, weeksToShow).reduce((sum, value) => sum + value, 0);
  };

  function toggleTeamSort(column: 'person' | 'totalProject' | 'totalFuture' | number) {
    if (column === teamSortColumn) setTeamSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setTeamSortColumn(column);
      setTeamSortDirection('asc');
    }
  }

  /** Team rows sorted by whichever column the user last clicked: name, either total, or a week. */
  const sortedRows = useMemo(() => {
    const direction = teamSortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (teamSortColumn === 'person') {
        return direction * (a.personName ?? '').localeCompare(b.personName ?? '', undefined, { numeric: true, sensitivity: 'base' });
      }
      if (teamSortColumn === 'totalProject') return direction * (totalProjectDemandFor(a) - totalProjectDemandFor(b));
      if (teamSortColumn === 'totalFuture') return direction * (totalWindowDemandFor(a) - totalWindowDemandFor(b));
      return direction * ((a.weeks[teamSortColumn] ?? 0) - (b.weeks[teamSortColumn] ?? 0));
    });
  }, [rows, teamSortColumn, teamSortDirection, weeksToShow, lookDirection]);

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
    if (week < 0 && week < -weeksOfHistory(row.createdOn)) return;
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

  /** Number of active projects and non-project activities each person is currently assigned to, for the analytics panel. */
  const assignmentCountByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      if (!row.weeks.slice(0, weeksToShow).some((value) => value > 0)) continue;
      const key = row.personId.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const row of allNonProjectDemand.data ?? []) {
      if (!row.personId) continue;
      if (!row.weeks.slice(0, weeksToShow).some((value) => value > 0)) continue;
      const key = row.personId.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [allDemand.data, allNonProjectDemand.data, weeksToShow]);

  /** Total demand modeled across the entire planning horizon, not just the visible weeks. */
  const totalPlannedDemand = useMemo(() => projectTotals.reduce((sum, value) => sum + value, 0), [projectTotals]);

  /** Fraction of the project's startDate\u2013endDate timeline that has elapsed, or null if dates aren't set. */
  const timelineElapsedFraction = useMemo(() => {
    const start = project.data?.startDate ? new Date(project.data.startDate).getTime() : NaN;
    if (Number.isNaN(start)) return null;
    const end = project.data?.endDate ? new Date(project.data.endDate).getTime() : NaN;
    const now = Date.now();
    if (Number.isNaN(end)) {
      // No end date: approximate remaining scope using the modeled planning horizon.
      const weeksElapsed = Math.max(0, (now - start) / (7 * 86_400_000));
      return weeksElapsed / (weeksElapsed + WEEKS);
    }
    if (end <= start) return null;
    return Math.max(0, Math.min(1, (now - start) / (end - start)));
  }, [project.data?.startDate, project.data?.endDate]);

  /** Weekly demand per function, for the stacked "demand by function" chart. */
  const weeklyDemandByFunction = useMemo(() => {
    const map = new Map<string, { id: string; label: string; weeks: number[] }>();
    for (const row of rows) {
      const key = row.functionId ?? 'unassigned';
      const label = row.functionName ?? 'Unassigned';
      const existing = map.get(key) ?? { id: key, label, weeks: new Array(weeksToShow).fill(0) };
      for (let week = 0; week < weeksToShow; week += 1) existing.weeks[week] += row.weeks[week] ?? 0;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [rows, weeksToShow]);

  /** Total demand per function over the project's full modeled horizon, ignoring the "Weeks to show" filter. */
  const demandByFunctionTotals = useMemo(() => {
    const map = new Map<string, { id: string; label: string; total: number }>();
    for (const row of rows) {
      const key = row.functionId ?? 'unassigned';
      const label = row.functionName ?? 'Unassigned';
      const existing = map.get(key) ?? { id: key, label, total: 0 };
      existing.total += row.weeks.reduce((sum, value) => sum + value, 0);
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [rows]);

  const peopleRisk = useMemo(
    () =>
      rows.map((row) => {
        const key = row.personId?.toLowerCase() ?? '';
        const demandWeeks = totals.demandByPerson.get(key) ?? emptyWeeks();
        const availabilityWeeks = totals.availabilityByPerson.get(key) ?? emptyWeeks();
        const demand = demandWeeks.slice(0, weeksToShow).reduce((sum, value) => sum + value, 0);
        const capacity = availabilityWeeks.slice(0, weeksToShow).reduce((sum, value) => sum + value, 0);
        const overWeeks = demandWeeks
          .slice(0, weeksToShow)
          .reduce((count, value, week) => count + (value > (availabilityWeeks[week] ?? 0) ? 1 : 0), 0);
        return {
          id: row.id,
          label: row.personName ?? 'Unassigned',
          departmentName: (key ? peopleById.get(key)?.departmentName : undefined) ?? row.functionName ?? '—',
          overAllocated: Math.max(0, demand - capacity),
          overWeeks,
          assignments: assignmentCountByPerson.get(key) ?? 0,
        };
      }),
    [rows, totals, assignmentCountByPerson, weeksToShow, peopleById],
  );

  const overAllocatedCount = useMemo(
    () => peopleRisk.filter((person) => person.overAllocated > 0).length,
    [peopleRisk],
  );

  /** This person's assignments across every project and non-project activity, for the individual details table. */
  const selectedAssignments = useMemo(() => {
    const personId = selected?.personId?.toLowerCase();
    if (!personId) return [];
    const projectAssignments = (allDemand.data ?? [])
      .filter((row) => row.personId?.toLowerCase() === personId)
      .map((row) => ({
        id: row.id,
        projectName: row.projectName ?? 'Unnamed project',
        isThisProject: row.projectId === id,
        weeks: row.weeks.slice(0, weeksToShow),
      }));
    const nonProjectAssignments = (allNonProjectDemand.data ?? [])
      .filter((row) => row.personId?.toLowerCase() === personId)
      .map((row) => ({
        id: row.id,
        projectName: `${row.categoryName ?? 'Other work'} \u2013 ${row.subcategoryName ?? 'General'}`,
        isThisProject: false,
        weeks: row.weeks.slice(0, weeksToShow),
      }));
    return [...projectAssignments, ...nonProjectAssignments].sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [allDemand.data, allNonProjectDemand.data, selected?.personId, id, weeksToShow]);


  if (project.isLoading) return <p className="muted">Loading…</p>;

  const details = project.data;


  return (
    <section className="accent-section accent-projects">
      <div className="accent-section-header">
        <div className="department-title-row">
          <button type="button" className="back-button department-inline-back" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            ←
          </button>
          <div>
            <h1 className="page-title">
              {details?.name ?? 'Project'}
              {canEditProject(user, details) && (
                <Link to={`/projects/${id}/edit`} className="icon-button title-icon-button" title="Edit project details" aria-label="Edit project details">
                  ✎
                </Link>
              )}
            </h1>
            <p className="page-subtitle">Team demand, {weeksToShow} weeks from this Monday.</p>
          </div>
        </div>
        <div className="row-actions">
          <label className="weeks-lookahead-control" htmlFor="project-weeks-to-show">
            Weeks to show
            <input
              id="project-weeks-to-show"
              type="number"
              min={1}
              max={WEEKS}
              value={weeksToShow}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setWeeksToShow(Math.min(WEEKS, Math.max(1, Math.round(next))));
              }}
            />
          </label>
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
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="toolbar project-section-header" style={{ marginBottom: teamDemandCollapsed ? 0 : '0.75rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Team &amp; individual details</h2>
          {!teamDemandCollapsed && (
            <>
              <div className="pill-toggle" role="group" aria-label="Look direction">
                <button type="button" className={lookDirection === 'ahead' ? 'active' : ''} onClick={() => setLookDirection('ahead')}>
                  Look ahead
                </button>
                <button type="button" className={lookDirection === 'back' ? 'active' : ''} onClick={() => setLookDirection('back')}>
                  Look back
                </button>
              </div>
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
            </>
          )}
          <button
            type="button"
            className="workload-collapse-button"
            aria-label={teamDemandCollapsed ? 'Expand Team demand' : 'Collapse Team demand'}
            aria-expanded={!teamDemandCollapsed}
            aria-controls="project-team-demand-content"
            title={teamDemandCollapsed ? 'Expand Team demand' : 'Collapse Team demand'}
            onClick={() => setTeamDemandCollapsed((value) => !value)}
          >
            <span className={teamDemandCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
          </button>
        </div>

        <div id="project-team-demand-content" hidden={teamDemandCollapsed}>
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
                <th className="matrix-label">
                  <button
                    type="button"
                    className={`sort-header${teamSortColumn === 'person' ? ' sorted' : ''}`}
                    onClick={() => toggleTeamSort('person')}
                    aria-sort={teamSortColumn === 'person' ? (teamSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Person
                    <span className="sort-arrow" aria-hidden="true">
                      {teamSortColumn === 'person' ? (teamSortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                </th>
                <th className="matrix-total-cell">
                  <button
                    type="button"
                    className={`sort-header${teamSortColumn === 'totalProject' ? ' sorted' : ''}`}
                    onClick={() => toggleTeamSort('totalProject')}
                    aria-sort={teamSortColumn === 'totalProject' ? (teamSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Total (project)
                    <span className="sort-arrow" aria-hidden="true">
                      {teamSortColumn === 'totalProject' ? (teamSortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                </th>
                <th className="matrix-total-cell">
                  <button
                    type="button"
                    className={`sort-header${teamSortColumn === 'totalFuture' ? ' sorted' : ''}`}
                    onClick={() => toggleTeamSort('totalFuture')}
                    aria-sort={teamSortColumn === 'totalFuture' ? (teamSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {lookDirection === 'back' ? 'Total (past)' : 'Total (future)'}
                    <span className="sort-arrow" aria-hidden="true">
                      {teamSortColumn === 'totalFuture' ? (teamSortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                </th>
                {columns.map((week) => (
                  <th key={week}>
                    <button
                      type="button"
                      className={`sort-header${teamSortColumn === week ? ' sorted' : ''}`}
                      onClick={() => toggleTeamSort(week)}
                      aria-sort={teamSortColumn === week ? (teamSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="week-head">
                        <span>{weekLabelShort(week)}</span>
                        <span className="week-year">{weekLabel(week).slice(-2)}</span>
                      </span>
                      <span className="sort-arrow" aria-hidden="true">
                        {teamSortColumn === week ? (teamSortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIndex) => {
                const person = row.personId ? peopleById.get(row.personId.toLowerCase()) : undefined;
                const isMe = Boolean(user?.personId && row.personId?.toLowerCase() === user.personId.toLowerCase());
                const rowHistoryWeeks = weeksOfHistory(row.createdOn);
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
                    <td className="matrix-total-cell">{totalProjectDemandFor(row) ?? 0}</td>
                    <td className="matrix-total-cell">{totalWindowDemandFor(row) ?? 0}</td>
                    {columns.map((week) => {
                      const key = `${row.id}:${week}`;
                      const hasHistory = week >= -rowHistoryWeeks;
                      const value = week < 0 && !hasHistory ? '' : draft[key] ?? String(row.weeks[week] ?? 0);
                      const utilization = utilizationFor(row.personId, week);
                      const over = utilization !== null && utilization > 1;
                      return (
                        <td
                          key={week}
                          className={[
                            Number(value) > 0 ? 'has-demand' : '',
                            over ? 'over-allocated' : '',
                            week < 0 ? (hasHistory ? 'week-has-history' : 'week-no-history') : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={
                            week < 0 && !hasHistory
                              ? `No data existed for the week of ${weekLabel(week)}`
                              : utilization === null
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
                            value={value}
                            readOnly={!editable || (week < 0 && !hasHistory)}
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
                  <td colSpan={weeksToShow + 3} className="muted">
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
                <td className="matrix-total-cell">{rows.reduce((sum, row) => sum + totalProjectDemandFor(row), 0) ?? 0}</td>
                <td className="matrix-total-cell">{rows.reduce((sum, row) => sum + totalWindowDemandFor(row), 0) ?? 0}</td>
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

        <h3 className="project-individual-details-heading">
          Individual details{selected?.personName ? <span className="muted"> · {selected.personName}</span> : null}
        </h3>
        {selected ? (
          <>
            <PersonDemandChart
              weeks={weeksToShow}
              thisProject={selected.weeks}
              otherProjects={selectedOthers}
              availability={selectedAvailability}
              thisLabel="This project"
              otherLabel="All other projects"
              thisColor="var(--asagi-blue)"
              otherColor="var(--sorairo-blue)"
            />
            <div className="matrix-scroll" style={{ marginTop: '1rem' }}>
              <table className="weekly-matrix demand-grid">
                <thead>
                  <tr>
                    <th className="matrix-label">Assignment</th>
                    {Array.from({ length: weeksToShow }, (_, week) => (
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
                  {selectedAssignments.map((assignment) => (
                    <tr key={assignment.id} className={assignment.isThisProject ? 'row-selected' : undefined}>
                      <th scope="row" className="matrix-label">
                        {assignment.projectName}
                      </th>
                      {assignment.weeks.map((hours, week) => (
                        <td key={week}>{hours || ''}</td>
                      ))}
                    </tr>
                  ))}
                  {selectedAssignments.length === 0 && (
                    <tr>
                      <td colSpan={weeksToShow + 1} className="muted">
                        No assignments found for this person.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Select a team member above to see their individual demand.</p>
        )}
        </div>
      </div>

      <div className="card">
        <div className="toolbar project-section-header" style={{ marginBottom: analyticsCollapsed ? 0 : '0.75rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Analytics</h2>
          <div className="department-header-kpis analytics-kpis" aria-label="Project analytics summary">
            <div className="department-header-kpi">
              <span className="value">{rows.length}</span>
              <span className="label">Team members</span>
            </div>
            <div className="department-header-kpi">
              <span className="value">{Math.round(totalPlannedDemand).toLocaleString()}</span>
              <span className="label">Total planned demand</span>
            </div>
            <div className="department-header-kpi">
              <span className="value">{timelineElapsedFraction === null ? '—' : `${Math.round(timelineElapsedFraction * 100)}%`}</span>
              <span className="label">Timeline elapsed</span>
            </div>
            <div className="department-header-kpi">
              <span className="value" style={{ color: overAllocatedCount > 0 ? 'var(--danger)' : undefined }}>
                {overAllocatedCount}
              </span>
              <span className="label">Over-allocated members</span>
            </div>
          </div>
          <button
            type="button"
            className="workload-collapse-button"
            aria-label={analyticsCollapsed ? 'Expand Analytics' : 'Collapse Analytics'}
            aria-expanded={!analyticsCollapsed}
            aria-controls="project-analytics-content"
            title={analyticsCollapsed ? 'Expand Analytics' : 'Collapse Analytics'}
            onClick={() => setAnalyticsCollapsed((value) => !value)}
          >
            <span className={analyticsCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
          </button>
        </div>
        <div id="project-analytics-content" hidden={analyticsCollapsed} aria-label="Analytics summary">
          <ProjectAnalyticsInsights
            weeklyDemandByFunction={weeklyDemandByFunction}
            weeksToShow={weeksToShow}
            demandByFunctionTotals={demandByFunctionTotals}
            timelineElapsedFraction={timelineElapsedFraction}
            peopleRisk={peopleRisk}
          />
        </div>
      </div>

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
