import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, nonProjectDemandApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { weekLabel, weekLabelShort, weekYear, MAX_POSITIONS } from '../utils/arrayParser';
import type { NonProjectDemandRow } from '../types';

const DEFAULT_WEEKS = 52;
const MAX_HOURS = 60;

function sumArrays(rows: number[][], weeks: number): number[] {
  const total = new Array(weeks).fill(0);
  for (const row of rows) {
    for (let index = 0; index < weeks; index += 1) total[index] += row[index] ?? 0;
  }
  return total;
}

/** Availability is whole hours only — block minus/plus/decimal/exponent keys before they're typed. */
function blockNonIntegerKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (['-', '+', '.', 'e', 'E'].includes(event.key)) event.preventDefault();
}

export default function OtherWorkPage() {
  const personId = useAuthStore((state) => state.user?.personId);
  const queryClient = useQueryClient();
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [draftDemand, setDraftDemand] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [hideZeroRows, setHideZeroRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nonProjectDemand = useQuery({
    queryKey: ['non-project-demand', 'mine', personId],
    queryFn: () => nonProjectDemandApi.list({ personId }),
    enabled: Boolean(personId),
  });
  const nonProjectCategories = useQuery({
    queryKey: ['non-project-demand-categories'],
    queryFn: () => nonProjectDemandApi.categories(),
  });
  const nonProjectSubcategories = useQuery({
    queryKey: ['non-project-demand-subcategories'],
    queryFn: () => nonProjectDemandApi.subcategories(),
  });

  const addDemand = useMutation({
    mutationFn: async (body: { categoryId: string; subcategoryId?: string; newSubcategoryName?: string; description: string }) => {
      let subcategoryId = body.subcategoryId;
      if (body.newSubcategoryName) {
        subcategoryId = (await nonProjectDemandApi.createSubcategory({
          categoryId: body.categoryId,
          name: body.newSubcategoryName,
        })).id;
      }
      if (!subcategoryId) throw new Error('Select a subcategory or add a new one.');
      return nonProjectDemandApi.create({ subcategoryId, personId: personId!, description: body.description });
    },
    onSuccess: () => {
      setAdding(false);
      setCategoryId('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['non-project-demand', 'mine', personId] });
      queryClient.invalidateQueries({ queryKey: ['non-project-demand-subcategories'] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const setWeekMutation = useMutation({
    mutationFn: ({ demandId, week, hours }: { demandId: string; week: number; hours: number }) =>
      nonProjectDemandApi.setWeeks(demandId, { week, hours }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<NonProjectDemandRow[]>(['non-project-demand', 'mine', personId], (current) =>
        current?.map((row) =>
          row.id === variables.demandId
            ? { ...row, weeks: row.weeks.map((value, index) => (index === variables.week ? variables.hours : value)) }
            : row,
        ),
      );
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  function commit(demandId: string, currentHours: number, week: number, raw: string) {
    const key = `${demandId}:${week}`;
    setDraftDemand((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const hours = Math.max(0, Math.min(MAX_HOURS, Math.round(Number(raw) || 0)));
    if (hours !== currentHours) setWeekMutation.mutate({ demandId, week, hours });
  }

  const rows = useMemo(
    () =>
      (nonProjectDemand.data ?? [])
        .slice()
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || (a.subcategoryName ?? '').localeCompare(b.subcategoryName ?? '')),
    [nonProjectDemand.data],
  );

  const availableCategories = useMemo(
    () => (nonProjectCategories.data ?? []).filter((category) => category.isActive),
    [nonProjectCategories.data],
  );

  const availableSubcategories = useMemo(
    () => (nonProjectSubcategories.data ?? []).filter((subcategory) => subcategory.isActive && subcategory.categoryId === categoryId),
    [nonProjectSubcategories.data, categoryId],
  );

  const groups = useMemo(() => {
    return availableCategories
      .map((category) => {
        const assignedRows = rows.filter((row) => row.categoryId === category.id);
        const items = assignedRows
          .map((row) => ({ id: row.id, name: row.subcategoryName ?? 'General', description: row.description ?? '', demand: row }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
        const total = sumArrays(assignedRows.map((row) => row.weeks), weeks);
        return { ...category, rows: items, total };
      })
      .filter((category) => category.rows.length > 0);
  }, [availableCategories, rows, weeks]);

  const visibleGroups = useMemo(() => {
    if (!hideZeroRows) return groups;
    return groups
      .map((category) => ({
        ...category,
        rows: category.rows.filter((row) => row.demand.weeks.slice(0, weeks).some((hours) => hours > 0)),
      }))
      .filter((category) => category.rows.length > 0);
  }, [groups, hideZeroRows, weeks]);

  const total = useMemo(() => sumArrays(rows.map((row) => row.weeks), weeks), [rows, weeks]);
  const chartColumns = useMemo(() => Array.from({ length: weeks }, (_, index) => index), [weeks]);

  const metrics = useMemo(() => {
    const totalHours = total.reduce((sum, value) => sum + value, 0);
    const activeCategories = new Set(rows.filter((row) => row.weeks.slice(0, weeks).some((hours) => hours > 0)).map((row) => row.categoryId));
    return { totalHours, categoryCount: activeCategories.size };
  }, [total, rows, weeks]);

  if (!personId) {
    return (
      <div className="card">
        <h2>No person record linked</h2>
        <p className="muted">
          Your directory account is not linked to a _People record yet. Ask an administrator to run the user sync.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="my-work-header-row">
        <div>
          <h1 className="page-title">Other work</h1>
          <p className="page-subtitle">Non-project demand — operational, administrative and support work.</p>
        </div>
        <div className="department-header-kpis" aria-label="Other work KPIs">
          <div className="department-header-kpi">
            <span className="value">{metrics.categoryCount}</span>
            <span className="label">Active categories</span>
          </div>
          <div className="department-header-kpi">
            <span className="value">{metrics.totalHours}</span>
            <span className="label">Total hours</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar my-workload-header">
          <h2 style={{ margin: 0, flex: 1 }}>Other demand</h2>
          <div className="weeks-lookahead-control">
            <label htmlFor="weeks">Weeks to look ahead</label>
            <input
              id="weeks"
              type="number"
              min={1}
              max={MAX_POSITIONS}
              value={weeks}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setWeeks(Math.min(MAX_POSITIONS, Math.max(1, Math.round(next))));
              }}
            />
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}
        {(nonProjectDemand.isError || nonProjectCategories.isError || nonProjectSubcategories.isError) && (
          <div className="alert error">
            Other demand is unavailable: {errorMessage(nonProjectDemand.error ?? nonProjectCategories.error ?? nonProjectSubcategories.error)}
          </div>
        )}

        <div className="demand-section-toolbar">
          <h3 className="demand-section-title">My other demand</h3>
          <button
            type="button"
            className="icon-button icon-button-add icon-button-add-labeled person-detail-action my-work-action"
            title="Add assignment"
            aria-label="Add assignment"
            onClick={() => setAdding((value) => !value)}
          >
            <span aria-hidden="true">+</span>
            <span>Add assignment</span>
          </button>
          <label className="switch demand-zero-toggle" title="Hide rows with zero demand">
            <input type="checkbox" checked={hideZeroRows} onChange={(event) => setHideZeroRows(event.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Hide zero rows</span>
          </label>
        </div>

        {adding && (
          <form
            className="toolbar assignment-picker non-project-demand-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const submittedCategoryId = String(form.get('categoryId') || '');
              const subcategoryId = String(form.get('subcategoryId') || '');
              const newSubcategoryName = String(form.get('newSubcategoryName') || '').trim();
              const description = String(form.get('description') || '').trim();
              if (!submittedCategoryId) return;
              if (!subcategoryId && !newSubcategoryName) {
                setError('Select a subcategory or add a new one.');
                return;
              }
              if (!description) {
                setError('Describe the task briefly.');
                return;
              }
              addDemand.mutate({
                categoryId: submittedCategoryId,
                subcategoryId: subcategoryId || undefined,
                newSubcategoryName: newSubcategoryName || undefined,
                description,
              });
            }}
          >
            <div>
              <label htmlFor="categoryId">Category</label>
              <select id="categoryId" name="categoryId" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="" disabled>
                  {nonProjectCategories.isLoading ? 'Loading categories…' : 'Select…'}
                </option>
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="subcategoryId">Subcategory</label>
              <select id="subcategoryId" name="subcategoryId" defaultValue="" disabled={!categoryId}>
                <option value="">Select existing…</option>
                {availableSubcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="newSubcategoryName">Or add a new subcategory</label>
              <input id="newSubcategoryName" name="newSubcategoryName" maxLength={200} disabled={!categoryId} />
            </div>
            <div>
              <label htmlFor="description">Description</label>
              <input id="description" name="description" maxLength={200} required placeholder="e.g. Work order #12345" disabled={!categoryId} />
            </div>
            <button className="primary non-project-demand-action" type="submit" disabled={addDemand.isPending || !categoryId}>
              {addDemand.isPending ? 'Submitting…' : 'Submit'}
            </button>
            <button type="button" onClick={() => setAdding(false)}>Cancel</button>
          </form>
        )}

        <div className="matrix-scroll">
          <table className="weekly-matrix demand-grid department-person-matrix">
            <thead>
              <tr>
                <th className="matrix-label" aria-hidden="true" />
                {chartColumns.map((week) => (
                  <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
                    {weekLabelShort(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleGroups.length === 0 && (
                <tr className="no-demand-notice-row">
                  <td colSpan={chartColumns.length + 1}>You have no other demand assigned over the selected period.</td>
                </tr>
              )}
              {visibleGroups.map((category, categoryIndex) => (
                <Fragment key={category.id}>
                  <tr className={`non-project-category-row ${categoryIndex % 2 === 0 ? 'category-band-70' : 'category-band-60'}`}>
                    <th scope="row" className="matrix-label">{category.name}</th>
                    {chartColumns.map((week) => <td key={week}>{category.total[week] || ''}</td>)}
                  </tr>
                  {category.rows.map((subcategory, rowIndex) => (
                    <tr key={subcategory.id} className={`assignment-row non-project-demand-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}`}>
                      <th scope="row" className="matrix-label">
                        {subcategory.name}
                        {subcategory.description && <span className="non-project-demand-description"> — {subcategory.description}</span>}
                      </th>
                      {chartColumns.map((week) => {
                        const demandRow = subcategory.demand;
                        const key = `${demandRow?.id ?? subcategory.id}:${week}`;
                        const currentHours = demandRow?.weeks[week] ?? 0;
                        const value = demandRow ? draftDemand[key] ?? (currentHours ? String(currentHours) : '') : '';
                        return (
                          <td key={week} className="assignment-demand-cell">
                            <input
                              type="number"
                              min={0}
                              max={MAX_HOURS}
                              step={1}
                              value={value}
                              placeholder="0"
                              readOnly={!demandRow}
                              onChange={(event) => setDraftDemand((prev) => ({ ...prev, [key]: event.target.value }))}
                              onFocus={(event) => event.target.select()}
                              onBlur={(event) => {
                                if (demandRow) commit(demandRow.id, currentHours, week, event.target.value);
                              }}
                              onKeyDown={blockNonIntegerKeys}
                              aria-label={`${category.name}, ${subcategory.name}, week of ${weekLabel(week)}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="non-project-demand-section-row non-project-demand-total-row">
                <th scope="row" className="matrix-label">Total</th>
                {chartColumns.map((week) => <td key={week}>{total[week] || ''}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
