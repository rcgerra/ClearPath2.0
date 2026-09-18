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
import ListToolbar from '../components/admin/ListToolbar';
import PersonCell from '../components/admin/PersonCell';
import RowLegend from '../components/admin/RowLegend';
import { useAuthStore } from '../store/authStore';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { canEditDepartment, isAdmin } from '../utils/permissions';
import type { Person } from '../types';

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
      <div className="card department-summary-list">
        {rows.filter((row) => row.name.toLowerCase().includes(search.toLowerCase()) || row.leadName?.toLowerCase().includes(search.toLowerCase()) || row.functionName?.toLowerCase().includes(search.toLowerCase())).length === 0 && (
          <p className="muted">No departments match the current filters.</p>
        )}
        {rows
          .filter(
            (row) =>
              row.name.toLowerCase().includes(search.toLowerCase()) ||
              row.leadName?.toLowerCase().includes(search.toLowerCase()) ||
              row.functionName?.toLowerCase().includes(search.toLowerCase()),
          )
          .map((row) => {
            const kpis = kpisByDepartment.get(row.id) ?? { peopleCount: 0, hoursOver: 0, weeksOver: 0 };
            return (
              <div key={row.id} className={['department-summary-row', rowClassName(row, personId)].filter(Boolean).join(' ')}>
                <div className="department-summary-main">
                  <Link to={`/departments/${row.id}`} className="record-link department-summary-name">
                    {row.name}
                  </Link>
                  {row.functionName && <span className="department-summary-function">{row.functionName}</span>}
                </div>
                <div className="department-summary-meta">
                  <span>
                    <span className="meta-label">Lead:</span> <PersonCell name={row.leadName} personId={row.leadPersonId} me={personId} />
                  </span>
                  <span>
                    <span className="meta-label">People:</span> <strong>{kpis.peopleCount}</strong>
                  </span>
                  <span>
                    <span className="meta-label">Hours over:</span> <strong className={kpis.hoursOver > 0 ? 'stat-over' : undefined}>{kpis.hoursOver}</strong>
                  </span>
                  <span>
                    <span className="meta-label">Weeks over:</span> <strong className={kpis.weeksOver > 0 ? 'stat-over' : undefined}>{kpis.weeksOver}</strong>
                  </span>
                </div>
                {canEditDepartment(user, row) && (
                  <Link to={`/departments/${row.id}`} className="icon-button department-summary-action" title={`View ${row.name}`}>
                    ›
                  </Link>
                )}
              </div>
            );
          })}
      </div>
      <RowLegend />
    </section>
  );
}
