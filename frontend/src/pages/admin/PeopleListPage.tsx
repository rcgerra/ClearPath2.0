import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { peopleApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import type { Person } from '../../types';

export default function PeopleListPage() {
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });

  const rows = (people.data ?? []).filter((row) => !hideInactive || row.isActive !== false);

  const columns: Column<Person>[] = [
    {
      key: 'name',
      label: 'Name',
      value: (row) => row.name,
      render: (row) => (
        <Link to={`/admin/people/${row.id}`} className="record-link">
          {row.name}
        </Link>
      ),
    },
    { key: 'department', label: 'Department', value: (row) => row.departmentName },
    {
      key: 'employmentType',
      label: 'Employment type',
      value: (row) => row.employmentType,
      render: (row) => (
        <span className={`badge${row.employmentType?.toLowerCase() === 'contractor' ? ' warn' : ''}`}>
          {row.employmentType ?? 'Unspecified'}
        </span>
      ),
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
