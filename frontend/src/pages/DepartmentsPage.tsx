import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  capacityApi,
  demandApi,
  departmentsApi,
  lookupsApi,
  nonProjectDemandApi,
  peopleApi,
} from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import PersonCell from '../components/admin/PersonCell';
import RowLegend from '../components/admin/RowLegend';
import { useAuthStore } from '../store/authStore';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { canEditDepartment, isAdmin } from '../utils/permissions';
import { formatDate } from '../utils/dates';
import type { Department, Person } from '../types';

const KPI_WEEKS = 26;

function emptyWeeks(): number[] {
  return new Array(KPI_WEEKS).fill(0);
}

function addInto(target: number[], source: number[] | undefined): number[] {
  if (!source) return target;
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
  return target;
}

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const personId = user?.personId;
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(personId ? 'mine' : 'all');
  const [hideInactive, setHideInactive] = useState(true);
  const [functionId, setFunctionId] = useState('');

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });
  const allPeople = useQuery({ queryKey: ['people', 'all'], queryFn: () => peopleApi.list() });
  const allCapacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const allNonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });

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

  const kpisByDepartment = useMemo(() => {
    const map = new Map<string, { peopleCount: number; hoursOver: number; weeksOver: number }>();
    for (const department of departments.data ?? []) {
      const members = peopleByDepartment.get(department.id) ?? [];
      const activeMembers = members.filter((person) => person.isActive !== false);
      const overAllocatedWeeks = new Set<number>();
      let hoursOver = 0;

      for (const person of activeMembers) {
        const key = person.id.toLowerCase();
        const availability = capacityByPerson.get(key) ?? emptyWeeks();
        const demand = demandByPerson.get(key) ?? emptyWeeks();

        for (let week = 0; week < KPI_WEEKS; week += 1) {
          const over = (demand[week] ?? 0) - (availability[week] ?? 0);
          if (over > 0) {
            overAllocatedWeeks.add(week);
            hoursOver += over;
          }
        }
      }

      map.set(department.id, {
        peopleCount: activeMembers.length,
        hoursOver,
        weeksOver: overAllocatedWeeks.size,
      });
    }

    return map;
  }, [capacityByPerson, demandByPerson, departments.data, peopleByDepartment]);

  const rows = filterByScope(departments.data ?? [], scope, personId).filter(
    (row) => (!hideInactive || row.isActive !== false) && (!functionId || row.functionId === functionId),
  );

  const columns: Column<Department>[] = [
    {
      key: 'name',
      label: 'Department name',
      value: (row) => row.name,
      render: (row) => (
        <span className="name-cell">
          <Link to={`/departments/${row.id}`} className="record-link">
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      key: 'function',
      label: 'Function',
      value: (row) => row.functionName,
    },
    {
      key: 'lead',
      label: 'Department lead',
      value: (row) => row.leadName,
      render: (row) => <PersonCell name={row.leadName} personId={row.leadPersonId} me={personId} />,
    },
    {
      key: 'people',
      label: 'People',
      width: '68px',
      value: (row) => kpisByDepartment.get(row.id)?.peopleCount ?? 0,
    },
    {
      key: 'weeksOver',
      label: 'Wks over',
      width: '72px',
      value: (row) => kpisByDepartment.get(row.id)?.weeksOver ?? 0,
      render: (row) => {
        const value = kpisByDepartment.get(row.id)?.weeksOver ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'hoursOver',
      label: 'Hrs over',
      width: '72px',
      value: (row) => kpisByDepartment.get(row.id)?.hoursOver ?? 0,
      render: (row) => {
        const value = kpisByDepartment.get(row.id)?.hoursOver ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
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
          to={`/departments/${row.id}`}
          className="icon-button"
          title={canEditDepartment(user, row) ? `Edit ${row.name}` : `View ${row.name}`}
        >
          {canEditDepartment(user, row) ? '✎' : '›'}
        </Link>
      ),
    },
  ];

  return (
    <section className="accent-section accent-departments">
      <div className="accent-section-header">
        <div className="department-title-row">
          <button type="button" className="back-button department-inline-back" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            ←
          </button>
          <div>
            <h1 className="page-title">Departments</h1>
            <p className="page-subtitle">Departments you lead, support or belong to.</p>
          </div>
        </div>
        {isAdmin(user) && (
          <Link to="/departments/new">
            <button className="accent-button">+ New department</button>
          </Link>
        )}
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search departments, leads or functions…"
        scope={{ value: scope, onChange: setScope, disabled: !personId }}
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
      <div className="card table-card departments-table-card">
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
    </section>
  );
}

