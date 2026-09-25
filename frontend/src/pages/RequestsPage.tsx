import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { requestsApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import { DEFAULT_REQUEST_PHASE, phaseOrder } from '../constants/phases';
import { formatDate } from '../utils/dates';
import { filterByScope, OwnershipScope, rowClassName } from '../utils/ownership';
import { useAuthStore } from '../store/authStore';
import type { ProjectRequest } from '../types';

const CLOSED_DISPOSITIONS = new Set(['Cancelled', 'Not Endorsed']);

export default function RequestsPage() {
  const user = useAuthStore((state) => state.user);
  const personId = user?.personId;
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(personId ? 'mine' : 'all');
  const [hideClosed, setHideClosed] = useState(true);
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => requestsApi.list() });

  const rows = filterByScope(requests.data ?? [], scope, personId).filter(
    (row) => !hideClosed || (row.phase !== 'Processed' && !CLOSED_DISPOSITIONS.has(row.disposition ?? 'Pending')),
  );

  const columns: Column<ProjectRequest>[] = [
    { key: 'shortTitle', label: 'Short title', value: (row) => row.shortTitle ?? row.title ?? row.name },
    { key: 'spotId', label: 'SPOT ID', width: '120px', value: (row) => row.spotId },
    {
      key: 'phase',
      label: 'Phase',
      value: (row) => row.phase ?? DEFAULT_REQUEST_PHASE,
      sortValue: (row) => phaseOrder(row.phase ?? DEFAULT_REQUEST_PHASE),
      render: (row) => <span className="badge">{row.phase ?? DEFAULT_REQUEST_PHASE}</span>,
    },
    {
      key: 'submitted',
      label: 'Submitted',
      value: (row) => row.submittedOn ?? '',
      render: (row) => (row.submittedOn ? formatDate(row.submittedOn) : '—'),
    },
    {
      key: 'prioritization',
      label: 'Prioritization',
      value: (row) => row.prioritizationComplete ? 'Complete' : 'Needs assessment',
      render: (row) => row.sponsorPersonId?.toLowerCase() === personId?.toLowerCase() && !row.prioritizationComplete
        ? <Link className="table-action-link" to={`/prioritization?requestId=${row.id}`}>Prioritize</Link>
        : row.prioritizationComplete ? 'Complete' : '—',
    },
  ];

  return (
    <section className="accent-section accent-requests">
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Requests you submitted or support, and where each sits in the process.</p>
        </div>
        <Link to="/capture">
          <button className="primary">+ New request</button>
        </Link>
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search requests…"
        scope={{ value: scope, onChange: setScope, disabled: !personId }}
        toggles={[{ label: 'Hide closed', checked: hideClosed, onChange: setHideClosed }]}
      />
      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.id}
          getRowClassName={(row) => rowClassName(row, personId)}
          search={search}
          initialSortKey="shortTitle"
          isLoading={requests.isLoading}
          emptyMessage="No requests match the current filters."
        />
      </div>
    </section>
  );
}
