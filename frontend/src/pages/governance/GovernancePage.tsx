import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { governanceApi, lookupsApi } from '../../api/client';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import { formatDate } from '../../utils/dates';
import { filterByScope, OwnershipScope, rowClassName } from '../../utils/ownership';
import { useAuthStore } from '../../store/authStore';
import { GOVERNANCE_COMPLETE_PHASE, GOVERNANCE_STAGE_VIEWS, type GovernanceItem } from '../../types';

export function isGovernanceComplete(item: GovernanceItem): boolean {
  return item.phase === GOVERNANCE_COMPLETE_PHASE || Boolean(item.cancelled);
}

export function stageLabel(phase?: string): string {
  return GOVERNANCE_STAGE_VIEWS.find((view) => view.stage === phase)?.label
    ?? (phase === GOVERNANCE_COMPLETE_PHASE ? 'Completed' : phase ?? '—');
}

export function GovernanceTabs() {
  const items = useQuery({ queryKey: ['governance'], queryFn: governanceApi.list });
  const open = (items.data ?? []).filter((item) => !isGovernanceComplete(item));

  return (
    <nav className="governance-tabs" aria-label="Governance views">
      <NavLink to="/governance" end className={({ isActive }) => (isActive ? 'active' : '')}>
        All items<span className="governance-tab-count">{open.length}</span>
      </NavLink>
      {GOVERNANCE_STAGE_VIEWS.map((view) => (
        <NavLink key={view.slug} to={`/governance/${view.slug}`} className={({ isActive }) => (isActive ? 'active' : '')}>
          {view.label}
          <span className="governance-tab-count">{open.filter((item) => item.phase === view.stage).length}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function GovernancePage() {
  const { stage: stageSlug } = useParams();
  const view = GOVERNANCE_STAGE_VIEWS.find((entry) => entry.slug === stageSlug);
  const personId = useAuthStore((state) => state.user?.personId);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>('all');
  const [showCompleted, setShowCompleted] = useState(false);

  const items = useQuery({ queryKey: ['governance'], queryFn: governanceApi.list });
  const programs = useQuery({ queryKey: ['lookups', 'programs'], queryFn: () => lookupsApi.list('programs') });
  const programNames = useMemo(
    () => new Map((programs.data ?? []).map((program) => [program.id.toLowerCase(), program.name])),
    [programs.data],
  );

  const rows = useMemo(() => {
    const all = items.data ?? [];
    const staged = view ? all.filter((item) => item.phase === view.stage) : all;
    const scoped = filterByScope(staged, scope, personId);
    return view ? scoped.filter((item) => !item.cancelled || showCompleted) : scoped.filter((item) => showCompleted || !isGovernanceComplete(item));
  }, [items.data, personId, scope, showCompleted, view]);

  const hiddenColumns: Record<string, string[]> = {
    'dq-check': ['stage', 'spotId', 'program', 'projectType', 'disposition'],
    pirt: ['stage', 'spotId', 'disposition'],
    sg1: ['stage'],
    creation: ['stage'],
  };

  const allColumns: Column<GovernanceItem>[] = [
    {
      key: 'shortTitle',
      label: 'Short title',
      width: '50%',
      value: (row) => row.shortTitle ?? row.title,
      render: (row) => (
        <Link className="record-link" to={`/governance/item/${row.id}`}>{row.shortTitle ?? row.title ?? 'Untitled'}</Link>
      ),
    },
    { key: 'spotId', label: 'SPOT ID', width: '110px', value: (row) => row.spotId },
    {
      key: 'stage',
      label: 'Stage',
      width: '160px',
      value: (row) => stageLabel(row.phase),
      render: (row) => (
        <span className={`badge governance-stage-badge${row.cancelled ? ' governance-stage-cancelled' : ''}`}>
          {row.cancelled ? 'Cancelled' : stageLabel(row.phase)}
        </span>
      ),
    },
    { key: 'program', label: 'Program', value: (row) => (row.programId ? programNames.get(row.programId.toLowerCase()) ?? '—' : '—') },
    { key: 'projectType', label: 'Project type', value: (row) => row.projectType ?? '—' },
    { key: 'disposition', label: 'Disposition', width: '130px', value: (row) => row.disposition ?? '—' },
    { key: 'requesterName', label: 'Submitted by', value: (row) => row.requesterName },
    {
      key: 'submitted',
      label: 'Submitted on',
      width: '120px',
      value: (row) => row.submittedOn ?? '',
      render: (row) => (row.submittedOn ? formatDate(row.submittedOn) : '—'),
    },
  ];
  const hidden = hiddenColumns[stageSlug ?? ''] ?? [];
  const columns = allColumns.filter((column) => !hidden.includes(column.key));

  return (
    <section className="accent-section accent-governance governance-page">
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">{view ? view.label : 'Governance'}</h1>
          <p className="page-subtitle">
            {view ? view.blurb : 'Every opportunity in the governance pipeline, from DQ Check through project creation.'}
          </p>
        </div>
      </div>

      <GovernanceTabs />

      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row.id}
          getRowClassName={(row) => rowClassName({ ...row, isActive: !isGovernanceComplete(row) }, personId)}
          search={search}
          initialSortKey="shortTitle"
          isLoading={items.isLoading}
          emptyMessage="No governance items match the current filters."
        />
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search governance items…"
        scope={{ value: scope, onChange: setScope, disabled: !personId }}
        toggles={[{ label: 'Show completed', checked: showCompleted, onChange: setShowCompleted }]}
      />
    </section>
  );
}
