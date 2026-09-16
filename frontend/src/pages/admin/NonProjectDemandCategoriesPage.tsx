import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, nonProjectDemandApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import DataTable, { Column } from '../../components/admin/DataTable';
import ListToolbar from '../../components/admin/ListToolbar';
import type { NonProjectDemandCategory } from '../../types';

export default function NonProjectDemandCategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(true);
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const categories = useQuery({
    queryKey: ['non-project-demand-categories'],
    queryFn: nonProjectDemandApi.categories,
  });
  const subcategories = useQuery({
    queryKey: ['non-project-demand-subcategories'],
    queryFn: () => nonProjectDemandApi.subcategories(),
  });

  const createCategory = useMutation({
    mutationFn: (name: string) => nonProjectDemandApi.createCategory(name),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-categories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { isActive?: boolean } }) =>
      nonProjectDemandApi.updateCategory(id, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-categories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const createSubcategory = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      nonProjectDemandApi.createSubcategory({ categoryId, name }),
    onSuccess: (_result, variables) => {
      setError(null);
      setSubcategoryDrafts((current) => ({ ...current, [variables.categoryId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-subcategories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const updateSubcategory = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      nonProjectDemandApi.updateSubcategory(id, { isActive }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-subcategories'] });
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
  const columns: Column<NonProjectDemandCategory>[] = [
    { key: 'name', label: 'Category', value: (category) => category.name },
    {
      key: 'subcategories',
      label: 'Subcategories',
      value: (category) =>
        (subcategories.data ?? [])
          .filter((subcategory) => subcategory.categoryId === category.id)
          .map((subcategory) => subcategory.name)
          .join(' '),
      render: (category) => {
        const categorySubcategories = (subcategories.data ?? []).filter(
          (subcategory) => subcategory.categoryId === category.id && (!hideInactive || subcategory.isActive),
        );
        const draft = subcategoryDrafts[category.id] ?? '';
        return (
          <div className="category-subcategories-editor">
            <div className="subcategory-list">
              {categorySubcategories.map((subcategory) => (
                <span key={subcategory.id} className={subcategory.isActive ? 'subcategory-chip' : 'subcategory-chip inactive'}>
                  {subcategory.name}
                  <button
                    type="button"
                    aria-label={`${subcategory.isActive ? 'Deactivate' : 'Reactivate'} ${subcategory.name}`}
                    title={`${subcategory.isActive ? 'Deactivate' : 'Reactivate'} ${subcategory.name}`}
                    disabled={updateSubcategory.isPending}
                    onClick={() => updateSubcategory.mutate({ id: subcategory.id, isActive: !subcategory.isActive })}
                  >
                    {subcategory.isActive ? '×' : '↻'}
                  </button>
                </span>
              ))}
            </div>
            <div className="subcategory-add-row">
              <input
                value={draft}
                maxLength={200}
                aria-label={`New subcategory for ${category.name}`}
                placeholder="New subcategory"
                onChange={(event) =>
                  setSubcategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  if (draft.trim()) createSubcategory.mutate({ categoryId: category.id, name: draft.trim() });
                }}
              />
              <button
                type="button"
                disabled={createSubcategory.isPending || !draft.trim()}
                onClick={() => createSubcategory.mutate({ categoryId: category.id, name: draft.trim() })}
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
      render: (category) => (
        <button
          type="button"
          className={category.isActive ? 'danger' : 'primary'}
          disabled={updateCategory.isPending}
          onClick={() => updateCategory.mutate({ id: category.id, body: { isActive: !category.isActive } })}
        >
          {category.isActive ? 'Deactivate' : 'Reactivate'}
        </button>
      ),
    },
  ];

  return (
    <AccentSection
      accent="projects"
      title="Non-project demand categories"
      subtitle="Categories available when department leads assign work outside a project."
    >
      {error && <div className="alert error">{error}</div>}
      {(categories.isError || subcategories.isError) && (
        <div className="alert error">{errorMessage(categories.error ?? subcategories.error)}</div>
      )}
      <form className="toolbar" onSubmit={submit}>
        <div style={{ flex: '1 1 320px' }}>
          <label htmlFor="categoryName">Category name</label>
          <input id="categoryName" name="name" maxLength={200} required />
        </div>
        <button type="submit" className="primary" disabled={createCategory.isPending}>
          {createCategory.isPending ? 'Adding…' : 'Add category'}
        </button>
      </form>
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
          isLoading={categories.isLoading || subcategories.isLoading}
          emptyMessage="No non-project demand categories match the current filters."
        />
      </div>
    </AccentSection>
  );
}