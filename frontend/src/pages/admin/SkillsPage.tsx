import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, skillsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import { useAuthStore } from '../../store/authStore';
import { isAdmin as isAdminUser } from '../../utils/permissions';
import type { SkillCategory } from '../../types';

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const canManageCategories = isAdminUser(useAuthStore((state) => state.user));
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const categories = useQuery({ queryKey: ['skill-categories'], queryFn: skillsApi.categories });
  const skills = useQuery({ queryKey: ['skills'], queryFn: () => skillsApi.list() });

  const createCategory = useMutation({
    mutationFn: (name: string) => skillsApi.createCategory(name),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['skill-categories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { isActive?: boolean } }) => skillsApi.updateCategory(id, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['skill-categories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const createSkill = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) => skillsApi.create({ categoryId, name }),
    onSuccess: (_result, variables) => {
      setError(null);
      setSkillDrafts((current) => ({ ...current, [variables.categoryId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const updateSkill = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => skillsApi.update(id, { isActive }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') || '').trim();
    if (!name) return;
    createCategory.mutate(name, { onSuccess: () => form.reset() });
  }

  const rows = (categories.data ?? []).filter((category) => !hideInactive || category.isActive);
  const columns: Column<SkillCategory>[] = [
    { key: 'name', label: 'Category', value: (category) => category.name },
    {
      key: 'skills',
      label: 'Skills',
      value: (category) =>
        (skills.data ?? [])
          .filter((skill) => skill.categoryId === category.id)
          .map((skill) => skill.name)
          .join(' '),
      render: (category) => {
        const categorySkills = (skills.data ?? []).filter(
          (skill) => skill.categoryId === category.id && (!hideInactive || skill.isActive),
        );
        const draft = skillDrafts[category.id] ?? '';
        return (
          <div className="category-subcategories-editor">
            <div className="subcategory-list">
              {categorySkills.map((skill) => (
                <span key={skill.id} className={skill.isActive ? 'subcategory-chip' : 'subcategory-chip inactive'}>
                  {skill.name}
                  {canManageCategories && (
                    <button
                      type="button"
                      aria-label={`${skill.isActive ? 'Deactivate' : 'Reactivate'} ${skill.name}`}
                      title={`${skill.isActive ? 'Deactivate' : 'Reactivate'} ${skill.name}`}
                      disabled={updateSkill.isPending}
                      onClick={() => updateSkill.mutate({ id: skill.id, isActive: !skill.isActive })}
                    >
                      {skill.isActive ? '×' : '↻'}
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="subcategory-add-row">
              <input
                value={draft}
                maxLength={200}
                aria-label={`New skill for ${category.name}`}
                placeholder="New skill"
                onChange={(event) => setSkillDrafts((current) => ({ ...current, [category.id]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  if (draft.trim()) createSkill.mutate({ categoryId: category.id, name: draft.trim() });
                }}
              />
              <button
                type="button"
                disabled={createSkill.isPending || !draft.trim()}
                onClick={() => createSkill.mutate({ categoryId: category.id, name: draft.trim() })}
              >
                Add
              </button>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      value: (category) => (category.isActive ? 'Active' : 'Inactive'),
      render: (category) => (
        <span className={`badge ${category.isActive ? 'success' : ''}`}>{category.isActive ? 'Active' : 'Inactive'}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      width: '120px',
      value: () => '',
      render: (category) =>
        canManageCategories ? (
          <button
            type="button"
            className={category.isActive ? 'danger' : 'primary'}
            disabled={updateCategory.isPending}
            onClick={() => updateCategory.mutate({ id: category.id, body: { isActive: !category.isActive } })}
          >
            {category.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        ) : null,
    },
  ];

  return (
    <AccentSection accent="people" title="Skills" subtitle="Skill categories people can select from to build their profile.">
      {error && <div className="alert error">{error}</div>}
      {(categories.isError || skills.isError) && <div className="alert error">{errorMessage(categories.error ?? skills.error)}</div>}
      {canManageCategories && (
        <form className="toolbar" onSubmit={submit}>
          <div style={{ flex: '1 1 320px' }}>
            <label htmlFor="categoryName">Category name</label>
            <input id="categoryName" name="name" maxLength={200} required />
          </div>
          <button type="submit" className="primary" disabled={createCategory.isPending}>
            {createCategory.isPending ? 'Adding…' : 'Add category'}
          </button>
        </form>
      )}
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search categories…"
        toggles={[{ label: 'Hide inactive', checked: hideInactive, onChange: setHideInactive }]}
      />
      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(category) => category.id}
          search={search}
          initialSortKey="name"
          isLoading={categories.isLoading || skills.isLoading}
          emptyMessage="No skill categories match the current filters."
        />
      </div>
    </AccentSection>
  );
}
