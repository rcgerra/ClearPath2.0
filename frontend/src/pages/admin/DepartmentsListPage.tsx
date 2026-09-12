import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { departmentsApi, lookupsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import PersonCell from '../../components/admin/PersonCell';
import RowLegend from '../../components/admin/RowLegend';
import { useAuthStore } from '../../store/authStore';
import { rowClassName } from '../../utils/ownership';
import { formatDate } from '../../utils/dates';
import type { Department } from '../../types';

export default function DepartmentsListPage() {
  const personId = useAuthStore((state) => state.user?.personId);
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const [functionId, setFunctionId] = useState('');
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });

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
      render: (row) => <PersonCell name={row.leadName} personId={row.leadPersonId} me={personId} />,
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
