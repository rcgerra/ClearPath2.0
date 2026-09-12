import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { departmentsApi, lookupsApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import PersonCell from '../components/admin/PersonCell';
import RowLegend from '../components/admin/RowLegend';
import { useAuthStore } from '../store/authStore';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { canEditDepartment, isAdmin } from '../utils/permissions';
import { formatDate } from '../utils/dates';
import type { Department } from '../types';

export default function DepartmentsPage() {
  const user = useAuthStore((state) => state.user);
  const personId = user?.personId;
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(personId ? 'mine' : 'all');
  const [hideInactive, setHideInactive] = useState(true);
  const [functionId, setFunctionId] = useState('');

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });

  const rows = filterByScope(departments.data ?? [], scope, personId).filter(
    (row) => (!hideInactive || row.isActive !== false) && (!functionId || row.functionId === functionId),
  );

  const columns: Column<Department>[] = [
    {
      key: 'name',
      label: 'Department',
      value: (row) => row.name,
      render: (row) => (
        <Link to={`/departments/${row.id}`} className="record-link">
          {row.name}
        </Link>
      ),
    },
    { key: 'code', label: 'Code', width: '100px', value: (row) => row.code },
    {
      key: 'lead',
      label: 'Department lead',
      value: (row) => row.leadName,
      render: (row) => <PersonCell name={row.leadName} personId={row.leadPersonId} me={personId} />,
    },
    {
      key: 'delegate',
      label: 'Delegate',
      value: (row) => row.delegateName,
      render: (row) => <PersonCell name={row.delegateName} personId={row.delegatePersonId} me={personId} />,
    },
    { key: 'function', label: 'Function', value: (row) => row.functionName },
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
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">Departments you lead, support or belong to.</p>
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
    </section>
  );
}
