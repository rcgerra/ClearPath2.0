import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, peopleApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import RoleMatrix, { ROLE_LABELS } from '../../components/admin/RoleMatrix';
import type { Person, Role } from '../../types';

const ROLE_OPTIONS = ROLE_LABELS;

function parseRoles(raw?: string): Role[] {
  return String(raw ?? '')
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((value): value is Role => ROLE_OPTIONS.some((option) => option.value === value));
}

export default function AccessListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const [draft, setDraft] = useState<Record<string, Role[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });

  const save = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: Role[] }) => peopleApi.setRoles(id, roles),
    onSuccess: (_result, variables) => {
      setSaved(variables.id);
      setDraft((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const rows = (people.data ?? []).filter((row) => !hideInactive || row.isActive !== false);

  const rolesFor = (person: Person): Role[] => draft[person.id] ?? parseRoles(person.role);

  function toggleRole(person: Person, role: Role, checked: boolean) {
    const current = rolesFor(person);
    const next = checked ? [...current, role] : current.filter((entry) => entry !== role);
    setDraft((prev) => ({ ...prev, [person.id]: next }));
    setSaved(null);
  }

  const columns: Column<Person>[] = [
    {
      key: 'name',
      label: 'Name',
      value: (row) => row.name,
      render: (row) => (
        <>
          <strong>{row.name}</strong>
          <div className="muted" style={{ fontSize: '0.78rem' }}>
            {row.email ?? 'No email'}
          </div>
        </>
      ),
    },
    { key: 'department', label: 'Department', value: (row) => row.departmentName },
    ...ROLE_OPTIONS.map<Column<Person>>((option) => ({
      key: option.value,
      label: option.label,
      width: '110px',
      value: (row) => (rolesFor(row).includes(option.value) ? 'yes' : 'no'),
      render: (row) => (
        <input
          type="checkbox"
          className="role-check"
          checked={rolesFor(row).includes(option.value)}
          onChange={(event) => toggleRole(row, option.value, event.target.checked)}
          aria-label={`${option.label} for ${row.name}`}
        />
      ),
    })),
    {
      key: 'actions',
      label: 'Apply',
      sortable: false,
      width: '110px',
      value: () => '',
      render: (row) =>
        draft[row.id] ? (
          <button
            className="accent-button"
            onClick={() => save.mutate({ id: row.id, roles: draft[row.id] })}
            disabled={save.isPending}
          >
            Save
          </button>
        ) : (
          <span className="muted">{saved === row.id ? 'Saved' : '—'}</span>
        ),
    },
  ];

  return (
    <AccentSection
      accent="access"
      title="Security roles"
      subtitle="Grant application access. Roles are stored on each person's _People record."
    >
      {error && <div className="alert error">{error}</div>}

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

      <RoleMatrix />
    </AccentSection>
  );
}
