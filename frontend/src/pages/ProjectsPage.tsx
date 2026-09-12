import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import PersonCell from '../components/admin/PersonCell';
import RowLegend from '../components/admin/RowLegend';
import { useAuthStore } from '../store/authStore';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { canEditProject } from '../utils/permissions';
import { formatDate } from '../utils/dates';
import type { Project } from '../types';

export default function ProjectsPage() {
  const user = useAuthStore((state) => state.user);
  const personId = user?.personId;
  const canCreate = Boolean(user?.roles.some((role) => role === 'admin' || role === 'demand_moderator'));
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(personId ? 'mine' : 'all');
  const [hideInactive, setHideInactive] = useState(true);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });

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
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Projects you manage, sponsor or support.</p>
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
    </section>
  );
}
