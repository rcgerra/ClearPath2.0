import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, errorMessage, lookupsApi, nonProjectDemandApi, peopleApi, projectsApi } from '../api/client';
import ProjectAnalyticsInsights from '../components/ProjectAnalyticsInsights';
import AllocationConflictQueue from '../components/AllocationConflictQueue';
import PersonDemandChart from '../components/PersonDemandChart';
import ConflictResolutionPanel from '../components/ConflictResolutionPanel';
import DataReviewChecklistModal from '../components/DataReviewChecklistModal';
import ScheduleHealthBadge from '../components/ScheduleHealthBadge';
import KpiRow from '../components/KpiRow';
import SlideOverPanel from '../components/SlideOverPanel';
import UserSelect from '../components/admin/UserSelect';
import { useAuthStore } from '../store/authStore';
import { weekLabelShort, weekLabel, currentWeekStart, PLANNING_HORIZONS } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';
import { canEditDemand, canEditProject } from '../utils/permissions';
import { buildAllocationConflicts, type AllocationConflict } from '../utils/allocationRisk';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import type { DemandRow, Person } from '../types';

const WEEKS = 104;
const DEFAULT_WEEKS_TO_SHOW = 26;
const MAX_HOURS = 60;
type ProjectWorkspaceTab = 'overview' | 'team' | 'kpis' | 'risk' | 'details';

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState<AllocationConflict | null>(null);
  const [reviewChecklistOpen, setReviewChecklistOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectWorkspaceTab>('overview');
  const [weeksToShow, setWeeksToShow] = useState(DEFAULT_WEEKS_TO_SHOW);
  const [lookDirection, setLookDirection] = useState<'ahead' | 'back'>('ahead');
  const [teamSortColumn, setTeamSortColumn] = useState<'person' | 'totalProject' | 'totalFuture' | 'risk' | number>('risk');
  const [teamSortDirection, setTeamSortDirection] = useState<'asc' | 'desc'>('desc');
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
    onSuccess: () => {
      setReviewChecklistOpen(false);
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
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

  function toggleTeamSort(column: 'person' | 'totalProject' | 'totalFuture' | 'risk' | number) {
    if (column === teamSortColumn) setTeamSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setTeamSortColumn(column);
      setTeamSortDirection('asc');
    }
  }

  /** Total over-allocated hours per person across the visible horizon, used to sort the riskiest people to the top by default. */
  const riskByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, demandWeeks] of totals.demandByPerson) {
      const availabilityWeeks = totals.availabilityByPerson.get(key) ?? [];
      let over = 0;
      for (let week = 0; week < weeksToShow; week += 1) {
        const demandHours = demandWeeks[week] ?? 0;
        const availableHours = availabilityWeeks[week] ?? 0;
        if (demandHours > availableHours) over += demandHours - availableHours;
      }
      map.set(key, over);
    }
    return map;
  }, [totals, weeksToShow]);

  /** Team rows sorted by whichever column the user last clicked: risk, name, either total, or a week. */
  const sortedRows = useMemo(() => {
    const direction = teamSortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (teamSortColumn === 'person') {
        return direction * (a.personName ?? '').localeCompare(b.personName ?? '', undefined, { numeric: true, sensitivity: 'base' });
      }
      if (teamSortColumn === 'risk') {
        const riskA = riskByPerson.get(a.personId?.toLowerCase() ?? '') ?? 0;
        const riskB = riskByPerson.get(b.personId?.toLowerCase() ?? '') ?? 0;
        return direction * (riskA - riskB);
      }
      if (teamSortColumn === 'totalProject') return direction * (totalProjectDemandFor(a) - totalProjectDemandFor(b));
      if (teamSortColumn === 'totalFuture') return direction * (totalWindowDemandFor(a) - totalWindowDemandFor(b));
      return direction * ((a.weeks[teamSortColumn] ?? 0) - (b.weeks[teamSortColumn] ?? 0));
    });
  }, [rows, teamSortColumn, teamSortDirection, weeksToShow, lookDirection, riskByPerson]);

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

  const allocationConflicts = useMemo(
    () => buildAllocationConflicts({
      capacity: allCapacity.data ?? [],
      demand: allDemand.data ?? [],
      nonProjectDemand: allNonProjectDemand.data ?? [],
      people: people.data ?? [],
      horizon: weeksToShow,
      personIds: new Set(rows.flatMap((row) => row.personId ? [row.personId.toLowerCase()] : [])),
    }),
    [allCapacity.data, allDemand.data, allNonProjectDemand.data, people.data, rows, weeksToShow],
  );
  const overAllocatedCount = allocationConflicts.length;
  const scheduleHealth = useMemo(
    () => project.data
      ? calculateProjectScheduleHealth(
          project.data,
          (allDemand.data ?? []).filter((row) => row.projectId === id),
          {
            people: allocationConflicts.length,
            hours: allocationConflicts.reduce((sum, conflict) => sum + conflict.totalOver, 0),
          },
        )
      : null,
    [project.data, allDemand.data, id, allocationConflicts],
  );
  const totalPlannedDemand = scheduleHealth?.totalPlannedDemand ?? projectTotals.reduce((sum, value) => sum + value, 0);
  const timelineElapsedFraction = scheduleHealth?.timelineElapsedFraction ?? null;
  const schedulePrimaryReason = scheduleHealth?.reasons.find((reason) => !reason.includes('allocation conflict')) ?? scheduleHealth?.reasons[0];

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
            <p className="page-subtitle">
              {activeTab === 'overview' && 'Staffing health, delivery exposure, and actions requiring attention.'}
              {activeTab === 'team' && `Team demand, ${weeksToShow} weeks from this Monday.`}
              {activeTab === 'kpis' && `Performance indicators across ${weeksToShow} weeks.`}
              {activeTab === 'risk' && `Allocation risk across ${weeksToShow} weeks.`}
              {activeTab === 'details' && 'Project ownership, status, timing, and review information.'}
            </p>
          </div>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className={['icon-button', 'icon-button-add', 'icon-button-add-labeled', checkInClass].filter(Boolean).join(' ')}
            onClick={() => setReviewChecklistOpen(true)}
            disabled={!editable || checkIn.isPending}
            title={
              Number.isFinite(daysSinceCheckIn)
                ? `Last checked in ${daysSinceCheckIn} days ago`
                : 'This project has never been checked in'
            }
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
              <rect x="5" y="6" width="14" height="15" rx="2" />
              <polyline points="9 14 11 16 15 12" />
            </svg>
            <span>{checkIn.isPending ? 'Saving review…' : 'Periodic review'}</span>
          </button>
        </div>
      </div>

      <DataReviewChecklistModal
        open={reviewChecklistOpen}
        onClose={() => setReviewChecklistOpen(false)}
        onConfirm={() => checkIn.mutate()}
        confirming={checkIn.isPending}
        scope="project"
      />

      <div className="workspace-tabs-row">
      <nav className="workspace-tabs" aria-label="Project workspace">
        {([
          ['overview', 'Overview'],
          ['team', 'Team plan'],
          ['kpis', 'KPIs'],
          ['risk', 'Risk'],
          ['details', 'Project details'],
        ] as Array<[ProjectWorkspaceTab, string]>).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {label}
            {tab === 'risk' && overAllocatedCount > 0 && (
              <span className="tab-badge" aria-label={`${overAllocatedCount} people at risk`}>{overAllocatedCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="workspace-horizon-bar">
        <span>Planning horizon</span>
        <div className="pill-toggle" role="group" aria-label="Planning horizon">
          {PLANNING_HORIZONS.map((weeks) => (
            <button key={weeks} type="button" className={weeksToShow === weeks ? 'active' : ''} onClick={() => setWeeksToShow(weeks)}>{weeks} weeks</button>
          ))}
        </div>
      </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {activeTab === 'overview' && (
        <div className="project-overview-layout">
          <section className="card project-overview-summary">
            <div className="project-overview-heading">
              <div>
                <h2>Project health</h2>
                <p className="muted">Current staffing position across the next {weeksToShow} weeks.</p>
              </div>
              {scheduleHealth && <ScheduleHealthBadge health={scheduleHealth} />}
            </div>
            <KpiRow
              ariaLabel="Project health indicators"
              variant="inline"
              items={[
                { key: 'members', value: rows.length, label: 'Team members' },
                { key: 'planned', value: Math.round(totalPlannedDemand).toLocaleString(), label: 'Planned hours' },
                { key: 'at-risk', value: overAllocatedCount, label: 'People at risk', risk: overAllocatedCount > 0 },
                {
                  key: 'timeline',
                  value: timelineElapsedFraction === null ? '—' : `${Math.round(timelineElapsedFraction * 100)}%`,
                  label: 'Timeline elapsed',
                },
                {
                  key: 'days',
                  value: scheduleHealth?.daysToEnd === null || scheduleHealth?.daysToEnd === undefined
                    ? '—'
                    : scheduleHealth.daysToEnd >= 0 ? scheduleHealth.daysToEnd : scheduleHealth.daysOverdue,
                  label: scheduleHealth?.daysOverdue ? 'Days overdue' : 'Days to end',
                  risk: Boolean(scheduleHealth?.daysOverdue),
                },
              ]}
            />
            {scheduleHealth && (
              <div className="schedule-progress-summary">
                <div><span>Expected demand remaining</span><strong>{Math.round(scheduleHealth.expectedRemainingDemand).toLocaleString('en-US')} h</strong></div>
                <div><span>Demand still scheduled</span><strong>{Math.round(scheduleHealth.remainingDemand).toLocaleString('en-US')} h</strong></div>
                <div className={scheduleHealth.backLoadedDemand > 0 ? 'is-risk' : undefined}><span>Back-loaded demand gap</span><strong>{Math.round(scheduleHealth.backLoadedDemand).toLocaleString('en-US')} h</strong></div>
                <div className={scheduleHealth.demandAfterEnd > 0 ? 'is-risk' : undefined}><span>Demand beyond end date</span><strong>{Math.round(scheduleHealth.demandAfterEnd).toLocaleString('en-US')} h</strong></div>
              </div>
            )}
          </section>

          <section className="card project-attention-panel">
            <div className="project-overview-heading">
              <div>
                <h2>Needs attention</h2>
                <p className="muted">Issues most likely to affect delivery or confidence in the plan.</p>
              </div>
            </div>
            <div className="attention-list">
              <button type="button" onClick={() => setActiveTab('risk')}>
                <span className={overAllocatedCount > 0 ? 'attention-indicator danger' : 'attention-indicator clear'} />
                <span>
                  <strong>{overAllocatedCount > 0 ? `${overAllocatedCount} team member${overAllocatedCount === 1 ? '' : 's'} overallocated` : 'Team allocation is within availability'}</strong>
                  <small>{overAllocatedCount > 0 ? 'Review conflicts and competing assignments.' : 'No people exceed their available hours in this horizon.'}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" onClick={() => setActiveTab('details')}>
                <span className={checkInClass ? 'attention-indicator warning' : 'attention-indicator clear'} />
                <span>
                  <strong>{Number.isFinite(daysSinceCheckIn) ? `Plan reviewed ${daysSinceCheckIn} days ago` : 'Plan has not been reviewed'}</strong>
                  <small>{checkInClass ? 'Confirm that team demand and timing are still current.' : 'The project plan is within the review cadence.'}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" onClick={() => setActiveTab('details')}>
                <span className={scheduleHealth?.status === 'on-track' || scheduleHealth?.status === 'not-started' ? 'attention-indicator clear' : scheduleHealth?.status === 'watch' || scheduleHealth?.status === 'needs-dates' ? 'attention-indicator warning' : 'attention-indicator danger'} />
                <span>
                  <strong>{scheduleHealth?.label ?? 'Schedule needs review'}</strong>
                  <small>{schedulePrimaryReason ?? 'Confirm project dates and staffing assumptions.'}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          <section className="card project-next-actions">
            <h2>Plan the team</h2>
            <p className="muted">Review weekly demand or adjust the team before conflicts affect delivery.</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={() => setActiveTab('team')}>Open team plan</button>
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    setDuplicating(null);
                    setAdding(true);
                    setActiveTab('team');
                  }}
                >
                  Add team member
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'team' && (
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
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    setDuplicating(null);
                    setAdding((value) => !value);
                  }}
                >
                  + Add person
                </button>
              )}
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
                    className={`sort-header${teamSortColumn === 'risk' ? ' sorted' : ''}`}
                    onClick={() => toggleTeamSort('risk')}
                    aria-sort={teamSortColumn === 'risk' ? (teamSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Over-allocated
                    <span className="sort-arrow" aria-hidden="true">
                      {teamSortColumn === 'risk' ? (teamSortDirection === 'asc' ? '▲' : '▼') : '⇅'}
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
                    onClick={() => {
                      setSelectedRow(row.id);
                      setDetailsOpen(true);
                    }}
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
                    <td className={`matrix-total-cell${(riskByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0) > 0 ? ' is-risk' : ''}`}>
                      {Math.round(riskByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0) || '—'}
                    </td>
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
                  <td colSpan={weeksToShow + 4} className="muted">
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
                <td className="matrix-total-cell">{Math.round(rows.reduce((sum, row) => sum + (riskByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0), 0)) || ''}</td>
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
          {rows.length} team {rows.length === 1 ? 'member' : 'members'} · hours per week, maximum {MAX_HOURS} · sorted by
          over-allocated hours by default · select a row to see individual details
        </p>
        </div>
      </div>
      )}

      <SlideOverPanel
        open={detailsOpen && Boolean(selected)}
        onClose={() => setDetailsOpen(false)}
        title={<>Individual details{selected?.personName ? ` \u00b7 ${selected.personName}` : ''}</>}
        subtitle="This project's demand compared with the person's full workload."
      >
        {selected && (
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
        )}
      </SlideOverPanel>

      <SlideOverPanel open={Boolean(resolvingConflict)} onClose={() => setResolvingConflict(null)} hideHeader>
        {resolvingConflict && (
          <ConflictResolutionPanel
            conflict={resolvingConflict}
            context="project"
            onClose={() => setResolvingConflict(null)}
            onOpenTeam={() => {
              const row = rows.find((candidate) => candidate.personId?.toLowerCase() === resolvingConflict.personId);
              if (row) setSelectedRow(row.id);
              setResolvingConflict(null);
              setActiveTab('team');
            }}
          />
        )}
      </SlideOverPanel>

      {activeTab === 'kpis' && (
      <div className="card">
        <div className="toolbar project-section-header" style={{ marginBottom: analyticsCollapsed ? 0 : '0.75rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Performance KPIs</h2>
          <KpiRow
            ariaLabel="Project analytics summary"
            variant="compact"
            className="analytics-kpis"
            items={[
              { key: 'members', value: rows.length, label: 'Team members' },
              { key: 'planned', value: Math.round(totalPlannedDemand).toLocaleString(), label: 'Total planned demand' },
              {
                key: 'timeline',
                value: timelineElapsedFraction === null ? '—' : `${Math.round(timelineElapsedFraction * 100)}%`,
                label: 'Timeline elapsed',
              },
              { key: 'over-allocated', value: overAllocatedCount, label: 'Over-allocated members', risk: overAllocatedCount > 0 },
            ]}
          />
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
            showConflicts={false}
          />
        </div>
      </div>
      )}

      {activeTab === 'risk' && (
      <div className="card">
        <div className="toolbar project-section-header">
          <h2 style={{ margin: 0, flex: 1 }}>Risk</h2>
          <span className={overAllocatedCount > 0 ? 'risk-status risk-status-danger' : 'risk-status risk-status-clear'}>
            {overAllocatedCount > 0 ? `${overAllocatedCount} at risk` : 'No conflicts'}
          </span>
        </div>
        <section className="analytics-chart-panel">
          <h3>Allocation conflicts</h3>
          <p className="muted">Severity reflects peak weekly excess and how long the conflict persists. Department leads own resolution — flag conflicts to them here.</p>
          <AllocationConflictQueue conflicts={allocationConflicts} onOpen={(conflict) => setResolvingConflict(conflict)} />
        </section>
      </div>
      )}

      {activeTab === 'details' && (
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
            <span className="detail-label">Project demand delegate</span>
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
            <span className="detail-label">Project state</span>
            <span className={`badge ${details?.isActive === false ? 'danger' : 'success'}`}>
              {details?.isActive === false ? 'Inactive' : details?.started === false ? 'Not started' : 'Active'}
            </span>
          </div>
          <div>
            <span className="detail-label">Start date</span>
            {formatDate(details?.startDate)}
          </div>
          <div>
            <span className="detail-label">End date</span>
            {formatDate(details?.endDate)}
          </div>
          <div>
            <span className="detail-label">Last check-in</span>
            <span className={checkInClass ? `check-in-${checkInClass}` : undefined}>
              {formatDate(details?.lastCheckIn)}
            </span>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
