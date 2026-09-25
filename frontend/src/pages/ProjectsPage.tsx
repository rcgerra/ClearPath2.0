import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, nonProjectDemandApi, projectsApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import PersonCell from '../components/admin/PersonCell';
import RowLegend from '../components/admin/RowLegend';
import ScheduleHealthBadge from '../components/ScheduleHealthBadge';
import { useAuthStore } from '../store/authStore';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { canEditProject } from '../utils/permissions';
import { formatDate } from '../utils/dates';
import { calculateProjectScheduleHealth } from '../utils/projectSchedule';
import type { Project } from '../types';

const KPI_WEEKS = 26;

function emptyWeeks(): number[] {
  return new Array(KPI_WEEKS).fill(0);
}

function addInto(target: number[], source: number[] | undefined): number[] {
  if (!source) return target;
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
  return target;
}

function demandTotal(weeks: number[]): number {
  return Object.keys(weeks).reduce((total, key) => total + (Number(weeks[Number(key)]) || 0), 0);
}

function demandToDate(weeks: number[]): number {
  return Object.keys(weeks).reduce((total, key) => {
    const week = Number(key);
    return total + (week < 0 ? Number(weeks[week]) || 0 : 0);
  }, 0);
}

interface ProjectKpis {
  teamMembers: number;
  demandToDate: number;
  totalDemand: number;
  peopleOverAllocated: number;
  weeksOverAllocated: number;
  hoursOverAllocated: number;
}

const EMPTY_KPIS: ProjectKpis = {
  teamMembers: 0,
  demandToDate: 0,
  totalDemand: 0,
  peopleOverAllocated: 0,
  weeksOverAllocated: 0,
  hoursOverAllocated: 0,
};

