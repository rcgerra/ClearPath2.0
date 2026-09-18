import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  capacityApi,
  demandApi,
  departmentsApi,
  lookupsApi,
  nonProjectDemandApi,
  peopleApi,
  WritePayload,
} from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import RowLegend from '../../components/admin/RowLegend';
import { useAuthStore } from '../../store/authStore';
import { rowClassName } from '../../utils/ownership';
import { formatDate } from '../../utils/dates';
import { formatCount } from '../../utils/format';
import type { Department, Person } from '../../types';

/** KPI horizon requested for department roll-ups. */
const KPI_WEEKS = 26;

function emptyWeeks(): number[] {
  return new Array(KPI_WEEKS).fill(0);
}

function addInto(target: number[], source: number[] | undefined): number[] {
  if (!source) return target;
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
  return target;
}

interface DepartmentKpis {
  peopleCount: number;
  totalAssignments: number;
  weeksOverAllocated: number;
  hoursOverAllocated: number;
  totalDemand: number;
  totalAvailability: number;
}

const EMPTY_KPIS: DepartmentKpis = {
  peopleCount: 0,
  totalAssignments: 0,
  weeksOverAllocated: 0,
  hoursOverAllocated: 0,
  totalDemand: 0,
  totalAvailability: 0,
};

export default function DepartmentsListPage() {
  const personId = useAuthStore((state) => state.user?.personId);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const [functionId, setFunctionId] = useState('');
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const allPeople = useQuery({ queryKey: ['people', 'all'], queryFn: () => peopleApi.list() });
  const allCapacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const allNonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });

  const updateDepartment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WritePayload }) => departmentsApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });

  const leadOptions = useMemo(
    () => (allPeople.data ?? []).filter((person) => person.isActive !== false).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [allPeople.data],
  );

  const peopleByDepartment = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const person of allPeople.data ?? []) {
      if (!person.departmentId) continue;
      const list = map.get(person.departmentId) ?? [];
      list.push(person);
      map.set(person.departmentId, list);
    }
    return map;
  }, [allPeople.data]);

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

  const assignmentCountByPerson = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      if (!row.weeks.slice(0, KPI_WEEKS).some((value) => value > 0)) continue;
      const key = row.personId.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [allDemand.data]);

  /** Roll-up KPIs for each department, across the next 26 weeks. */
  const kpisByDepartment = useMemo(() => {
    const map = new Map<string, DepartmentKpis>();
    for (const department of departments.data ?? []) {
      const members = peopleByDepartment.get(department.id) ?? [];
      const kpis: DepartmentKpis = { ...EMPTY_KPIS, peopleCount: members.filter((person) => person.isActive !== false).length };
      const overAllocatedWeeks = new Set<number>();
      for (const person of members) {
        const key = person.id.toLowerCase();
        const availability = capacityByPerson.get(key) ?? emptyWeeks();
        const demand = demandByPerson.get(key) ?? emptyWeeks();
        kpis.totalAssignments += assignmentCountByPerson.get(key) ?? 0;
        for (let week = 0; week < KPI_WEEKS; week += 1) {
          const avail = availability[week] ?? 0;
          const dem = demand[week] ?? 0;
          kpis.totalAvailability += avail;
          kpis.totalDemand += dem;
          const over = dem - avail;
          if (over > 0) {
            overAllocatedWeeks.add(week);
            kpis.hoursOverAllocated += over;
          }
        }
      }
      kpis.weeksOverAllocated = overAllocatedWeeks.size;
      map.set(department.id, kpis);
    }
    return map;
  }, [departments.data, peopleByDepartment, capacityByPerson, demandByPerson, assignmentCountByPerson]);

  const rows = (departments.data ?? []).filter(
    (row) => (!hideInactive || row.isActive !== false) && (!functionId || row.functionId === functionId),
  );

  const columns: Column<Department>[] = [
    {
      key: 'name',
      label: 'Department name',
      value: (row) => row.name,
      render: (row) => (
        <Link to={`/admin/departments/${row.id}`} className="record-link">
          {row.name}
        </Link>
      ),
    },
    {
      key: 'lead',
      label: 'Department lead',
      value: (row) => row.leadName,
      render: (row) => (
        <select
          className="inline-select"
          value={row.leadPersonId ?? ''}
          onChange={(event) =>
            updateDepartment.mutate({ id: row.id, body: { leadPersonId: event.target.value || undefined } })
          }
        >
          <option value="">—</option>
          {leadOptions.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      ),
    },
    { key: 'function', label: 'Function', value: (row) => row.functionName },
    {
      key: 'people',
      label: 'People',
      width: '72px',
      value: (row) => kpisByDepartment.get(row.id)?.peopleCount ?? 0,
    },
    {
      key: 'assignments',
      label: 'Assignments',
      width: '96px',
      value: (row) => kpisByDepartment.get(row.id)?.totalAssignments ?? 0,
    },
    {
      key: 'weeksOver',
      label: 'Wks over',
      width: '84px',
      value: (row) => kpisByDepartment.get(row.id)?.weeksOverAllocated ?? 0,
      render: (row) => {
        const value = kpisByDepartment.get(row.id)?.weeksOverAllocated ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'hoursOver',
      label: 'Hrs over',
      width: '84px',
      value: (row) => kpisByDepartment.get(row.id)?.hoursOverAllocated ?? 0,
      render: (row) => {
        const value = kpisByDepartment.get(row.id)?.hoursOverAllocated ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'demand',
      label: 'Demand (26w)',
      width: '108px',
      value: (row) => kpisByDepartment.get(row.id)?.totalDemand ?? 0,
      render: (row) => formatCount(kpisByDepartment.get(row.id)?.totalDemand),
    },
    {
      key: 'availability',
      label: 'Availability (26w)',
      width: '120px',
      value: (row) => kpisByDepartment.get(row.id)?.totalAvailability ?? 0,
      render: (row) => formatCount(kpisByDepartment.get(row.id)?.totalAvailability),
    },
    {
      key: 'lastCheckIn',
      label: 'Last check-in',
      value: (row) => row.lastCheckIn ?? '',
      render: (row) => formatDate(row.lastCheckIn),
    },
    {
      key: 'active',
      label: 'Active',
      sortable: false,
      width: '72px',
      value: (row) => (row.isActive === false ? 'Inactive' : 'Active'),
      render: (row) => (
        <label className="switch switch-compact">
          <input
            type="checkbox"
            checked={row.isActive !== false}
            onChange={(event) => updateDepartment.mutate({ id: row.id, body: { isActive: event.target.checked } })}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      ),
    },
    {
      key: 'edit',
      label: '',
      sortable: false,
      width: '64px',
      value: () => '',
      render: (row) => (
        <Link to={`/admin/departments/${row.id}`} className="icon-button" title={`Edit ${row.name}`}>
          ✎
        </Link>
      ),
    },
  ];

  return (
    <AccentSection
      accent="departments"
      title="Departments"
      subtitle="Organizational units, their leads and functions."
      actions={
        <Link to="/admin/departments/new">
          <button className="accent-button">+ New department</button>
        </Link>
      }
    >
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search departments, leads or functions…"
        selects={[
          {
            label: 'Function',
            value: functionId,
            onChange: setFunctionId,
            allLabel: 'All functions',
            options: (functions.data ?? []).map((fn) => ({ value: fn.id, label: fn.name })),
          },
        ]}
        toggles={[{ label: 'Hide inactive', checked: hideInactive, onChange: setHideInactive }]}
      />
      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.id}
          getRowClassName={(row) => rowClassName(row, personId)}
          search={search}
          initialSortKey="name"
          isLoading={departments.isLoading}
          emptyMessage="No departments match the current filters."
        />
      </div>
      <RowLegend />
    </AccentSection>
  );
}

