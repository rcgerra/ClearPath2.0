import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { capacityApi, demandApi, nonProjectDemandApi, peopleApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import { formatCount } from '../../utils/format';
import type { Person } from '../../types';

/** KPI horizon requested for the roster roll-up. */
const KPI_WEEKS = 26;

function emptyWeeks(): number[] {
  return new Array(KPI_WEEKS).fill(0);
}

function addInto(target: number[], source: number[] | undefined): number[] {
  if (!source) return target;
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
  return target;
}

interface PersonKpis {
  assignments: number;
  totalDemand: number;
  totalAvailability: number;
  hoursOver: number;
  weeksOver: number;
}

const EMPTY_KPIS: PersonKpis = { assignments: 0, totalDemand: 0, totalAvailability: 0, hoursOver: 0, weeksOver: 0 };

export default function PeopleListPage() {
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const allCapacity = useQuery({ queryKey: ['capacity', 'all'], queryFn: () => capacityApi.list() });
  const allDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const allNonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });

  const rows = (people.data ?? []).filter((row) => !hideInactive || row.isActive !== false);

  const capacityByPerson = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of allCapacity.data ?? []) {
      if (!row.personId) continue;
      map.set(row.personId.toLowerCase(), row.weeks.slice(0, KPI_WEEKS));
    }
    return map;
  }, [allCapacity.data]);

  /** Each person's total demand across all projects and non-project work. */
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

  /** Distinct projects each person has demand on, in the next 26 weeks. */
  const assignmentsByPerson = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of allDemand.data ?? []) {
      if (!row.personId) continue;
      if (!row.weeks.slice(0, KPI_WEEKS).some((value) => value > 0)) continue;
      const key = row.personId.toLowerCase();
      const set = map.get(key) ?? new Set<string>();
      set.add(row.projectId);
      map.set(key, set);
    }
    return map;
  }, [allDemand.data]);

  const kpisByPerson = useMemo(() => {
    const map = new Map<string, PersonKpis>();
    for (const person of people.data ?? []) {
      const key = person.id.toLowerCase();
      const availability = capacityByPerson.get(key) ?? emptyWeeks();
      const demand = demandByPerson.get(key) ?? emptyWeeks();
      const kpis: PersonKpis = { ...EMPTY_KPIS, assignments: assignmentsByPerson.get(key)?.size ?? 0 };
      for (let week = 0; week < KPI_WEEKS; week += 1) {
        const avail = availability[week] ?? 0;
        const dem = demand[week] ?? 0;
        kpis.totalAvailability += avail;
        kpis.totalDemand += dem;
        const over = dem - avail;
        if (over > 0) {
          kpis.weeksOver += 1;
          kpis.hoursOver += over;
        }
      }
      map.set(person.id, kpis);
    }
    return map;
  }, [people.data, capacityByPerson, demandByPerson, assignmentsByPerson]);

  const columns: Column<Person>[] = [
    {
      key: 'name',
      label: 'Name',
      value: (row) => row.name,
      render: (row) => (
        <span className="name-cell">
          <Link to={`/admin/people/${row.id}`} className="record-link">
            {row.name}
          </Link>
          {row.employmentType?.toLowerCase() === 'contractor' && <span className="pill pill-contractor">Ext</span>}
        </span>
      ),
    },
    { key: 'department', label: 'Department', value: (row) => row.departmentName },
    {
      key: 'assignments',
      label: 'Assignments',
      width: '96px',
      value: (row) => kpisByPerson.get(row.id)?.assignments ?? 0,
    },
    {
      key: 'demand',
      label: 'Demand (26w)',
      width: '108px',
      value: (row) => kpisByPerson.get(row.id)?.totalDemand ?? 0,
      render: (row) => formatCount(kpisByPerson.get(row.id)?.totalDemand),
    },
    {
      key: 'availability',
      label: 'Availability (26w)',
      width: '120px',
      value: (row) => kpisByPerson.get(row.id)?.totalAvailability ?? 0,
      render: (row) => formatCount(kpisByPerson.get(row.id)?.totalAvailability),
    },
    {
      key: 'hoursOver',
      label: 'Hrs over',
      width: '84px',
      value: (row) => kpisByPerson.get(row.id)?.hoursOver ?? 0,
      render: (row) => {
        const value = kpisByPerson.get(row.id)?.hoursOver ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'weeksOver',
      label: 'Wks over',
      width: '84px',
      value: (row) => kpisByPerson.get(row.id)?.weeksOver ?? 0,
      render: (row) => {
        const value = kpisByPerson.get(row.id)?.weeksOver ?? 0;
        return <span style={{ color: value > 0 ? 'var(--danger)' : undefined }}>{value}</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      value: (row) => (row.isActive === false ? 'Inactive' : 'Active'),
      render: (row) => (
        <span className={`badge ${row.isActive === false ? 'danger' : 'success'}`}>
          {row.isActive === false ? 'Inactive' : 'Active'}
        </span>
      ),
    },
    {
      key: 'edit',
      label: '',
      sortable: false,
      width: '64px',
      value: () => '',
      render: (row) => (
        <Link to={`/admin/people/${row.id}`} className="icon-button" title={`Edit ${row.name}`}>
          ✎
        </Link>
      ),
    },
  ];

  return (
    <AccentSection
      accent="people"
      title="People"
      subtitle="Everyone available to staff projects."
      actions={
        <Link to="/admin/people/new">
          <button className="accent-button">+ New person</button>
        </Link>
      }
    >
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search people or departments…"
        toggles={[{ label: 'Hide inactive', checked: hideInactive, onChange: setHideInactive }]}
      />
      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.id}
          getRowClassName={(row) => (row.isActive === false ? 'row-inactive' : undefined)}
          search={search}
          initialSortKey="name"
          isLoading={people.isLoading}
          emptyMessage="No people found."
        />
      </div>
    </AccentSection>
  );
}
