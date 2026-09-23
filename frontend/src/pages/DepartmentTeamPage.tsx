import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, errorMessage, nonProjectDemandApi, peopleApi, projectsApi } from '../api/client';
import PersonDemandChart from '../components/PersonDemandChart';
import TeamDemandChart from '../components/TeamDemandChart';
import DepartmentAnalyticsInsights from '../components/DepartmentAnalyticsInsights';
import PlanningScenarioPanel, { type ScenarioWeekOverrides } from '../components/PlanningScenarioPanel';
import ConflictResolutionPanel from '../components/ConflictResolutionPanel';
import KpiRow from '../components/KpiRow';
import SlideOverPanel from '../components/SlideOverPanel';
import UserSelect from '../components/admin/UserSelect';
import { useAuthStore } from '../store/authStore';
import { weekLabel, weekLabelShort, weekYear, PLANNING_HORIZONS } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';
import { canEditAvailability, canEditDepartment } from '../utils/permissions';
import { applyWeekOverrides, buildAllocationConflicts, type AllocationConflict } from '../utils/allocationRisk';
import type { CapacityRow, DemandRow, NonProjectDemandRow, Person } from '../types';

const WEEKS = 104;
const MAX_HOURS = 60;
type DepartmentWorkspaceTab = 'overview' | 'team' | 'availability' | 'assignments' | 'kpis' | 'risk';

