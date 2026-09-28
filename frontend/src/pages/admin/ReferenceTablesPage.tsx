import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { errorMessage, lookupsApi, peopleApi } from '../../api/client';
import AccentSection, { type AccentName } from '../../components/admin/AccentSection';
import DataTable, { type Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import type { Lookup } from '../../types';

const TABLES: Array<{ key: 'functions' | 'locations' | 'programs' | 'sites'; label: string; accent: AccentName }> = [
  { key: 'functions', label: 'Functions', accent: 'departments' },
  { key: 'locations', label: 'Locations', accent: 'requests' },
  { key: 'programs', label: 'Programs', accent: 'projects' },
  { key: 'sites', label: 'Sites', accent: 'people' },
];

export default function ReferenceTablesPage() {
  const { table } = useParams();
  const current = TABLES.find((entry) => entry.key === table);
  const tableKey = current?.key ?? 'locations';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Omit<Lookup, 'id'>>({ name: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const records = useQuery({ queryKey: ['lookups', tableKey], queryFn: () => lookupsApi.list(tableKey), enabled: Boolean(current) });
  const sites = useQuery({ queryKey: ['lookups', 'sites'], queryFn: () => lookupsApi.list('sites'), enabled: tableKey === 'locations' || tableKey === 'functions' });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list(), enabled: tableKey !== 'locations' });

  useEffect(() => {
    setEditingId(null);
    setDraft({ name: '' });
    setSearch('');
    setError(null);
  }, [tableKey]);

  function refresh() {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['lookups', tableKey] });
  }

  const create = useMutation({
    mutationFn: (body: Omit<Lookup, 'id'>) => lookupsApi.create(tableKey, body),
    onSuccess: () => { setDraft({ name: '' }); refresh(); },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<Lookup, 'id'> }) => lookupsApi.update(tableKey, id, body),
    onSuccess: () => { setEditingId(null); setDraft({ name: '' }); refresh(); },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => lookupsApi.remove(tableKey, id),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { ...draft, name: draft.name.trim() };
    if (!body.name) return;
    if (editingId) update.mutate({ id: editingId, body });
    else create.mutate(body);
  }

  const columns: Column<Lookup>[] = [
    { key: 'name', label: 'Name', value: (row) => row.name },
    ...((tableKey === 'locations' || tableKey === 'functions') ? [{
      key: 'site', label: 'Site', value: (row: Lookup) => sites.data?.find((site) => site.id === row.siteId)?.name ?? '—',
    }] : []),
    {
      key: 'actions', label: 'Actions', sortable: false, width: '190px', value: (row) => row.name,
      render: (row) => (
        <div className="row-actions">
          <button type="button" onClick={() => {
            setEditingId(row.id);
            setDraft({ name: row.name, siteId: row.siteId ?? '', leadPersonId: row.leadPersonId ?? '',
              sponsorPersonId: row.sponsorPersonId ?? '', assistantLeadPersonIds: row.assistantLeadPersonIds ?? [],
              missionStatement: row.missionStatement ?? '' });
            setError(null);
          }}>Edit</button>
          <button type="button" className="danger" disabled={remove.isPending} onClick={() => {
            if (window.confirm(`Remove ${row.name}? Existing records may still refer to it.`)) remove.mutate(row.id);
          }}>Remove</button>
        </div>
      ),
    },
  ];

  if (!current) return <Navigate to="/admin/reference/locations" replace />;

  return (
    <AccentSection accent={current.accent} title={current.label} subtitle={`Manage ${current.label.toLowerCase()} used across ClearPath.`}>
      <nav className="prioritization-tabs" aria-label="Reference tables">
        {TABLES.map((entry) => <Link key={entry.key} to={`/admin/reference/${entry.key}`} className={tableKey === entry.key ? 'active' : ''} aria-current={tableKey === entry.key ? 'page' : undefined}>{entry.label}</Link>)}
      </nav>
      {error && <div className="alert error">{error}</div>}
      {records.isError && <div className="alert error">{errorMessage(records.error)}</div>}
      {(sites.isError || people.isError) && <div className="alert error">{errorMessage(sites.error ?? people.error)}</div>}
      <form className="toolbar" onSubmit={saveRecord}>
        <div className="grid cols-2" style={{ width: '100%' }}>
          <div className="field">
            <label htmlFor="reference-name">{editingId ? 'Edit' : 'New'} {current.label.slice(0, -1).toLowerCase()}</label>
            <input id="reference-name" value={draft.name} maxLength={200} required onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
          </div>
          {(tableKey === 'locations' || tableKey === 'functions') && <div className="field">
            <label htmlFor="reference-site">Site</label>
            <select id="reference-site" value={draft.siteId ?? ''} onChange={(event) => setDraft((value) => ({ ...value, siteId: event.target.value }))}>
              <option value="">Unassigned</option>
              {sites.data?.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </div>}
          {tableKey !== 'locations' && <div className="field">
            <label htmlFor="reference-lead">{tableKey === 'programs' ? 'Program lead' : tableKey === 'sites' ? 'Site lead' : 'Function lead'}</label>
            <select id="reference-lead" value={draft.leadPersonId ?? ''} onChange={(event) => setDraft((value) => ({ ...value, leadPersonId: event.target.value }))}>
              <option value="">Unassigned</option>
              {people.data?.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>}
          {tableKey === 'programs' && <div className="field">
            <label htmlFor="reference-sponsor">Program sponsor</label>
            <select id="reference-sponsor" value={draft.sponsorPersonId ?? ''} onChange={(event) => setDraft((value) => ({ ...value, sponsorPersonId: event.target.value }))}>
              <option value="">Unassigned</option>
              {people.data?.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>}
          {(tableKey === 'functions' || tableKey === 'programs') && <div className="field">
            <label htmlFor="reference-assistants">Assistant {tableKey === 'programs' ? 'program' : 'function'} leads</label>
            <select id="reference-assistants" multiple size={4} value={draft.assistantLeadPersonIds ?? []} onChange={(event) => setDraft((value) => ({ ...value,
              assistantLeadPersonIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>
              {people.data?.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>}
          {tableKey === 'programs' && <div className="field">
            <label htmlFor="reference-mission">Mission statement</label>
            <textarea id="reference-mission" maxLength={4000} value={draft.missionStatement ?? ''} onChange={(event) => setDraft((value) => ({ ...value, missionStatement: event.target.value }))} />
          </div>}
        </div>
        <button className="accent-button" type="submit" disabled={create.isPending || update.isPending || !draft.name.trim()}>{editingId ? 'Save' : 'Add'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft({ name: '' }); }}>Cancel</button>}
      </form>
      <div className="card table-card">
        <DataTable rows={records.data ?? []} columns={columns} getRowKey={(row) => row.id} search={search} initialSortKey="name" isLoading={records.isLoading} emptyMessage={`No ${current.label.toLowerCase()} found.`} />
      </div>
      <ListToolbar search={search} onSearch={setSearch} placeholder={`Search ${current.label.toLowerCase()}…`} />
    </AccentSection>
  );
}