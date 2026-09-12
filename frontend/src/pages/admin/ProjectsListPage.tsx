import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import PersonCell from '../../components/admin/PersonCell';
import RowLegend from '../../components/admin/RowLegend';
import { useAuthStore } from '../../store/authStore';
import { rowClassName } from '../../utils/ownership';
import { formatDate } from '../../utils/dates';
import type { Project } from '../../types';

export default function ProjectsListPage() {
  const personId = useAuthStore((state) => state.user?.personId);
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });

  const rows = (projects.data ?? []).filter((row) => !hideInactive || row.isActive !== false);

  const columns: Column<Project>[] = [
    {
      key: 'name',
      label: 'Project name',
      value: (row) => row.name,
      render: (row) => (
        <span className="name-cell">
          <Link to={`/admin/projects/${row.id}`} className="record-link">
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
        <Link to={`/admin/projects/${row.id}`} className="icon-button" title={`Edit ${row.name}`}>
          ✎
        </Link>
      ),
    },
  ];

  return (
    <AccentSection
      accent="projects"
      title="Projects"
      subtitle="Portfolio of active and planned work."
      actions={
        <Link to="/admin/projects/new">
          <button className="accent-button">+ New project</button>
        </Link>
      }
    >
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search projects, managers or sponsors…"
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
          isLoading={projects.isLoading}
          emptyMessage="No projects match the current filters."
        />
      </div>
      <RowLegend />
    </AccentSection>
  );
}