function formatWholeNumber(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftDemand, setDraftDemand] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferDepartmentId, setTransferDepartmentId] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [fteOnly, setFteOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState<AllocationConflict | null>(null);
  const [activeTab, setActiveTab] = useState<DepartmentWorkspaceTab>('overview');
  const [scenarioActive, setScenarioActive] = useState(false);
  const [scenarioOverrides, setScenarioOverrides] = useState<ScenarioWeekOverrides>({});
  const [showAllPersonSeries, setShowAllPersonSeries] = useState(false);
  const [selectedAnalyticsSeriesId, setSelectedAnalyticsSeriesId] = useState<string | null>(null);
  const [teamChartMode, setTeamChartMode] = useState<'person' | 'project'>('person');
  const [analyticsTableSort, setAnalyticsTableSort] = useState<'name' | 'total'>('name');
  const [analyticsTableSortDirection, setAnalyticsTableSortDirection] = useState<'asc' | 'desc'>('asc');
  const [activeDetailDemandTab, setActiveDetailDemandTab] = useState<'project' | 'other'>('project');
  const [detailWeeks, setDetailWeeks] = useState(13);
  const alertThreshold = 40;
  const [bulkAvailability, setBulkAvailability] = useState('40');
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [addingNonProjectDemand, setAddingNonProjectDemand] = useState(false);
  const [addingNewActivity, setAddingNewActivity] = useState(false);
  const [hideZeroProjectRows, setHideZeroProjectRows] = useState(true);
  const [hideZeroOtherRows, setHideZeroOtherRows] = useState(true);
  const [departmentView, setDepartmentView] = useState<'details' | 'heatmap'>('details');
  const [teamOverviewCollapsed, setTeamOverviewCollapsed] = useState(false);
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState(true);
  const [analyticsSummaryCollapsed, setAnalyticsSummaryCollapsed] = useState(true);
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
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list() });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const nonProjectDemand = useQuery({
    queryKey: ['non-project-demand', 'department', id],
    queryFn: () => nonProjectDemandApi.list({ departmentId: id }),
    enabled: Boolean(id),
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

  const editable = canEditAvailability(user, { department: department.data });
  /** Roster actions (normalize/inactivate) are admin, availability-moderator or department-lead territory — not self-service. */
  const canManageRoster = canEditDepartment(user, department.data);
  const capacityKey = ['capacity', 'department', id];

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data ?? []) map.set(person.id.toLowerCase(), person);
    return map;
  }, [people.data]);

  /** Project and non-project demand per person, for utilization and overallocation. */
  const demandByPerson = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      const key = row.personId.toLowerCase();
      map.set(key, addInto(map.get(key) ?? emptyWeeks(), row.weeks));
    }
    for (const row of nonProjectDemand.data ?? []) {
      const key = row.personId.toLowerCase();
      map.set(key, addInto(map.get(key) ?? emptyWeeks(), row.weeks));
    }
    return map;
  }, [allDemand.data, nonProjectDemand.data]);

  /** Roster and heatmap default to the riskiest people first, so overallocation is visible without sorting manually. */
  const rows = useMemo(() => {
    const filtered = (capacity.data ?? []).filter((row) => {
      const person = row.personId ? peopleById.get(row.personId.toLowerCase()) : undefined;
      if (!showInactive && (row.isActive === false || person?.isActive === false)) return false;
      if (fteOnly && person?.employmentType && person.employmentType.toLowerCase() !== 'fte') return false;
      return true;
    });
    const hoursOverFor = (row: CapacityRow) => {
      const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? [];
      let over = 0;
      for (let week = 0; week < detailWeeks; week += 1) {
        const diff = (demandWeeks[week] ?? 0) - (row.weeks[week] ?? 0);
        if (diff > 0) over += diff;
      }
      return over;
    };
    return [...filtered].sort((a, b) => hoursOverFor(b) - hoursOverFor(a));
  }, [capacity.data, peopleById, showInactive, fteOnly, demandByPerson, detailWeeks]);

  const totals = useMemo(() => {
    const total = emptyWeeks();
    for (const row of rows) addInto(total, row.weeks);
    return total;
  }, [rows]);

  /** Overallocation and activity-count KPIs for the visible (filtered) roster, across the weeks shown in the table. */
  const kpis = useMemo(() => {
    const overAllocatedWeeks = new Set<number>();
    let hoursOverAllocated = 0;
    for (const row of rows) {
      const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
      for (let week = 0; week < detailWeeks; week += 1) {
        const over = (demandWeeks[week] ?? 0) - (row.weeks[week] ?? 0);
        if (over > 0) {
          overAllocatedWeeks.add(week);
          hoursOverAllocated += over;
        }
      }
    }

    const personIds = new Set(rows.map((row) => row.personId?.toLowerCase()).filter(Boolean) as string[]);
    const projectIds = new Set<string>();
    for (const demandRow of allDemand.data ?? []) {
      if (!demandRow.personId || !personIds.has(demandRow.personId.toLowerCase())) continue;
      if (demandRow.weeks.slice(0, detailWeeks).some((value) => value > 0)) projectIds.add(demandRow.projectId);
    }

    for (const demandRow of nonProjectDemand.data ?? []) {
      if (!personIds.has(demandRow.personId.toLowerCase())) continue;
      if (demandRow.weeks.slice(0, detailWeeks).some((value) => value > 0)) projectIds.add(`non-project:${demandRow.categoryId}`);
    }

    return { weeksOverAllocated: overAllocatedWeeks.size, hoursOverAllocated, activityCount: projectIds.size };
  }, [rows, demandByPerson, allDemand.data, nonProjectDemand.data, detailWeeks]);

  /** Distinct projects with demand > 0 in the table window, per person. */
  const assignmentCountByPerson = useMemo(() => {
    const projectsByPerson = new Map<string, Set<string>>();
    for (const demandRow of allDemand.data ?? []) {
      if (!demandRow.personId) continue;
      if (!demandRow.weeks.slice(0, WEEKS).some((value) => value > 0)) continue;
      const key = demandRow.personId.toLowerCase();
      const set = projectsByPerson.get(key) ?? new Set<string>();
      set.add(demandRow.projectId);
      projectsByPerson.set(key, set);
    }
    for (const demandRow of nonProjectDemand.data ?? []) {
      if (!demandRow.weeks.slice(0, WEEKS).some((value) => value > 0)) continue;
      const key = demandRow.personId.toLowerCase();
      const set = projectsByPerson.get(key) ?? new Set<string>();
      set.add(`non-project:${demandRow.categoryId}`);
      projectsByPerson.set(key, set);
    }
    const counts = new Map<string, number>();
    for (const [key, set] of projectsByPerson) counts.set(key, set.size);
    return counts;
  }, [allDemand.data, nonProjectDemand.data]);

  /** Per-person overallocation across the weeks shown in the table. */
  function overallocationFor(row: CapacityRow, demandWeeks: number[], horizon = WEEKS) {
    let weeksOver = 0;
    let hoursOver = 0;
    for (let week = 0; week < WEEKS; week += 1) {
      if (week >= horizon) break;
      const over = (demandWeeks[week] ?? 0) - (row.weeks[week] ?? 0);
      if (over > 0) {
        weeksOver += 1;
        hoursOver += over;
      }
    }
    return { weeksOver, hoursOver };
  }

  function heatmapColors(utilization: number | null) {
    const stops = [
      { value: 0, color: [104, 141, 88] },
      { value: 1, color: [104, 141, 88] },
      { value: 1.1, color: [230, 170, 26] },
      { value: 1.35, color: [217, 45, 54] },
      { value: 2.1, color: [125, 29, 43] },
    ];
    const value = Math.min(2.1, Math.max(0, utilization ?? 0));
    const upperIndex = stops.findIndex((stop) => value <= stop.value);
    const lower = stops[Math.max(0, upperIndex - 1)];
    const upper = stops[Math.max(0, upperIndex)];
    const range = upper.value - lower.value || 1;
    const progress = (value - lower.value) / range;
    const color = lower.color.map((channel, index) => Math.round(channel + (upper.color[index] - channel) * progress));
    const luminance = (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000;
    return {
      backgroundColor: `rgb(${color.join(', ')})`,
      color: luminance < 155 ? 'var(--white)' : 'var(--dark-grey)',
    };
  }

  const columns = useMemo(() => Array.from({ length: detailWeeks }, (_, index) => index), [detailWeeks]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedRow(null);
      return;
    }
    setSelectedRow((current) => (current && rows.some((row) => row.id === current) ? current : rows[0].id));
  }, [rows]);

  useEffect(() => {
    setAddingAssignment(false);
    setAddingNonProjectDemand(false);
  }, [selectedRow]);

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

  const setDemandWeek = useMutation({
    mutationFn: ({ demandId, week, hours }: { demandId: string; week: number; hours: number }) =>
      demandApi.setWeeks(demandId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<DemandRow[]>(['demand', 'all'], (current) =>
        current?.map((row) =>
          row.id === variables.demandId
            ? { ...row, weeks: row.weeks.map((value, index) => (index === variables.week ? variables.hours : value)) }
            : row,
        ),
      );
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setNonProjectDemandWeek = useMutation({
    mutationFn: ({ demandId, week, hours }: { demandId: string; week: number; hours: number }) =>
      nonProjectDemandApi.setWeeks(demandId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<NonProjectDemandRow[]>(['non-project-demand', 'department', id], (current) =>
        current?.map((row) =>
          row.id === variables.demandId
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

  const transferPerson = useMutation({
    mutationFn: ({ personId, departmentId }: { personId: string; departmentId: string }) =>
      peopleApi.update(personId, { departmentId }),
    onSuccess: () => {
      setTransferring(false);
      setTransferDepartmentId('');
      setSelectedRow(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['capacity', 'department', id] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const addAssignment = useMutation({
    mutationFn: (body: { projectId: string; personId: string }) => demandApi.create(body),
    onSuccess: () => {
      setAddingAssignment(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['demand', 'all'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const addNonProjectDemand = useMutation({
    mutationFn: async (body: {
      categoryId?: string;
      subcategoryId?: string;
      newActivityName?: string;
      description: string;
      personId: string;
      departmentId?: string;
    }) => {
      let subcategoryId = body.subcategoryId;
      if (body.newActivityName && body.categoryId) {
        subcategoryId = (await nonProjectDemandApi.createSubcategory({ categoryId: body.categoryId, name: body.newActivityName })).id;
      }
      if (!subcategoryId) throw new Error('Select an activity or create a new one.');
      return nonProjectDemandApi.create({
        subcategoryId,
        personId: body.personId,
        departmentId: body.departmentId,
        description: body.description,
      });
    },
    onSuccess: () => {
      setAddingNonProjectDemand(false);
      setAddingNewActivity(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['non-project-demand', 'department', id] });
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-subcategories'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setRowActive = useMutation({
    mutationFn: ({ capacityId, isActive }: { capacityId: string; isActive: boolean }) =>
      capacityApi.update(capacityId, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: capacityKey }),
    onError: (err) => setError(errorMessage(err)),
  });

  const normalize = useMutation({
    mutationFn: ({ capacityId, weeks }: { capacityId: string; weeks: number[] }) =>
      capacityApi.update(capacityId, { weeks }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: capacityKey }),
    onError: (err) => setError(errorMessage(err)),
  });

  const setAllAvailability = useMutation({
    mutationFn: ({ capacityId, weeks }: { capacityId: string; weeks: number[] }) =>
      capacityApi.update(capacityId, { weeks }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<CapacityRow[]>(capacityKey, (current) =>
        current?.map((row) => (row.id === variables.capacityId ? { ...row, weeks: variables.weeks } : row)),
      );
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const applyScenario = useMutation({
    mutationFn: async (updates: Array<{ id: string; weeks: number[] }>) => {
      await Promise.all(updates.map((update) => capacityApi.update(update.id, { weeks: update.weeks })));
    },
    onSuccess: () => {
      setScenarioActive(false);
      setScenarioOverrides({});
      setError(null);
      queryClient.invalidateQueries({ queryKey: capacityKey });
      queryClient.invalidateQueries({ queryKey: ['capacity', 'all'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  /** Sets this week's availability to match total demand, only across the weeks shown in the table. */
  function normalizeAvailability(row: CapacityRow) {
    const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
    const nextWeeks = row.weeks.slice();
    for (let week = 0; week < detailWeeks; week += 1) {
      nextWeeks[week] = Math.max(0, Math.min(MAX_HOURS, Math.round(demandWeeks[week] ?? 0)));
    }
    const weeksAbove50 = nextWeeks.slice(0, detailWeeks).filter((hours) => hours > 50).length;
    if (
      weeksAbove50 > 0 &&
      !window.confirm(
        `Normalizing ${row.personName ?? 'this person'}'s availability will set ${weeksAbove50} week${
          weeksAbove50 === 1 ? '' : 's'
        } above 50 hours. Continue?`,
      )
    ) {
      return;
    }
    normalize.mutate({ capacityId: row.id, weeks: nextWeeks });
  }

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

  function commitDemand(demandId: string, currentHours: number, week: number, raw: string) {
    const key = `${demandId}:${week}`;
    setDraftDemand((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const hours = Math.max(0, Math.min(MAX_HOURS, Math.round(Number(raw) || 0)));
    if (hours !== currentHours) setDemandWeek.mutate({ demandId, week, hours });
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

  /** Availability is whole hours only — block minus/plus/decimal/exponent keys before they're typed. */
  function blockNonIntegerKeys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (['-', '+', '.', 'e', 'E'].includes(event.key)) event.preventDefault();
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

  const selected = rows.find((row) => row.id === selectedRow);
  const selectedDemand = selected ? demandByPerson.get(selected.personId?.toLowerCase() ?? '') ?? emptyWeeks() : [];

  /** Equalize is pointless once availability already matches demand every week, even where demand is 0. */
  const selectedEqualizeDisabled = (() => {
    if (!selected) return true;
    let alreadyMatches = true;
    for (let week = 0; week < detailWeeks; week += 1) {
      const demandHours = selectedDemand[week] ?? 0;
      if ((selected.weeks[week] ?? 0) !== demandHours) alreadyMatches = false;
    }
    return alreadyMatches;
  })();

  /** Demand for the selected person, split out per project for the detail table. */
  const selectedProjectDemand = useMemo(() => {
    const personId = selected?.personId?.toLowerCase();
    if (!personId) return [] as { demandId: string; projectId: string; projectName?: string; weeks: number[] }[];
    const map = new Map<string, { demandId: string; projectId: string; projectName?: string; weeks: number[] }>();
    for (const row of allDemand.data ?? []) {
      if (row.personId?.toLowerCase() !== personId) continue;
      const existing = map.get(row.projectId);
      if (existing) addInto(existing.weeks, row.weeks);
      else
        map.set(row.projectId, {
          demandId: row.id,
          projectId: row.projectId,
          projectName: row.projectName,
          weeks: addInto(emptyWeeks(), row.weeks),
        });
    }
    return Array.from(map.values()).sort((a, b) => (a.projectName ?? '').localeCompare(b.projectName ?? ''));
  }, [allDemand.data, selected?.personId]);

  const selectedNonProjectDemand = useMemo(() => {
    const personId = selected?.personId?.toLowerCase();
    if (!personId) return [];
    return (nonProjectDemand.data ?? [])
      .filter((row) => row.personId.toLowerCase() === personId)
      .sort((a, b) =>
        a.categoryName.localeCompare(b.categoryName) || (a.subcategoryName ?? '').localeCompare(b.subcategoryName ?? ''),
      );
  }, [nonProjectDemand.data, selected?.personId]);

  const selectedProjectTotal = useMemo(() => {
    const total = emptyWeeks();
    for (const row of selectedProjectDemand) addInto(total, row.weeks);
    return total;
  }, [selectedProjectDemand]);

  const selectedNonProjectTotal = useMemo(() => {
    const total = emptyWeeks();
    for (const row of selectedNonProjectDemand) addInto(total, row.weeks);
    return total;
  }, [selectedNonProjectDemand]);

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

  /** Assignment rows to render, honoring the "hide zero rows" toggle. */
  const visibleProjectDemand = useMemo(() => {
    if (!hideZeroProjectRows) return selectedProjectDemand;
    return selectedProjectDemand.filter((project) => project.weeks.slice(0, detailWeeks).some((hours) => hours > 0));
  }, [selectedProjectDemand, hideZeroProjectRows, detailWeeks]);

  /** Other-demand rows to render, honoring the "hide zero rows" toggle. */
  const visibleNonProjectRows = useMemo(() => {
    if (!hideZeroOtherRows) return nonProjectDemandRows;
    return nonProjectDemandRows.filter((row) => row.demand.weeks.slice(0, detailWeeks).some((hours) => hours > 0));
  }, [nonProjectDemandRows, hideZeroOtherRows, detailWeeks]);


  /** Projects the selected person isn't already staffed on, for the "add assignment" picker. */
  const availableProjectsForAssignment = useMemo(() => {
    const assignedProjectIds = new Set(selectedProjectDemand.map((project) => project.projectId));
    return (projects.data ?? [])
      .filter((project) => !assignedProjectIds.has(project.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects.data, selectedProjectDemand]);

  const chartColumns = useMemo(() => Array.from({ length: detailWeeks }, (_, index) => index), [detailWeeks]);

  /** One demand series per visible person, respecting the show-inactive/FTE-only filters. */
  const teamSeries = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        label: row.personName ?? 'Unassigned',
        weeks: demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks(),
      })),
    [rows, demandByPerson],
  );

  /** Same demand, sliced by project instead of person — only from projects the visible roster is staffed on. */
  const teamSeriesByProject = useMemo(() => {
    const personIds = new Set(rows.map((row) => row.personId?.toLowerCase()).filter(Boolean) as string[]);
    const map = new Map<string, { id: string; label: string; weeks: number[]; people: Set<string> }>();
    const categoryNames = new Map((nonProjectCategories.data ?? []).map((category) => [category.id, category.name]));
    for (const demandRow of allDemand.data ?? []) {
      if (!demandRow.personId || !personIds.has(demandRow.personId.toLowerCase())) continue;
      const existing = map.get(demandRow.projectId);
      if (existing) {
        addInto(existing.weeks, demandRow.weeks);
        existing.people.add(demandRow.personId.toLowerCase());
      }
      else
        map.set(demandRow.projectId, {
          id: demandRow.projectId,
          label: demandRow.projectName ?? 'Project',
          weeks: addInto(emptyWeeks(), demandRow.weeks),
          people: new Set([demandRow.personId.toLowerCase()]),
        });
    }
    for (const demandRow of nonProjectDemand.data ?? []) {
      if (!personIds.has(demandRow.personId.toLowerCase())) continue;
      const key = `non-project:${demandRow.categoryId}`;
      const existing = map.get(key);
      if (existing) {
        addInto(existing.weeks, demandRow.weeks);
        existing.people.add(demandRow.personId.toLowerCase());
      }
      else
        map.set(key, {
          id: key,
          label: `Non-project: ${demandRow.categoryName ?? categoryNames.get(demandRow.categoryId) ?? 'Other work'}`,
          weeks: addInto(emptyWeeks(), demandRow.weeks),
          people: new Set([demandRow.personId.toLowerCase()]),
        });
    }
    return Array.from(map.values())
      .map(({ people, ...series }) => ({ ...series, peopleCount: people.size }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, allDemand.data, nonProjectDemand.data, nonProjectCategories.data]);

  const analyticsTotalDemand = useMemo(
    () => (teamChartMode === 'person' ? teamSeries : teamSeriesByProject).reduce(
      (total, series) => total + series.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0),
      0,
    ),
    [teamChartMode, teamSeries, teamSeriesByProject, detailWeeks],
  );
  const analyticsTotalCapacity = useMemo(
    () => rows.reduce((total, row) => total + row.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0), 0),
    [rows, detailWeeks],
  );
  const analyticsSeries = teamChartMode === 'person' ? teamSeries : teamSeriesByProject;
  const sortedAnalyticsTableSeries = useMemo(() => [...analyticsSeries].sort((a, b) => {
    const result = analyticsTableSort === 'name'
      ? a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
      : (a.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0) - b.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0));
    return analyticsTableSortDirection === 'asc' ? result : -result;
  }), [analyticsSeries, analyticsTableSort, analyticsTableSortDirection, detailWeeks]);

  function toggleAnalyticsTableSort(key: 'name' | 'total') {
    if (key === analyticsTableSort) setAnalyticsTableSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setAnalyticsTableSort(key);
      setAnalyticsTableSortDirection('asc');
    }
  }
    const analyticsWeeklyDemand = useMemo(() => {
      const total = emptyWeeks();
      for (const row of rows) addInto(total, demandByPerson.get(row.personId?.toLowerCase() ?? ''));
      return total;
    }, [rows, demandByPerson]);
    const peopleAnalytics = useMemo(
      () => rows.map((row) => {
        const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
        const demand = demandWeeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0);
        const capacity = row.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0);
        const overWeeks = demandWeeks.slice(0, detailWeeks).reduce((count, value, week) => count + (value > (row.weeks[week] ?? 0) ? 1 : 0), 0);
        return { id: row.id, label: row.personName ?? 'Unassigned', overAllocated: Math.max(0, demand - capacity), overWeeks, available: Math.max(0, capacity - demand), assignments: assignmentCountByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0 };
      }),
      [rows, demandByPerson, detailWeeks, assignmentCountByPerson],
    );
  const allocationConflicts = useMemo(
    () => buildAllocationConflicts({
      capacity: capacity.data ?? [],
      demand: allDemand.data ?? [],
      nonProjectDemand: nonProjectDemand.data ?? [],
      people: people.data ?? [],
      horizon: detailWeeks,
      personIds: new Set(rows.map((row) => row.personId.toLowerCase())),
    }),
    [capacity.data, allDemand.data, nonProjectDemand.data, people.data, rows, detailWeeks],
  );
  const scenarioCapacity = useMemo(
    () => (capacity.data ?? []).map((row) => {
      const overrides = scenarioOverrides[row.personId.toLowerCase()];
      return overrides ? { ...row, weeks: applyWeekOverrides(row.weeks, overrides, detailWeeks) } : row;
    }),
    [capacity.data, detailWeeks, scenarioOverrides],
  );
  const scenarioConflicts = useMemo(
    () => buildAllocationConflicts({
      capacity: scenarioCapacity,
      demand: allDemand.data ?? [],
      nonProjectDemand: nonProjectDemand.data ?? [],
      people: people.data ?? [],
      horizon: detailWeeks,
      personIds: new Set(rows.map((row) => row.personId.toLowerCase())),
    }),
    [allDemand.data, nonProjectDemand.data, people.data, rows, scenarioCapacity, detailWeeks],
  );
  const analyticsCapacityGap = analyticsTotalCapacity - analyticsTotalDemand;
  const analyticsCapacityGapClass =
    analyticsTotalCapacity > 0 && Math.abs(analyticsCapacityGap) <= analyticsTotalCapacity * 0.05
      ? 'near'
      : analyticsCapacityGap < 0
        ? 'danger'
        : 'positive';
  const peopleAtRisk = allocationConflicts.length;

  if (department.isLoading) return <p className="muted">Loading…</p>;

  const details = department.data;

  function selectWorkspaceTab(tab: DepartmentWorkspaceTab) {
    setActiveTab(tab);
    if (tab === 'availability') setDepartmentView('heatmap');
    if (tab === 'assignments') setDepartmentView('details');
  }

  return (
    <section className={`accent-section accent-departments department-layout department-view-${departmentView}`}>
      <div className="accent-section-header">
        <div className="department-title-row">
          <button type="button" className="back-button department-inline-back" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            ←
          </button>
          <div>
            <h1 className="page-title">
              {details?.name ?? 'Department'}
              {canEditDepartment(user, details) && (
                <Link to={`/departments/${id}/edit`} className="icon-button title-icon-button" title="Edit department details" aria-label="Edit department details">
                  ✎
                </Link>
              )}
            </h1>
            <p className="page-subtitle">
              {activeTab === 'overview' && 'Team capacity, current commitments, and issues requiring attention.'}
              {activeTab === 'team' && 'Department roster and team responsibilities.'}
              {activeTab === 'availability' && `Weekly availability and utilization across ${detailWeeks} weeks.`}
              {activeTab === 'assignments' && `Project and run-the-business assignments across ${detailWeeks} weeks.`}
              {activeTab === 'kpis' && `Performance indicators across ${detailWeeks} weeks.`}
              {activeTab === 'risk' && `Allocation risk and what-if scenario planning across ${detailWeeks} weeks.`}
            </p>
          </div>
        </div>
        <div className="department-header-actions">
          <button
            type="button"
            className={['icon-button', 'icon-button-add', 'icon-button-add-labeled', checkInClass].filter(Boolean).join(' ')}
            onClick={() => checkIn.mutate()}
            disabled={!canEditDepartment(user, details) || checkIn.isPending}
            title={
              Number.isFinite(daysSinceCheckIn)
                ? `Department data was last reviewed ${daysSinceCheckIn} days ago`
                : 'Department data has not yet been reviewed'
            }
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
              <rect x="5" y="6" width="14" height="15" rx="2" />
              <polyline points="9 14 11 16 15 12" />
            </svg>
            <span>{checkIn.isPending ? 'Saving review…' : 'Mark data reviewed'}</span>
          </button>
        </div>
      </div>

      <nav className="workspace-tabs" aria-label="Department workspace">
        {([
          ['overview', 'Overview'],
          ['team', 'Team'],
          ['availability', 'Heat Map'],
          ['assignments', 'Assignments'],
          ['kpis', 'KPIs'],
          ['risk', 'Risk'],
        ] as Array<[DepartmentWorkspaceTab, string]>).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => selectWorkspaceTab(tab)}
          >
            {label}
            {tab === 'risk' && peopleAtRisk > 0 && (
              <span className="tab-badge" aria-label={`${peopleAtRisk} people at risk`}>{peopleAtRisk}</span>
            )}
          </button>
        ))}
      </nav>

      {error && <div className="alert error">{error}</div>}

      <div className="workspace-horizon-bar">
        <span>Planning horizon</span>
        <div className="pill-toggle" role="group" aria-label="Planning horizon">
          {PLANNING_HORIZONS.map((weeks) => (
            <button key={weeks} type="button" className={detailWeeks === weeks ? 'active' : ''} onClick={() => setDetailWeeks(weeks)}>{weeks} weeks</button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="department-overview-layout">
          <section className="card department-overview-health">
            <div className="project-overview-heading">
              <div>
                <h2>Department health</h2>
                <p className="muted">Current staffing position across the next {detailWeeks} weeks.</p>
              </div>
              <span className={peopleAtRisk > 0 ? 'risk-status risk-status-danger' : 'risk-status risk-status-clear'}>
                {peopleAtRisk > 0 ? 'Attention needed' : 'Capacity within plan'}
              </span>
            </div>
            <KpiRow
              ariaLabel="Department health indicators"
              variant="inline"
              items={[
                { key: 'active', value: rows.length, label: 'Active people' },
                { key: 'available', value: formatWholeNumber(analyticsTotalCapacity), label: 'Available hours' },
                { key: 'at-risk', value: peopleAtRisk, label: 'People at risk', risk: peopleAtRisk > 0 },
                { key: 'gap', value: formatWholeNumber(analyticsCapacityGap), label: 'Capacity gap', risk: analyticsCapacityGap < 0 },
              ]}
            />
          </section>

          <section className="card department-attention-panel">
            <div className="project-overview-heading">
              <div>
                <h2>Needs attention</h2>
                <p className="muted">Items most likely to affect delivery or team sustainability.</p>
              </div>
            </div>
            <div className="attention-list">
              <button type="button" onClick={() => selectWorkspaceTab('risk')}>
                <span className={peopleAtRisk > 0 ? 'attention-indicator danger' : 'attention-indicator clear'} />
                <span>
                  <strong>{peopleAtRisk > 0 ? `${peopleAtRisk} team member${peopleAtRisk === 1 ? '' : 's'} overallocated` : 'No team members are overallocated'}</strong>
                  <small>{peopleAtRisk > 0 ? `${kpis.weeksOverAllocated} weeks and ${formatWholeNumber(kpis.hoursOverAllocated)} hours require resolution.` : 'Demand remains within recorded availability.'}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" onClick={() => selectWorkspaceTab('availability')}>
                <span className={analyticsCapacityGap < 0 ? 'attention-indicator danger' : 'attention-indicator clear'} />
                <span>
                  <strong>{analyticsCapacityGap < 0 ? `${formatWholeNumber(Math.abs(analyticsCapacityGap))} hour capacity deficit` : `${formatWholeNumber(analyticsCapacityGap)} hours available`}</strong>
                  <small>Compare weekly supply with project and run-the-business demand.</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" onClick={() => selectWorkspaceTab('team')}>
                <span className={checkInClass ? 'attention-indicator warning' : 'attention-indicator clear'} />
                <span>
                  <strong>{Number.isFinite(daysSinceCheckIn) ? `Team plan reviewed ${daysSinceCheckIn} days ago` : 'Team plan has not been reviewed'}</strong>
                  <small>{checkInClass ? 'Confirm roster, availability, and assignments are current.' : 'The department plan is within the review cadence.'}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          <section className="card department-next-actions">
            <h2>Plan the department</h2>
            <p className="muted">Update availability or review assignments before capacity issues affect delivery.</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={() => selectWorkspaceTab('availability')}>Plan availability</button>
              <button type="button" onClick={() => selectWorkspaceTab('assignments')}>Review assignments</button>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="card department-roster-card">
          <div className="toolbar department-workspace-section-header">
            <div>
              <h2>Team roster</h2>
              <p className="muted">Manage membership and open a person’s assignments or availability.</p>
            </div>
            <div className="row-actions">
              <label className="switch">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span className="switch-label">Show inactive</span>
              </label>
              {editable && <button type="button" onClick={() => setAdding((value) => !value)}>+ Add person</button>}
            </div>
          </div>
          {adding && (
            <form
              className="toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                const personId = String(new FormData(event.currentTarget).get('personId') || '');
                if (personId) addPerson.mutate({ personId });
              }}
            >
              <div style={{ flex: 2 }}><UserSelect id="teamPersonId" name="personId" label="Person" personValue required /></div>
              <button className="primary" type="submit" disabled={addPerson.isPending}>Add to department</button>
              <button type="button" onClick={() => setAdding(false)}>Cancel</button>
            </form>
          )}
          <div className="department-roster-list">
            {rows.map((row) => {
              const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
              const { weeksOver, hoursOver } = overallocationFor(row, demandWeeks, detailWeeks);
              const assignments = assignmentCountByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0;
              return (
                <div key={row.id} className="department-roster-row">
                  <button
                    type="button"
                    className="department-roster-person"
                    onClick={() => {
                      setSelectedRow(row.id);
                      selectWorkspaceTab('assignments');
                    }}
                  >
                    <span><strong>{row.personName ?? 'Unassigned'}</strong><small>{peopleById.get(row.personId?.toLowerCase() ?? '')?.title || 'Team member'}</small></span>
                    <span><strong>{assignments}</strong><small>Assignments</small></span>
                    <span className={weeksOver > 0 ? 'is-risk' : undefined}><strong>{weeksOver}</strong><small>Weeks over</small></span>
                    <span className={hoursOver > 0 ? 'is-risk' : undefined}><strong>{formatWholeNumber(hoursOver)}</strong><small>Hours over</small></span>
                  </button>
                  <div className="row-actions">
                    <button type="button" onClick={() => { setSelectedRow(row.id); selectWorkspaceTab('availability'); }}>Availability</button>
                    {canManageRoster && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRow(row.id);
                            setTransferDepartmentId('');
                            setTransferring(true);
                            selectWorkspaceTab('availability');
                          }}
                        >Transfer</button>
                        <button
                          type="button"
                          className={row.isActive === false ? 'success' : 'danger'}
                          onClick={() => setRowActive.mutate({ capacityId: row.id, isActive: row.isActive === false })}
                        >{row.isActive === false ? 'Reactivate' : 'Inactivate'}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'availability' && (
        <div className="card department-team-overview">
        <div className="toolbar department-team-overview-header">
          <h2 style={{ margin: 0, flex: 1 }}>Availability planner</h2>
          {!teamOverviewCollapsed && editable && (
            <button
              type="button"
              className="icon-button icon-button-add icon-button-add-labeled"
              title="Add new person"
              aria-label="Add new person"
              onClick={() => setAdding((value) => !value)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="3" />
                <path d="M3 20v-1a6 6 0 0 1 6-6h0a6 6 0 0 1 4.2 1.7" />
                <line x1="18" y1="8" x2="21" y2="8" />
                <line x1="19.5" y1="6.5" x2="19.5" y2="9.5" />
              </svg>
              <span>Add person</span>
            </button>
          )}
          {!teamOverviewCollapsed && selected && canManageRoster && (
            <>
              <button
                type="button"
                disabled={selectedEqualizeDisabled}
                title="Set the selected person's availability to match total demand"
                onClick={() => normalizeAvailability(selected)}
              >
                Match availability to demand
              </button>
              <div className="bulk-availability-control">
                <button
                  type="button"
                  className="bulk-availability-submit"
                  aria-label={`Set all visible weeks to ${bulkAvailability} hours for ${selected.personName ?? 'this person'}`}
                  disabled={setAllAvailability.isPending || !/^(?:[0-9]|[1-3][0-9]|40)$/.test(bulkAvailability)}
                  onClick={() => setAllAvailability.mutate({
                    capacityId: selected.id,
                    weeks: selected.weeks.map((value, week) => (week < detailWeeks ? Number(bulkAvailability) : value)),
                  })}
                >Apply</button>
                <span>Set selected to</span>
                <input type="number" min={0} max={40} step={1} value={bulkAvailability} onChange={(event) => setBulkAvailability(event.target.value)} onKeyDown={blockNonIntegerKeys} />
                <span>hours</span>
              </div>
            </>
          )}
          {teamOverviewCollapsed && (
            <KpiRow
              ariaLabel="Team Overview KPIs"
              variant="compact"
              className="team-overview-collapsed-kpis"
              items={[
                { key: 'weeks-over', value: formatWholeNumber(kpis.weeksOverAllocated), label: 'Weeks overallocated', risk: kpis.weeksOverAllocated > 0 },
                { key: 'hours-over', value: formatWholeNumber(kpis.hoursOverAllocated), label: 'Hours overallocated', risk: kpis.hoursOverAllocated > 0 },
                { key: 'activities', value: formatWholeNumber(kpis.activityCount), label: 'Activities supported' },
              ]}
            />
          )}
          <button
            type="button"
            className="workload-collapse-button department-section-collapse-button"
            aria-label={teamOverviewCollapsed ? 'Expand Team Members' : 'Collapse Team Members'}
            aria-expanded={!teamOverviewCollapsed}
            aria-controls="department-team-overview-content"
            title={teamOverviewCollapsed ? 'Expand Team Members' : 'Collapse Team Members'}
            onClick={() => setTeamOverviewCollapsed((value) => !value)}
          >
            <span className={teamOverviewCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
          </button>
        </div>
        <div id="department-team-overview-content" hidden={teamOverviewCollapsed}>
        <div className="team-overview-card" hidden={departmentView !== 'heatmap'}>
        <section id="department-team-roster-section" className="team-roster-section">
        {transferring && selected && (
          <form
            className="toolbar transfer-person-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!transferDepartmentId || !selected.personId) return;
              const destination = departments.data?.find((entry) => entry.id === transferDepartmentId)?.name ?? 'the selected department';
              const confirmed = window.confirm(
                `Warning: transfer ${selected.personName ?? 'this person'} to ${destination}? Their department assignment will change immediately.`,
              );
              if (confirmed) transferPerson.mutate({ personId: selected.personId, departmentId: transferDepartmentId });
            }}
          >
            <strong>Transfer {selected.personName ?? 'person'}</strong>
            <select value={transferDepartmentId} onChange={(event) => setTransferDepartmentId(event.target.value)} required>
              <option value="">Select destination department…</option>
              {(departments.data ?? [])
                .filter((entry) => entry.id !== id)
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
            </select>
            <button className="primary" type="submit" disabled={transferPerson.isPending || !transferDepartmentId}>
              {transferPerson.isPending ? 'Transferring…' : 'Submit transfer'}
            </button>
            <button type="button" onClick={() => setTransferring(false)}>Cancel</button>
          </form>
        )}

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
              <UserSelect id="personId" name="personId" label="Person" personValue required />
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
          <table className="weekly-matrix demand-grid paired-rows department-roster-matrix" ref={gridRef}>
            <thead>
              <tr>
                <th className="matrix-label">Person</th>
                {columns.map((week) => (
                  <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
                    {weekLabelShort(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const isMe = Boolean(user?.personId && row.personId?.toLowerCase() === user.personId.toLowerCase());
                const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
                const isSelected = selectedRow === row.id;
                const totalDemand = demandWeeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0);
                const totalAvailability = row.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={[
                        'matrix-availability-row',
                        isSelected ? 'row-selected' : '',
                        row.isActive === false ? 'row-inactive' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedRow(row.id)}
                    >
                      <th rowSpan={2} scope="rowgroup" className="matrix-label department-heatmap-person-cell">
                        <span className="person-row">
                          <span className="person-identity">
                            <span className="person-name-row">
                              <span className="person-name-group">
                                <span className={isMe ? 'person-name person-me' : 'person-name'}>
                                  {row.personName ?? 'Unassigned'}
                                </span>
                                {row.isActive === false && <span className="badge danger">Inactive</span>}
                              </span>
                              <span className="department-detail-roster-pills">
                                <span className={totalDemand > totalAvailability ? 'department-detail-roster-pill demand-alert' : 'department-detail-roster-pill'} title="Total demand">
                                  {formatWholeNumber(totalDemand)}
                                </span>
                                <span className={totalAvailability > alertThreshold * detailWeeks ? 'department-detail-roster-pill availability-alert' : 'department-detail-roster-pill'} title="Total availability">
                                  {formatWholeNumber(totalAvailability)}
                                </span>
                              </span>
                            </span>
                            {departmentView === 'details' && canManageRoster && (
                              <span className="department-detail-roster-actions">
                                <button
                                  type="button"
                                  className={['icon-button', 'icon-button-plain', row.isActive === false ? 'success' : 'danger'].join(' ')}
                                  aria-label={row.isActive === false ? `Reactivate ${row.personName ?? 'this person'}'s availability` : `Inactivate ${row.personName ?? 'this person'}'s availability`}
                                  title={row.isActive === false ? `Reactivate ${row.personName ?? 'this person'}'s availability` : `Inactivate ${row.personName ?? 'this person'}'s availability`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRowActive.mutate({ capacityId: row.id, isActive: row.isActive === false });
                                  }}
                                >
                                  {row.isActive === false ? '↻' : '⊘'}
                                </button>
                                <button
                                  type="button"
                                  className="icon-button icon-button-plain transfer-person-inline-action"
                                  aria-label={`Transfer ${row.personName ?? 'this person'}`}
                                  title={`Transfer ${row.personName ?? 'this person'}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedRow(row.id);
                                    setTransferDepartmentId('');
                                    setTransferring(true);
                                  }}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M4 7h13l-3-3" />
                                    <path d="m17 7-3 3" />
                                    <path d="M20 17H7l3 3" />
                                    <path d="m7 17 3-3" />
                                  </svg>
                                </button>
                              </span>
                            )}
                          </span>
                        </span>
                      </th>
                      {columns.map((week) => {
                        const key = `${row.id}:${week}`;
                        const value = draft[key] ?? String(row.weeks[week] ?? 0);
                        const availability = Number(value);
                        const demand = demandWeeks[week] ?? 0;
                        const utilization = availability > 0 ? demand / availability : demand > 0 ? Infinity : 0;
                        return (
                          <td
                            key={week}
                            className={`heatmap-availability-cell${availability > 40 && availability <= 50 ? ' availability-high' : availability > 50 ? ' availability-over' : ''}`}
                            style={
                              availability > 40 && availability <= 50
                                ? { backgroundColor: 'var(--yamabuki-yellow)', color: 'var(--dark-grey)' }
                                : availability > 50
                                  ? { backgroundColor: 'var(--takeda-red)', color: 'var(--white)' }
                                  : heatmapColors(utilization)
                            }
                            title={`Availability ${availability} hours, utilization ${Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : 'over 210%'} in week of ${weekLabel(week)}`}
                          >
                            <input
                              type="number"
                              min={0}
                              max={MAX_HOURS}
                              step={1}
                              data-row={rowIndex}
                              data-week={week}
                              value={value}
                              style={{ fontWeight: Math.round(400 + Math.min(40, Math.max(0, availability)) / 40 * 400) }}
                              readOnly={!canManageRoster}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                              onFocus={(event) => event.target.select()}
                              onBlur={(event) => commit(row, week, event.target.value)}
                              onKeyDown={(event) => {
                                blockNonIntegerKeys(event);
                                handleKey(event, rowIndex, week);
                              }}
                              aria-label={`${row.personName ?? 'Person'} availability week of ${weekLabel(week)}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                    <tr
                      className={[isSelected ? 'row-selected' : '', row.isActive === false ? 'row-inactive' : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedRow(row.id)}
                    >
                      {columns.map((week) => {
                        const availability = row.weeks[week] ?? 0;
                        const demand = demandWeeks[week] ?? 0;
                        const utilization = availability > 0 ? demand / availability : demand > 0 ? Infinity : 0;
                        return (
                          <td
                            key={week}
                            className="heatmap-utilization-cell"
                            style={heatmapColors(utilization)}
                            title={`Utilization ${Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : 'over 210%'} in week of ${weekLabel(week)}`}
                          >
                            {Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '>210%'}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="muted">
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
        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
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
        <p className="muted table-count">
          {rows.length} {rows.length === 1 ? 'person' : 'people'} · hours per week, maximum {MAX_HOURS} · top row is
          editable availability, bottom row is utilization · color shows utilization and font weight emphasizes availability
        </p>
        </section>
        </div>
        </div>
      </div>
      )}

      {activeTab === 'assignments' && selected && (
        <div className="card department-individual-details-card" hidden={teamOverviewCollapsed || departmentView !== 'details'}>
        <section id="department-individual-detail-section" className="department-person-detail individual-detail-section">
          <div className="toolbar department-person-detail-header">
            <h2 style={{ margin: 0, flex: 1 }}>
              {selected.personName ?? 'Person'}
            </h2>
          </div>
          <div id="department-person-detail-content" className="department-person-detail-content">
          <aside className="department-detail-roster-picker" aria-label="Department roster" hidden={departmentView === 'heatmap'}>
            <h3>
              Roster <span className="department-detail-roster-count">({rows.length})</span>
            </h3>
            <div className="department-detail-roster-list">
              {rows.map((row) => {
                const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
                const { weeksOver, hoursOver } = overallocationFor(row, demandWeeks, detailWeeks);
                const assignments = assignmentCountByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0;
                const totalDemand = demandWeeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0);
                const totalAvailability = row.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0);
                return (
                  <div key={row.id} className={selectedRow === row.id ? 'department-detail-roster-item active' : 'department-detail-roster-item'}>
                    <button type="button" className="department-detail-roster-select" onClick={() => setSelectedRow(row.id)}>
                      <span className="department-detail-roster-name-line">
                        <strong>{row.personName ?? 'Unassigned'}</strong>
                        <span className="department-detail-roster-pills">
                          <span
                            className={totalDemand > totalAvailability ? 'department-detail-roster-pill demand-alert' : 'department-detail-roster-pill'}
                            title="Total demand"
                          >
                            {formatWholeNumber(totalDemand)}
                          </span>
                          <span
                            className={totalAvailability > alertThreshold * detailWeeks ? 'department-detail-roster-pill availability-alert' : 'department-detail-roster-pill'}
                            title={`Total availability; cumulative alert level ${alertThreshold * detailWeeks} hours`}
                          >
                            {formatWholeNumber(totalAvailability)}
                          </span>
                        </span>
                      </span>
                      <span className="department-detail-roster-metrics">
                        <span className={weeksOver > 0 ? 'metric-warn' : undefined}>Weeks Over: {weeksOver}</span>
                        {' · '}
                        <span className={hoursOver > 0 ? 'metric-warn' : undefined}>Hours Over: {hoursOver}</span>
                        {' · '}
                        Assignments: {assignments}
                      </span>
                    </button>
                    {canManageRoster && (
                      <div className="department-detail-roster-actions">
                        <button
                          type="button"
                          className={['icon-button', 'icon-button-plain', row.isActive === false ? 'success' : 'danger'].join(' ')}
                          aria-label={row.isActive === false ? `Reactivate ${row.personName ?? 'this person'}'s availability` : `Inactivate ${row.personName ?? 'this person'}'s availability`}
                          title={row.isActive === false ? `Reactivate ${row.personName ?? 'this person'}'s availability` : `Inactivate ${row.personName ?? 'this person'}'s availability`}
                          onClick={() => setRowActive.mutate({ capacityId: row.id, isActive: row.isActive === false })}
                        >
                          {row.isActive === false ? '↻' : '⊘'}
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-plain transfer-person-inline-action"
                          aria-label={`Transfer ${row.personName ?? 'this person'}`}
                          title={`Transfer ${row.personName ?? 'this person'}`}
                          onClick={() => {
                            setSelectedRow(row.id);
                            setTransferDepartmentId('');
                            setTransferring(true);
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M4 7h13l-3-3" />
                            <path d="m17 7-3 3" />
                            <path d="M20 17H7l3 3" />
                            <path d="m7 17 3-3" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
          <div className="department-detail-view-panel" hidden={departmentView !== 'details'}>
          {(nonProjectDemand.isError || nonProjectCategories.isError || nonProjectSubcategories.isError) && (
            <div className="alert error">
              Other demand is unavailable:{' '}
              {errorMessage(nonProjectDemand.error ?? nonProjectCategories.error ?? nonProjectSubcategories.error)}
            </div>
          )}
          <PersonDemandChart
            weeks={detailWeeks}
            thisProject={selectedNonProjectTotal}
            otherProjects={selectedProjectTotal}
            availability={selected.weeks}
            showThis={selectedNonProjectDemand.length > 0}
            thisLabel="Other demand"
            otherLabel="Project demand"
            thisColor="var(--asagi-blue)"
            otherColor="var(--sorairo-blue)"
            maxY={MAX_HOURS}
            alertThreshold={teamChartMode === 'person' ? alertThreshold : undefined}
          />

          <div className="demand-section-toolbar">
            <div className="demand-tabs" role="tablist" aria-label="Department demand type">
              <button
                type="button"
                role="tab"
                className={activeDetailDemandTab === 'project' ? 'demand-tab active' : 'demand-tab'}
                aria-selected={activeDetailDemandTab === 'project'}
                onClick={() => setActiveDetailDemandTab('project')}
              >
                Project demand
              </button>
              <button
                type="button"
                role="tab"
                className={activeDetailDemandTab === 'other' ? 'demand-tab active' : 'demand-tab'}
                aria-selected={activeDetailDemandTab === 'other'}
                onClick={() => setActiveDetailDemandTab('other')}
              >
                Other demand
              </button>
            </div>
            <div className="demand-section-actions">
              {canManageRoster && (
                <button
                  type="button"
                  className="icon-button icon-button-add icon-button-add-labeled person-detail-action"
                  title={`Add assignment for ${selected.personName ?? 'this person'}`}
                  aria-label={`Add assignment for ${selected.personName ?? 'this person'}`}
                  onClick={() => {
                    if (activeDetailDemandTab === 'project') {
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
              )}
              <label className="switch demand-zero-toggle" title="Hide rows with zero demand">
                <input
                  type="checkbox"
                  checked={activeDetailDemandTab === 'project' ? hideZeroProjectRows : hideZeroOtherRows}
                  onChange={(event) => {
                    if (activeDetailDemandTab === 'project') setHideZeroProjectRows(event.target.checked);
                    else setHideZeroOtherRows(event.target.checked);
                  }}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="switch-label">Hide zero rows</span>
              </label>
            </div>
          </div>

          <div id="department-project-demand-content" hidden={activeDetailDemandTab !== 'project'}>
          {addingAssignment && (
            <form
              className="toolbar assignment-picker"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const projectId = String(form.get('projectId') || '');
                if (!projectId || !selected.personId) return;
                addAssignment.mutate({ projectId, personId: selected.personId });
              }}
            >
              <div>
                <label htmlFor="assignmentProjectId">Project</label>
                <select id="assignmentProjectId" name="projectId" required defaultValue="">
                  <option value="" disabled>
                    {projects.isLoading ? 'Loading projects…' : 'Select…'}
                  </option>
                  {availableProjectsForAssignment.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="primary" type="submit" disabled={addAssignment.isPending}>
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
                      There are no assignments with demand for this person over the selected period.
                    </td>
                  </tr>
                )}
                {visibleProjectDemand.map((project, rowIndex) => (
                  <tr key={project.projectId} className={`assignment-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}`}>
                    <th scope="row" className="matrix-label">
                      {project.projectName ?? 'Project'}
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
                            readOnly={!canManageRoster}
                            onChange={(event) => setDraftDemand((prev) => ({ ...prev, [key]: event.target.value }))}
                            onFocus={(event) => event.target.select()}
                            onBlur={(event) => commitDemand(project.demandId, currentHours, week, event.target.value)}
                            onKeyDown={blockNonIntegerKeys}
                            aria-label={`${project.projectName ?? 'Project'} demand week of ${weekLabel(week)}`}
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
                <tr className="matrix-total row-total-demand">
                  <th scope="row" className="matrix-label">Total demand</th>
                  {chartColumns.map((week) => <td key={week}>{selectedDemand[week] || ''}</td>)}
                </tr>
                <tr className="row-availability">
                  <th scope="row" className="matrix-label">Availability</th>
                  {chartColumns.map((week) => {
                    const key = `${selected.id}:project-summary:${week}`;
                    const value = draft[key] ?? String(selected.weeks[week] ?? 0);
                    return (
                      <td key={week} className={[Number(value) > 0 ? 'has-availability' : '', Number(value) > alertThreshold ? 'threshold-alert' : ''].filter(Boolean).join(' ')}>
                        <input
                          type="number"
                          min={0}
                          max={MAX_HOURS}
                          step={1}
                          value={value}
                          readOnly={!canManageRoster}
                          onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                          onFocus={(event) => event.target.select()}
                          onBlur={(event) => commit(selected, week, event.target.value)}
                          onKeyDown={blockNonIntegerKeys}
                          aria-label={`${selected.personName ?? 'Person'} availability week of ${weekLabel(week)}`}
                        />
                      </td>
                    );
                  })}
                </tr>
                <tr className="row-utilization">
                  <th scope="row" className="matrix-label">Utilization</th>
                  {chartColumns.map((week) => {
                    const availability = selected.weeks[week] ?? 0;
                    const demandHours = selectedDemand[week] ?? 0;
                    const utilization = availability > 0 ? demandHours / availability : demandHours > 0 ? Infinity : null;
                    const utilClass = utilization === null ? undefined : utilization > 1.25 ? 'utilization-danger' : utilization > 1 ? 'utilization-warn' : undefined;
                    return <td key={week} className={utilClass}>{utilization === null ? '—' : Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '∞'}</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          </div>

          <div id="department-other-demand-content" hidden={activeDetailDemandTab !== 'other'}>
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
                if (!subcategoryId || !selected.personId) {
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
                  personId: selected.personId,
                  departmentId: id,
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
                  placeholder="e.g. Chrome skid failure"
                />
              </div>
              <button className="primary person-detail-action non-project-demand-action" type="submit" disabled={addNonProjectDemand.isPending}>
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
                {visibleNonProjectRows.length === 0 && (
                  <tr className="no-demand-notice-row">
                    <td colSpan={chartColumns.length + 1}>
                      There is no other demand assigned for this person over the selected period.
                    </td>
                  </tr>
                )}
                {visibleNonProjectRows.map((subcategory, rowIndex) => (
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
                            readOnly={!canManageRoster || !demandRow}
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
                    Subtotal
                  </th>
                  {chartColumns.map((week) => <td key={week}>{selectedNonProjectTotal[week] || ''}</td>)}
                </tr>
                <tr className="matrix-total row-total-demand">
                  <th scope="row" className="matrix-label">Total demand</th>
                  {chartColumns.map((week) => <td key={week}>{selectedDemand[week] || ''}</td>)}
                </tr>
                <tr className="row-availability">
                  <th scope="row" className="matrix-label">Availability</th>
                  {chartColumns.map((week) => {
                    const key = `${selected.id}:other-summary:${week}`;
                    const value = draft[key] ?? String(selected.weeks[week] ?? 0);
                    return (
                      <td key={week} className={[Number(value) > 0 ? 'has-availability' : '', Number(value) > alertThreshold ? 'threshold-alert' : ''].filter(Boolean).join(' ')}>
                        <input type="number" min={0} max={MAX_HOURS} step={1} value={value} readOnly={!canManageRoster} onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))} onFocus={(event) => event.target.select()} onBlur={(event) => commit(selected, week, event.target.value)} onKeyDown={blockNonIntegerKeys} aria-label={`${selected.personName ?? 'Person'} availability week of ${weekLabel(week)}`} />
                      </td>
                    );
                  })}
                </tr>
                <tr className="row-utilization">
                  <th scope="row" className="matrix-label">Utilization</th>
                  {chartColumns.map((week) => {
                    const availability = selected.weeks[week] ?? 0;
                    const demandHours = selectedDemand[week] ?? 0;
                    const utilization = availability > 0 ? demandHours / availability : demandHours > 0 ? Infinity : null;
                    const utilClass = utilization === null ? undefined : utilization > 1.25 ? 'utilization-danger' : utilization > 1 ? 'utilization-warn' : undefined;
                    return <td key={week} className={utilClass}>{utilization === null ? '—' : Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '∞'}</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          </div>

          </div>
          </div>
        </section>
        </div>
      )}

      {activeTab === 'risk' && editable && (
        <PlanningScenarioPanel
          active={scenarioActive}
          title="Department capacity scenario"
          description={`Test weekly availability changes across the next ${detailWeeks} weeks without changing the live plan.`}
          valueLabel="Availability"
          horizon={detailWeeks}
          rows={rows.map((row) => ({
            id: row.personId.toLowerCase(),
            label: row.personName ?? 'Unassigned',
            subtitle: peopleById.get(row.personId.toLowerCase())?.title || 'Team member',
            weeks: row.weeks,
          }))}
          overrides={scenarioOverrides}
          baselineConflicts={allocationConflicts}
          scenarioConflicts={scenarioConflicts}
          isApplying={applyScenario.isPending}
          onStart={() => setScenarioActive(true)}
          onWeekValue={(personId, week, value) => setScenarioOverrides((current) => {
            const baseline = rows.find((row) => row.personId.toLowerCase() === personId)?.weeks[week] ?? 0;
            const personOverrides = { ...(current[personId] ?? {}) };
            if (value === baseline) delete personOverrides[week];
            else personOverrides[week] = value;
            const next = { ...current };
            if (Object.keys(personOverrides).length) next[personId] = personOverrides;
            else delete next[personId];
            return next;
          })}
          onDiscard={() => { setScenarioActive(false); setScenarioOverrides({}); }}
          onApply={() => {
            const updates = rows.flatMap((row) => {
              const overrides = scenarioOverrides[row.personId.toLowerCase()];
              return overrides && Object.keys(overrides).length ? [{ id: row.id, weeks: applyWeekOverrides(row.weeks, overrides, detailWeeks) }] : [];
            });
            applyScenario.mutate(updates);
          }}
        />
      )}

      <SlideOverPanel open={Boolean(resolvingConflict)} onClose={() => setResolvingConflict(null)} hideHeader>
        {resolvingConflict && (
          <ConflictResolutionPanel
            conflict={resolvingConflict}
            context="department"
            onClose={() => setResolvingConflict(null)}
            onStartWhatIf={() => {
              setResolvingConflict(null);
              setActiveTab('risk');
              setScenarioActive(true);
            }}
            onOpenTeam={() => {
              const row = rows.find((candidate) => candidate.personId.toLowerCase() === resolvingConflict.personId);
              if (row) setSelectedRow(row.id);
              setResolvingConflict(null);
              selectWorkspaceTab('assignments');
            }}
          />
        )}
      </SlideOverPanel>

      {activeTab === 'kpis' && selected && (
        <div className="card department-analytics-card">
          <div className="toolbar department-analytics-header">
            <h2 style={{ margin: 0, flex: 1 }}>Team Overview</h2>
            <KpiRow
              ariaLabel="Analytics summary"
              variant="compact"
              className="analytics-kpis"
              items={[
                { key: 'total-demand', value: formatWholeNumber(analyticsTotalDemand), label: 'Total demand' },
                { key: 'total-capacity', value: formatWholeNumber(analyticsTotalCapacity), label: 'Total capacity' },
                { key: 'capacity-gap', value: formatWholeNumber(analyticsCapacityGap), label: 'Capacity gap', className: `analytics-gap-${analyticsCapacityGapClass}` },
              ]}
            />
            <button
              type="button"
              className="workload-collapse-button department-section-collapse-button"
              aria-label={analyticsCollapsed ? 'Expand Analytics' : 'Collapse Analytics'}
              aria-expanded={!analyticsCollapsed}
              aria-controls="department-analytics-content"
              title={analyticsCollapsed ? 'Expand Analytics' : 'Collapse Analytics'}
              onClick={() => setAnalyticsCollapsed((value) => !value)}
            >
              <span className={analyticsCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
            </button>
          </div>
          <div id="department-analytics-content" hidden={analyticsCollapsed}>
          <div className="toolbar analytics-subheader" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, flex: 1 }}>
              Team demand vs. availability <span className="muted">· next {detailWeeks} weeks</span>
            </h2>
            <div className="pill-toggle" role="group" aria-label="Slice team demand by">
              <button
                type="button"
                className={teamChartMode === 'person' ? 'active' : ''}
                onClick={() => setTeamChartMode('person')}
              >
                Per person
              </button>
              <button
                type="button"
                className={teamChartMode === 'project' ? 'active' : ''}
                onClick={() => setTeamChartMode('project')}
              >
                Per project
              </button>
            </div>
          </div>
          <TeamDemandChart
            weeks={detailWeeks}
            series={analyticsSeries}
            availability={totals.slice(0, detailWeeks)}
            alertThreshold={alertThreshold}
            selectedId={teamChartMode === 'person' ? (showAllPersonSeries ? null : selected.id) : selectedAnalyticsSeriesId}
            onSelect={(seriesId) => {
              if (teamChartMode === 'person') {
                if (seriesId === selected.id) setShowAllPersonSeries((current) => !current);
                else {
                  setShowAllPersonSeries(false);
                  setSelectedRow(seriesId);
                }
              }
              else setSelectedAnalyticsSeriesId((current) => (current === seriesId ? null : seriesId));
            }}
            palette={[
              'var(--sorairo-blue)',
              'var(--matsuba-green)',
              'var(--yamabuki-yellow)',
              'var(--asagi-blue)',
              'var(--sakura-pink)',
              'var(--akane-red)',
              'var(--takeda-red)',
            ]}
          />
          <div className="analytics-table-section">
            <h3>Demand by week</h3>
            <div className="matrix-scroll">
              <table className="weekly-matrix analytics-demand-table">
                <thead>
                  <tr>
                    <th className="matrix-label">
                      <button type="button" className="analytics-sort-header" onClick={() => toggleAnalyticsTableSort('name')}>
                        {teamChartMode === 'person' ? 'Person' : 'Project'}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="analytics-sort-header" onClick={() => toggleAnalyticsTableSort('total')}>Total</button>
                    </th>
                    {chartColumns.map((week) => (
                      <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
                        {weekLabelShort(week)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAnalyticsTableSeries.map((series, index) => (
                    <tr key={series.id} className={index % 2 === 1 ? 'analytics-row-shade' : undefined}>
                      <th scope="row" className="matrix-label">{series.label}</th>
                      <td className="analytics-total-cell">{formatWholeNumber(series.weeks.slice(0, detailWeeks).reduce((sum, value) => sum + value, 0)) || ''}</td>
                      {chartColumns.map((week) => <td key={week}>{series.weeks[week] || ''}</td>)}
                    </tr>
                  ))}
                  {analyticsSeries.length === 0 && (
                    <tr>
                      <td colSpan={chartColumns.length + 2} className="muted">No demand found for the selected roster.</td>
                    </tr>
                  )}
                </tbody>
                {analyticsSeries.length > 0 && (
                  <tfoot>
                    <tr className="analytics-total-row">
                      <th scope="row" className="matrix-label">Total</th>
                      <td className="analytics-total-cell">{formatWholeNumber(analyticsTotalDemand) || ''}</td>
                      {chartColumns.map((week) => (
                        <td key={week}>
                          {Math.round(analyticsSeries.reduce((sum, series) => sum + (series.weeks[week] ?? 0), 0)) || ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {activeTab === 'risk' && selected && (
        <div className="card department-analytics-summary-card">
          <div className="toolbar department-analytics-header">
            <h2 style={{ margin: 0, flex: 1 }}>Analytics</h2>
            <span className="muted">Next {detailWeeks} weeks</span>
            <button
              type="button"
              className="workload-collapse-button department-section-collapse-button"
              aria-label={analyticsSummaryCollapsed ? 'Expand Analytics' : 'Collapse Analytics'}
              aria-expanded={!analyticsSummaryCollapsed}
              aria-controls="department-analytics-summary-content"
              title={analyticsSummaryCollapsed ? 'Expand Analytics' : 'Collapse Analytics'}
              onClick={() => setAnalyticsSummaryCollapsed((value) => !value)}
            >
              <span className={analyticsSummaryCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
            </button>
          </div>
          <div id="department-analytics-summary-content" hidden={analyticsSummaryCollapsed} aria-label="Analytics summary">
            <DepartmentAnalyticsInsights
              weeks={detailWeeks}
              totalDemand={analyticsWeeklyDemand}
              availability={totals.slice(0, detailWeeks)}
              workstreams={teamSeriesByProject}
              people={peopleAnalytics}
              conflicts={allocationConflicts}
              onResolveConflict={(conflict) => setResolvingConflict(conflict)}
            />
          </div>
        </div>
      )}

      {activeTab === 'overview' && <div className="card project-header">
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
            <span className="detail-label">Department delegate</span>
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
            <span className="detail-label">Last data review</span>
            <span className={checkInClass ? `check-in-${checkInClass}` : undefined}>
              {formatDate(details?.lastCheckIn)}
            </span>
          </div>
        </div>
      </div>}
    </section>
  );
}
