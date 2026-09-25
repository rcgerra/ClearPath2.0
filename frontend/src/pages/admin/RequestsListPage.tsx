import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { prioritizationApi, requestsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import PersonCell from '../../components/admin/PersonCell';
import RowLegend from '../../components/admin/RowLegend';
import { DEFAULT_REQUEST_PHASE, phaseOrder } from '../../constants/phases';
import { useAuthStore } from '../../store/authStore';
import { rowClassName } from '../../utils/ownership';
import type { ProjectRequest } from '../../types';

export default function RequestsListPage() {
  const personId = useAuthStore((state) => state.user?.personId);
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => requestsApi.list() });
  const ranking = useQuery({ queryKey: ['ranking'], queryFn: prioritizationApi.ranking });

  const rows = (requests.data ?? []).filter((row) => !hideInactive || row.isActive !== false);
  const scores = new Map((ranking.data ?? []).map((row) => [row.id, row]));

  const columns: Column<ProjectRequest>[] = [
    {
      key: 'shortTitle',
      label: 'Short title',
      value: (row) => row.shortTitle ?? row.title ?? row.name,
      render: (row) => (
        <Link to={`/admin/requests/${row.id}`} className="record-link">
          {row.shortTitle ?? row.title ?? row.name}
        </Link>
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
      key: 'requester',
      label: 'Requested by',
      value: (row) => row.requesterName,
      render: (row) => <PersonCell name={row.requesterName} personId={row.requesterPersonId} me={personId} />,
    },
    {
      key: 'sponsor',
      label: 'Proposed sponsor',
      value: (row) => row.sponsorName,
      render: (row) => <PersonCell name={row.sponsorName} personId={row.sponsorPersonId} me={personId} />,
    },
    {
      key: 'phase',
      label: 'Phase',
      value: (row) => row.phase ?? DEFAULT_REQUEST_PHASE,
      sortValue: (row) => phaseOrder(row.phase ?? DEFAULT_REQUEST_PHASE),
      render: (row) => <span className="badge">{row.phase ?? DEFAULT_REQUEST_PHASE}</span>,
    },
    {
      key: 'disposition',
      label: 'Disposition',
      width: '120px',
      value: (row) => row.disposition ?? 'Pending',
      render: (row) => <span className="badge">{row.disposition ?? 'Pending'}</span>,
    },
    {
      key: 'rawScore',
      label: 'Raw',
      width: '72px',
      value: (row) => scores.get(row.id)?.priorityScore ?? row.priorityScore ?? 0,
      render: (row) => <strong>{Number(scores.get(row.id)?.priorityScore ?? row.priorityScore ?? 0).toFixed(2)}</strong>,
    },
    {
      key: 'impactScore',
      label: 'Impact',
      width: '82px',
      value: (row) => scores.get(row.id)?.impactScore ?? 0,
      render: (row) => <span>{Number(scores.get(row.id)?.impactScore ?? 0).toFixed(2)}</span>,
    },
    {
      key: 'complexityScore',
      label: 'Complexity',
      width: '96px',
      value: (row) => scores.get(row.id)?.complexityScore ?? 0,
      render: (row) => <span>{Number(scores.get(row.id)?.complexityScore ?? 0).toFixed(2)}</span>,
    },
    {
      key: 'edit',
      label: '',
      sortable: false,
      width: '64px',
      value: () => '',
      render: (row) => (
        <Link to={`/admin/requests/${row.id}`} className="icon-button" title="Edit request">
          ✎
        </Link>
      ),
    },
  ];

  return (
    <AccentSection
      accent="requests"
      title="Requests"
      subtitle="Incoming demand waiting to be shaped into projects."
      actions={
        <Link to="/capture">
          <button className="accent-button">+ New request</button>
        </Link>
      }
    >
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search requests or requesters…"
        toggles={[{ label: 'Hide inactive', checked: hideInactive, onChange: setHideInactive }]}
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
      <RowLegend />
    </AccentSection>
  );
}
