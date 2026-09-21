import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { requestsApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import { DEFAULT_REQUEST_PHASE, phaseOrder } from '../constants/phases';
import { formatDate } from '../utils/dates';
import type { ProjectRequest } from '../types';

export default function RequestsPage() {
  const [search, setSearch] = useState('');
  const requests = useQuery({ queryKey: ['requests', 'mine'], queryFn: () => requestsApi.list({ mine: true }) });

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
  ];

  return (
    <>
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">My requests</h1>
          <p className="page-subtitle">Everything you have submitted, and where it sits in the process.</p>
        </div>
        <Link to="/capture">
          <button className="primary">+ New request</button>
        </Link>
      </div>

      <ListToolbar search={search} onSearch={setSearch} placeholder="Search my requests…" />
      <div className="card table-card">
        <DataTable
          rows={requests.data ?? []}
          columns={columns}
          getRowKey={(row) => row.id}
          search={search}
          initialSortKey="shortTitle"
          isLoading={requests.isLoading}
          emptyMessage="You have not submitted any requests yet."
        />
      </div>
    </>
  );
}