export default function ProjectsPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const personId = user?.personId;
  const canCreate = Boolean(user?.roles.includes('admin'));
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(personId ? 'mine' : 'all');
  const [hideInactive, setHideInactive] = useState(true);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const allCapacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const allNonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });

  const capacityByPerson = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of allCapacity.data ?? []) {
      if (!row.personId) continue;
      map.set(row.personId.toLowerCase(), row.weeks.slice(0, KPI_WEEKS));
    }
    return map;
  }, [allCapacity.data]);

  const demandByPerson = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      const key = row.personId.toLowerCase();
      map.set(key, addInto(map.get(key) ?? emptyWeeks(), row.weeks));
    }
    for (const row of allNonProjectDemand.data ?? []) {
      const key = row.personId.toLowerCase();
      map.set(key, addInto(map.get(key) ?? emptyWeeks(), row.weeks));
    }
    return map;
  }, [allDemand.data, allNonProjectDemand.data]);

  const projectDemandByProject = useMemo(() => {
    const map = new Map<string, { demandToDate: number; totalDemand: number }>();
    for (const row of allDemand.data ?? []) {
      if (!row.projectId) continue;
      const current = map.get(row.projectId) ?? { demandToDate: 0, totalDemand: 0 };
      current.demandToDate += demandToDate(row.weeks);
      current.totalDemand += demandTotal(row.weeks);
      map.set(row.projectId, current);
    }
    return map;
  }, [allDemand.data]);

  const personIdsByProject = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      if (!row.weeks.slice(0, KPI_WEEKS).some((value) => value > 0)) continue;
      const set = map.get(row.projectId) ?? new Set<string>();
      set.add(row.personId.toLowerCase());
      map.set(row.projectId, set);
    }
    return map;
  }, [allDemand.data]);

  const kpisByProject = useMemo(() => {
    const map = new Map<string, ProjectKpis>();
    for (const project of projects.data ?? []) {
      const memberIds = personIdsByProject.get(project.id) ?? new Set<string>();
      const kpis: ProjectKpis = {
        ...EMPTY_KPIS,
        teamMembers: memberIds.size,
        demandToDate: projectDemandByProject.get(project.id)?.demandToDate ?? 0,
        totalDemand: projectDemandByProject.get(project.id)?.totalDemand ?? 0,
      };

      const overAllocatedWeeks = new Set<number>();
      for (const key of memberIds) {
        const availability = capacityByPerson.get(key) ?? emptyWeeks();
        const demand = demandByPerson.get(key) ?? emptyWeeks();
        let personIsOverAllocated = false;
        for (let week = 0; week < KPI_WEEKS; week += 1) {
          const over = (demand[week] ?? 0) - (availability[week] ?? 0);
          if (over > 0) {
            overAllocatedWeeks.add(week);
            kpis.hoursOverAllocated += over;
            personIsOverAllocated = true;
          }
        }
        if (personIsOverAllocated) kpis.peopleOverAllocated += 1;
      }

      kpis.weeksOverAllocated = overAllocatedWeeks.size;
      map.set(project.id, kpis);
    }

    return map;
  }, [capacityByPerson, demandByPerson, personIdsByProject, projectDemandByProject, projects.data]);
  const scheduleHealthByProject = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateProjectScheduleHealth>>();
    for (const project of projects.data ?? []) {
      const kpis = kpisByProject.get(project.id) ?? EMPTY_KPIS;
      map.set(project.id, calculateProjectScheduleHealth(
        project,
        (allDemand.data ?? []).filter((row) => row.projectId === project.id),
        { people: kpis.peopleOverAllocated, hours: kpis.hoursOverAllocated },
      ));
    }
    return map;
  }, [allDemand.data, kpisByProject, projects.data]);

  const rows = filterByScope(projects.data ?? [], scope, personId).filter(
    (row) => !hideInactive || row.isActive !== false,
  );

  const columns: Column<Project>[] = [
    {
      key: 'name',
      label: 'Project name',
      value: (row) => row.name,
      render: (row) => (
        <span className="name-cell">
          <Link to={`/projects/${row.id}`} className="record-link">
            {row.name}
          </Link>
          {row.started === false && <span className="pill pill-not-started">Not started</span>}
        </span>
      ),
    },
    {
      key: 'spotId',
      label: 'SPOT ID',
      width: '120px',
      value: (row) => row.spotId,
      render: (row) => <span className="mono">{row.spotId ?? '—'}</span>,
    },
    {
      key: 'manager',
      label: 'Project manager',
      value: (row) => row.managerName,
      render: (row) => <PersonCell name={row.managerName} personId={row.managerPersonId} me={personId} />,
    },
    {
      key: 'sponsor',
      label: 'Project sponsor',
      value: (row) => row.sponsorName,
      render: (row) => <PersonCell name={row.sponsorName} personId={row.sponsorPersonId} me={personId} />,
    },
    {
      key: 'teamMembers',
      label: 'People',
      width: '68px',
      value: (row) => kpisByProject.get(row.id)?.teamMembers ?? 0,
    },
    {
      key: 'totalDemand',
      label: 'Total demand',
      width: '92px',
      value: (row) => kpisByProject.get(row.id)?.totalDemand ?? 0,
    },
    {
      key: 'weeksOver',
      label: 'Wks over',
      width: '72px',
      value: (row) => kpisByProject.get(row.id)?.weeksOverAllocated ?? 0,
      render: (row) => {
        const value = kpisByProject.get(row.id)?.weeksOverAllocated ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'hoursOver',
      label: 'Hrs over',
      width: '72px',
      value: (row) => kpisByProject.get(row.id)?.hoursOverAllocated ?? 0,
      render: (row) => {
        const value = kpisByProject.get(row.id)?.hoursOverAllocated ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'scheduleHealth',
      label: 'Schedule',
      width: '108px',
      value: (row) => scheduleHealthByProject.get(row.id)?.label ?? '',
      render: (row) => {
        const health = scheduleHealthByProject.get(row.id);
        return health ? <ScheduleHealthBadge health={health} /> : '—';
      },
    },
    {
      key: 'lastCheckIn',
      label: 'Last check-in',
      value: (row) => row.lastCheckIn ?? '',
      render: (row) => formatDate(row.lastCheckIn),
    },
    {
      key: 'edit',
      label: '',
      sortable: false,
      width: '64px',
      value: () => '',
      render: (row) => (
        <Link
          to={`/projects/${row.id}`}
          className="icon-button"
          title={canEditProject(user, row) ? `Edit ${row.name}` : `View ${row.name}`}
        >
          {canEditProject(user, row) ? '✎' : '›'}
        </Link>
      ),
    },
  ];

  return (
    <section className="accent-section accent-projects">
      <div className="accent-section-header">
        <div className="department-title-row">
          <button type="button" className="back-button department-inline-back" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            ←
          </button>
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">Projects you manage, sponsor or support.</p>
          </div>
        </div>
        {canCreate && (
          <Link to="/projects/new">
            <button className="accent-button">+ New project</button>
          </Link>
        )}
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search projects, managers or sponsors…"
        scope={{ value: scope, onChange: setScope, disabled: !personId }}
        toggles={[{ label: 'Hide inactive', checked: hideInactive, onChange: setHideInactive }]}
      />
      <div className="card table-card projects-table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.id}
          getRowClassName={(row) => rowClassName(row, personId)}
          search={search}
          initialSortKey="name"
          isLoading={projects.isLoading}
          emptyMessage="No projects match the current filters."
        />
      </div>
      <RowLegend />
    </section>
  );
}
