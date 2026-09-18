import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capacityApi, demandApi, departmentsApi, errorMessage, nonProjectDemandApi, peopleApi, projectsApi } from '../api/client';
import PersonDemandChart from '../components/PersonDemandChart';
import TeamDemandChart from '../components/TeamDemandChart';
import UserSelect from '../components/admin/UserSelect';
import { useAuthStore } from '../store/authStore';
import { weekLabel, weekLabelShort, weekYear } from '../utils/arrayParser';
import { formatDate } from '../utils/dates';
import { canEditAvailability, canEditDepartment } from '../utils/permissions';
import type { CapacityRow, DemandRow, NonProjectDemandRow, Person } from '../types';

const WEEKS = 104;
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
  const [teamChartMode, setTeamChartMode] = useState<'person' | 'project'>('person');
  const [activeDetailDemandTab, setActiveDetailDemandTab] = useState<'project' | 'other'>('project');
  const [detailWeeks, setDetailWeeks] = useState(52);
  const [alertThreshold, setAlertThreshold] = useState(40);
  const [bulkAvailability, setBulkAvailability] = useState('40');
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [addingNonProjectDemand, setAddingNonProjectDemand] = useState(false);
  const [addingNewActivity, setAddingNewActivity] = useState(false);
  const [hideZeroProjectRows, setHideZeroProjectRows] = useState(false);
  const [hideZeroOtherRows, setHideZeroOtherRows] = useState(false);
  const [individualDetailCollapsed, setIndividualDetailCollapsed] = useState(false);
  const [heatMapCollapsed, setHeatMapCollapsed] = useState(false);
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState(false);
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
  const canManageRoster = canEditDepartment(user, department.data) || Boolean(user?.roles.includes('availability_moderator'));
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

  /** Overallocation and activity-count KPIs for the visible (filtered) roster, across the weeks shown in the table. */
  const kpis = useMemo(() => {
    const overAllocatedWeeks = new Set<number>();
    let hoursOverAllocated = 0;
    for (const row of rows) {
      const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
      for (let week = 0; week < WEEKS; week += 1) {
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
      if (demandRow.weeks.slice(0, WEEKS).some((value) => value > 0)) projectIds.add(demandRow.projectId);
    }

    for (const demandRow of nonProjectDemand.data ?? []) {
      if (!personIds.has(demandRow.personId.toLowerCase())) continue;
      if (demandRow.weeks.slice(0, WEEKS).some((value) => value > 0)) projectIds.add(`non-project:${demandRow.categoryId}`);
    }

    return { weeksOverAllocated: overAllocatedWeeks.size, hoursOverAllocated, activityCount: projectIds.size };
  }, [rows, demandByPerson, allDemand.data, nonProjectDemand.data]);

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

  function heatmapLevel(demand: number, availability: number) {
    if (demand <= 0 && availability <= 0) return 'heatmap-empty';
    if (demand > availability) return 'heatmap-danger';
    if (availability > 0 && demand / availability >= 0.8) return 'heatmap-warn';
    if (demand > 0) return 'heatmap-active';
    return 'heatmap-available';
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
    mutationFn: ({ capacityId, hours }: { capacityId: string; hours: number }) =>
      capacityApi.update(capacityId, { weeks: new Array(WEEKS).fill(hours) }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<CapacityRow[]>(capacityKey, (current) =>
        current?.map((row) => (row.id === variables.capacityId ? { ...row, weeks: new Array(WEEKS).fill(variables.hours) } : row)),
      );
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  /** Sets this week's availability to match total demand, only across the weeks shown in the table. */
  function normalizeAvailability(row: CapacityRow) {
    const demandWeeks = demandByPerson.get(row.personId?.toLowerCase() ?? '') ?? emptyWeeks();
    const nextWeeks = row.weeks.slice();
    for (let week = 0; week < WEEKS; week += 1) {
      nextWeeks[week] = Math.max(0, Math.min(MAX_HOURS, Math.round(demandWeeks[week] ?? 0)));
    }
    const weeksAbove50 = nextWeeks.slice(0, WEEKS).filter((hours) => hours > 50).length;
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

  /** Over-allocation compares the person's total demand with the availability in this row. */
  function utilizationFor(row: CapacityRow, week: number): number | null {
    const demandHours = demandByPerson.get(row.personId?.toLowerCase() ?? '')?.[week] ?? 0;
    const availability = row.weeks[week] ?? 0;
    if (availability <= 0) return demandHours > 0 ? Infinity : null;
    return demandHours / availability;
  }

  const selected = rows.find((row) => row.id === selectedRow);
  const selectedDemand = selected ? demandByPerson.get(selected.personId?.toLowerCase() ?? '') ?? emptyWeeks() : [];

  /** Equalize is pointless once availability already matches demand every week, even where demand is 0. */
  const selectedEqualizeDisabled = (() => {
    if (!selected) return true;
    let alreadyMatches = true;
    for (let week = 0; week < WEEKS; week += 1) {
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

  const nonProjectDemandGroups = useMemo(() => {
    return availableNonProjectCategories.map((category) => {
      const assignedRows = selectedNonProjectDemand.filter((row) => row.categoryId === category.id);
      const rows = assignedRows
        .map((row) => ({ id: row.id, name: row.subcategoryName ?? 'General', description: row.description ?? '', demand: row }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
      const total = emptyWeeks();
      for (const row of assignedRows) addInto(total, row.weeks);
      return { ...category, rows, total };
    }).filter((category) => category.rows.length > 0);
  }, [availableNonProjectCategories, selectedNonProjectDemand]);

  /** Assignment rows to render, honoring the "hide zero rows" toggle. */
  const visibleProjectDemand = useMemo(() => {
    if (!hideZeroProjectRows) return selectedProjectDemand;
    return selectedProjectDemand.filter((project) => project.weeks.slice(0, detailWeeks).some((hours) => hours > 0));
  }, [selectedProjectDemand, hideZeroProjectRows, detailWeeks]);

  /** Other-demand categories/rows to render, honoring the "hide zero rows" toggle. */
  const visibleNonProjectGroups = useMemo(() => {
    if (!hideZeroOtherRows) return nonProjectDemandGroups;
    return nonProjectDemandGroups
      .map((category) => ({
        ...category,
        rows: category.rows.filter((row) => row.demand.weeks.slice(0, detailWeeks).some((hours) => hours > 0)),
      }))
      .filter((category) => category.rows.length > 0);
  }, [nonProjectDemandGroups, hideZeroOtherRows, detailWeeks]);

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
    const map = new Map<string, { id: string; label: string; weeks: number[] }>();
    for (const demandRow of allDemand.data ?? []) {
      if (!demandRow.personId || !personIds.has(demandRow.personId.toLowerCase())) continue;
      const existing = map.get(demandRow.projectId);
      if (existing) addInto(existing.weeks, demandRow.weeks);
      else
        map.set(demandRow.projectId, {
          id: demandRow.projectId,
          label: demandRow.projectName ?? 'Project',
          weeks: addInto(emptyWeeks(), demandRow.weeks),
        });
    }
    for (const demandRow of nonProjectDemand.data ?? []) {
      if (!personIds.has(demandRow.personId.toLowerCase())) continue;
      const key = `non-project:${demandRow.categoryId}`;
      const existing = map.get(key);
      if (existing) addInto(existing.weeks, demandRow.weeks);
      else
        map.set(key, {
          id: key,
          label: `Non-project: ${demandRow.categoryName}`,
          weeks: addInto(emptyWeeks(), demandRow.weeks),
        });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, allDemand.data, nonProjectDemand.data]);

  if (department.isLoading) return <p className="muted">Loading…</p>;

  const details = department.data;

  return (
    <section className="accent-section accent-departments">
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
            <p className="page-subtitle">Team availability, {WEEKS} weeks from this Monday.</p>
          </div>
        </div>
        <div className="department-header-actions">
          <label className="weeks-lookahead-control" htmlFor="department-detail-weeks">
            Weeks to show
            <input
              id="department-detail-weeks"
              type="number"
              min={1}
              max={WEEKS}
              value={detailWeeks}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setDetailWeeks(Math.min(WEEKS, Math.max(1, Math.round(next))));
              }}
            />
          </label>
          <div className="department-header-kpis" aria-label="Department KPIs">
            <div className="department-header-kpi">
              <span className="value" style={{ color: kpis.weeksOverAllocated > 0 ? 'var(--danger)' : undefined }}>
                {kpis.weeksOverAllocated}
              </span>
              <span className="label">Weeks overallocated</span>
            </div>
            <div className="department-header-kpi">
              <span className="value" style={{ color: kpis.hoursOverAllocated > 0 ? 'var(--danger)' : undefined }}>
                {kpis.hoursOverAllocated}
              </span>
              <span className="label">Hours overallocated</span>
            </div>
            <div className="department-header-kpi">
              <span className="value">{kpis.activityCount}</span>
              <span className="label">Activities supported</span>
            </div>
          </div>
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

      {error && <div className="alert error">{error}</div>}

      <div className="card department-team-overview">
        <div className="toolbar department-team-overview-header">
            <h2 style={{ margin: 0, flex: 1 }}>Heat Map</h2>
          {editable && (
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
                <line x1="18" y1="8" x2="18" y2="14" />
                <line x1="15" y1="11" x2="21" y2="11" />
              </svg>
              <span>Add person</span>
            </button>
          )}
          <button
            type="button"
            className="workload-collapse-button department-section-collapse-button"
            aria-label={heatMapCollapsed ? 'Expand Heat Map' : 'Collapse Heat Map'}
            aria-expanded={!heatMapCollapsed}
            aria-controls="department-team-roster-section"
            title={heatMapCollapsed ? 'Expand Heat Map' : 'Collapse Heat Map'}
            onClick={() => setHeatMapCollapsed((value) => !value)}
          >
            <span className={heatMapCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
          </button>
        </div>
        <div className="team-overview-card">
        <section id="department-team-roster-section" className="team-roster-section" hidden={heatMapCollapsed}>
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
                const { weeksOver, hoursOver } = overallocationFor(row, demandWeeks);
                const assignments = assignmentCountByPerson.get(row.personId?.toLowerCase() ?? '') ?? 0;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={[
                        'matrix-demand-row',
                        isSelected ? 'row-selected' : '',
                        row.isActive === false ? 'row-inactive' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedRow(row.id)}
                    >
                      <th rowSpan={2} scope="rowgroup" className="matrix-label">
                        <span className="person-row">
                          <span className="person-identity">
                            <span className="person-name-row">
                              <span className="person-name-group">
                                <span className={isMe ? 'person-name person-me' : 'person-name'}>
                                  {row.personName ?? 'Unassigned'}
                                </span>
                                {row.isActive === false && <span className="badge danger">Inactive</span>}
                              </span>
                              {canManageRoster && (
                                <button
                                  className={['icon-button', 'icon-button-plain', row.isActive === false ? 'success' : 'danger'].join(' ')}
                                  aria-label={
                                    row.isActive === false
                                      ? `Reactivate ${row.personName ?? 'this person'}'s availability`
                                      : `Inactivate ${row.personName ?? 'this person'}'s availability`
                                  }
                                  title={
                                    row.isActive === false
                                      ? `Reactivate ${row.personName ?? 'this person'}'s availability`
                                      : `Inactivate ${row.personName ?? 'this person'}'s availability`
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRowActive.mutate({ capacityId: row.id, isActive: row.isActive === false });
                                  }}
                                >
                                  {row.isActive === false ? '↻' : '⊘'}
                                </button>
                              )}
                              {canManageRoster && (
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
                              )}
                            </span>
                            <span className="person-stat-line">
                              Weeks over: <strong className={weeksOver > 0 ? 'stat-over' : undefined}>{weeksOver}</strong>
                              {' · '}
                              Hours over: <strong className={hoursOver > 0 ? 'stat-over' : undefined}>{hoursOver}</strong>
                              {' · '}
                              Assignments: <strong>{assignments}</strong>
                            </span>
                          </span>
                        </span>
                      </th>
                      {columns.map((week) => {
                        const utilization = utilizationFor(row, week);
                        const over = utilization !== null && utilization > 1;
                        return (
                          <td
                            key={week}
                            className={['demand-only-cell', heatmapLevel(demandWeeks[week] ?? 0, row.weeks[week] ?? 0), over ? 'over-allocated' : ''].filter(Boolean).join(' ')}
                            title={`Total demand, week of ${weekLabel(week)}`}
                          >
                            {demandWeeks[week] ?? 0}
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
                        const key = `${row.id}:${week}`;
                        const value = draft[key] ?? String(row.weeks[week] ?? 0);
                        const utilization = utilizationFor(row, week);
                        const over = utilization !== null && utilization > 1;
                        return (
                          <td
                            key={week}
                            className={[heatmapLevel(demandWeeks[week] ?? 0, Number(value)), Number(value) > 0 ? 'has-availability' : '', Number(value) > alertThreshold ? 'threshold-alert' : '', over ? 'over-allocated' : '']
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
                              value={value}
                              readOnly={!canManageRoster}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                              onFocus={(event) => event.target.select()}
                              onBlur={(event) => commit(row, week, event.target.value)}
                              onKeyDown={(event) => {
                                blockNonIntegerKeys(event);
                                handleKey(event, rowIndex, week);
                              }}
                              aria-label={`${row.personName ?? 'Person'} week of ${weekLabel(week)}`}
                            />
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
          total demand (reference only), bottom row is editable availability · shaded cells are weeks where demand
          exceeds availability
        </p>
        </section>
        </div>
      </div>

      {selected && (
        <div className="card department-individual-details-card">
        <section id="department-individual-detail-section" className="department-person-detail individual-detail-section">
          <div className="toolbar department-person-detail-header">
            <h2 style={{ margin: 0, flex: 1 }}>
              {individualDetailCollapsed ? 'Individual Details' : selected.personName ?? 'Person'}
            </h2>
            {canManageRoster && (
              <label className="weeks-lookahead-control" htmlFor="department-alert-threshold">
                <svg className="alert-threshold-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 3 22 21H2Z" />
                  <line x1="12" y1="9" x2="12" y2="14" />
                  <circle cx="12" cy="17" r="1" />
                </svg>
                <span>Alert above (hours)</span>
                <input
                  id="department-alert-threshold"
                  type="number"
                  min={0}
                  max={MAX_HOURS}
                  step={1}
                  value={alertThreshold}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) setAlertThreshold(Math.min(MAX_HOURS, Math.max(0, Math.round(next))));
                  }}
                />
              </label>
            )}
            {!individualDetailCollapsed && canManageRoster && (
              <>
              <button
                type="button"
                className="icon-button icon-button-add icon-button-add-labeled person-detail-action"
                aria-label={`Normalize ${selected.personName ?? 'this person'}'s availability`}
                title={
                  selectedEqualizeDisabled
                    ? `${selected.personName ?? 'This person'}'s availability already matches demand`
                    : `Set ${selected.personName ?? "this person's"} availability to equal its demand`
                }
                disabled={selectedEqualizeDisabled}
                onClick={() => normalizeAvailability(selected)}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 2 21 6 17 10" />
                  <path d="M3 12v-2a4 4 0 0 1 4-4h14" />
                  <polyline points="7 22 3 18 7 14" />
                  <path d="M21 12v2a4 4 0 0 1-4 4H3" />
                </svg>
                <span>Equalize</span>
              </button>
              <div className="bulk-availability-control">
                <button
                  type="button"
                  className="bulk-availability-submit"
                  aria-label={`Set all weeks to ${bulkAvailability} hours for ${selected.personName ?? 'this person'}`}
                  title={`Set all weeks to ${bulkAvailability} hours`}
                  disabled={setAllAvailability.isPending || !/^(?:[0-9]|[1-3][0-9]|40)$/.test(bulkAvailability)}
                  onClick={() => setAllAvailability.mutate({ capacityId: selected.id, hours: Number(bulkAvailability) })}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h16" />
                    <path d="M4 6h16" />
                    <path d="M4 18h16" />
                    <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
                    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <span>Set all weeks to</span>
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={1}
                  value={bulkAvailability}
                  onChange={(event) => setBulkAvailability(event.target.value)}
                  onKeyDown={blockNonIntegerKeys}
                  aria-label={`Set all availability for ${selected.personName ?? 'this person'}`}
                />
                <span>hours</span>
              </div>
              </>
            )}
            <button
              type="button"
              className="workload-collapse-button person-detail-collapse-button"
              aria-label={individualDetailCollapsed ? `Expand ${selected.personName ?? 'person'} details` : `Collapse ${selected.personName ?? 'person'} details`}
              aria-expanded={!individualDetailCollapsed}
              aria-controls="department-person-detail-content"
              title={individualDetailCollapsed ? 'Expand individual details' : 'Collapse individual details'}
              onClick={() => setIndividualDetailCollapsed((value) => !value)}
            >
              <span className={individualDetailCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
            </button>
          </div>
          <div id="department-person-detail-content" className="department-person-detail-content" hidden={individualDetailCollapsed}>
          <aside className="department-detail-roster-picker" aria-label="Department roster">
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
                  <button
                    key={row.id}
                    type="button"
                    className={selectedRow === row.id ? 'active' : ''}
                    onClick={() => setSelectedRow(row.id)}
                  >
                    <span className="department-detail-roster-name-line">
                      <strong>{row.personName ?? 'Unassigned'}</strong>
                      <span className="department-detail-roster-pills">
                        <span
                          className={totalDemand > totalAvailability ? 'department-detail-roster-pill demand-alert' : 'department-detail-roster-pill'}
                          title="Total demand"
                        >
                          {totalDemand}
                        </span>
                        <span
                          className={totalAvailability > alertThreshold * detailWeeks ? 'department-detail-roster-pill availability-alert' : 'department-detail-roster-pill'}
                          title={`Total availability; cumulative alert level ${alertThreshold * detailWeeks} hours`}
                        >
                          {totalAvailability}
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
                );
              })}
            </div>
          </aside>
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
            alertThreshold={alertThreshold}
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
                {visibleNonProjectGroups.length === 0 && (
                  <tr className="no-demand-notice-row">
                    <td colSpan={chartColumns.length + 1}>
                      There is no other demand assigned for this person over the selected period.
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
                                readOnly={!canManageRoster || !demandRow}
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
        </section>
        </div>
      )}

      {selected && (
        <div className="card department-analytics-card">
          <div className="toolbar department-analytics-header">
            <h2 style={{ margin: 0, flex: 1 }}>Analytics</h2>
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
            series={teamChartMode === 'person' ? teamSeries : teamSeriesByProject}
            availability={totals}
            alertThreshold={alertThreshold}
            selectedId={teamChartMode === 'person' ? selected.id : undefined}
            onSelect={teamChartMode === 'person' ? setSelectedRow : undefined}
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
            <span className="detail-label">Last data review</span>
            <span className={checkInClass ? `check-in-${checkInClass}` : undefined}>
              {formatDate(details?.lastCheckIn)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
