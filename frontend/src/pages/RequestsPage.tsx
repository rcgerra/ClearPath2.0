import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { requestsApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import { phaseLabel, phaseOrder, workflowStageIndex } from '../constants/phases';
import { formatDate } from '../utils/dates';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { useAuthStore } from '../store/authStore';
import type { ProjectRequest } from '../types';

function isOpenOpportunity(row: ProjectRequest): boolean {
  return row.disposition?.trim().toLowerCase() !== 'cancelled' && workflowStageIndex(row.phase) !== 6;
}

export default function RequestsPage() {
  const user = useAuthStore((state) => state.user);
  const personId = user?.personId;
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(personId ? 'mine' : 'all');
  const [hideClosed, setHideClosed] = useState(true);
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => requestsApi.list() });

  const rows = filterByScope(requests.data ?? [], scope, personId).filter(
    (row) => !hideClosed || isOpenOpportunity(row),
  );

  const columns: Column<ProjectRequest>[] = [
    {
      key: 'shortTitle', label: 'Short title', value: (row) => row.shortTitle ?? row.title ?? row.name,
      render: (row) => <Link className="record-link" to={`/requests/${row.id}`}>{row.shortTitle ?? row.title ?? row.name}</Link>,
    },
    { key: 'spotId', label: 'SPOT ID', width: '120px', value: (row) => row.spotId },
    { key: 'requesterName', label: 'Submitted By', value: (row) => row.requesterName },
    {
      key: 'submitted',
      label: 'Submitted On',
      width: '112px',
      value: (row) => row.submittedOn ?? '',
      render: (row) => (row.submittedOn ? formatDate(row.submittedOn) : '—'),
    },
    {
      key: 'phase',
      label: 'Phase',
      value: (row) => phaseLabel(row.phase),
      sortValue: (row) => phaseOrder(row.phase),
      render: (row) => <span className="badge">{phaseLabel(row.phase)}</span>,
    },
  ];

  return (
    <section className="accent-section accent-requests requests-page">
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">{scope === 'mine' ? 'My' : 'All'} {hideClosed ? 'Open ' : ''}Opportunities</h1>
          <p className="page-subtitle">Spot a problem or opportunity that points to an unmet business need? Share it and help shape what comes next.</p>
        </div>
        <Link to="/capture">
          <button className="primary">+ Share an opportunity</button>
        </Link>
      </div>

      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.id}
          getRowClassName={(row) => rowClassName({ ...row, isActive: isOpenOpportunity(row) }, personId)}
          search={search}
          initialSortKey="shortTitle"
          isLoading={requests.isLoading}
          emptyMessage="No opportunities match the current filters."
        />
      </div>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search opportunities…"
        scope={{ value: scope, onChange: setScope, disabled: !personId }}
        toggles={[{ label: 'Hide closed', checked: hideClosed, onChange: setHideClosed }]}
      />
    </section>
  );
}
