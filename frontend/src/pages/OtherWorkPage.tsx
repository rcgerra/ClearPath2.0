import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AccentSection from '../components/admin/AccentSection';
import { departmentsApi, nonProjectDemandApi, peopleApi } from '../api/client';
import { MAX_POSITIONS, weekLabelShort, weekYear } from '../utils/arrayParser';

type GroupedDemandRow = {
  id: string;
  personId: string;
  personName: string;
  departmentName: string;
  description?: string;
  weeks: number[];
};

type GroupedSubcategory = {
  id: string;
  name: string;
  total: number[];
  rows: GroupedDemandRow[];
};

type GroupedCategory = {
  id: string;
  name: string;
  total: number[];
  subcategories: GroupedSubcategory[];
};

const DEFAULT_WEEKS = 52;

function emptyWeeks(length: number): number[] {
  return new Array(length).fill(0);
}

function sumArray(source: number[], weeks: number): number[] {
  const total = emptyWeeks(weeks);
  for (let index = 0; index < weeks; index += 1) total[index] += source[index] ?? 0;
  return total;
}

export default function OtherWorkPage() {
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);

  const nonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });
  const allPeople = useQuery({ queryKey: ['people', 'all'], queryFn: () => peopleApi.list() });
  const allDepartments = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list() });

  const groupedDemand = useMemo<GroupedCategory[]>(() => {
    const peopleById = new Map((allPeople.data ?? []).map((person) => [person.id, person]));
    const departmentsById = new Map((allDepartments.data ?? []).map((department) => [department.id, department]));
    const categories = new Map<string, GroupedCategory>();

    for (const row of nonProjectDemand.data ?? []) {
      const person = peopleById.get(row.personId);
      const departmentName = person?.departmentId ? departmentsById.get(person.departmentId)?.name ?? '—' : '—';
      const category = categories.get(row.categoryId) ?? {
        id: row.categoryId,
        name: row.categoryName,
        total: emptyWeeks(weeks),
        subcategories: [],
      };

      const subcategoryKey = row.subcategoryId ?? '__general__';
      const subcategory =
        category.subcategories.find((entry) => entry.id === subcategoryKey) ?? {
          id: subcategoryKey,
          name: row.subcategoryName ?? 'General',
          total: emptyWeeks(weeks),
          rows: [],
        };

      const item = {
        id: row.id,
        personId: row.personId,
        personName: person?.name ?? 'Unknown person',
        departmentName,
        description: row.description ?? undefined,
        weeks: Array.from({ length: weeks }, (_, index) => row.weeks[index] ?? 0),
      };

      subcategory.rows.push(item);
      subcategory.total = sumArray(subcategory.total, weeks).map((value, index) => value + (item.weeks[index] ?? 0));
      category.total = sumArray(category.total, weeks).map((value, index) => value + (item.weeks[index] ?? 0));

      if (!category.subcategories.some((entry) => entry.id === subcategoryKey)) {
        category.subcategories.push(subcategory);
      }

      categories.set(row.categoryId, category);
    }

    return Array.from(categories.values())
      .map((category) => ({
        ...category,
        subcategories: category.subcategories
          .map((subcategory) => ({
            ...subcategory,
            rows: subcategory.rows.sort((a, b) => a.personName.localeCompare(b.personName) || a.departmentName.localeCompare(b.departmentName)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allDepartments.data, allPeople.data, nonProjectDemand.data, weeks]);

  const chartColumns = useMemo(() => Array.from({ length: weeks }, (_, index) => index), [weeks]);

  const totalByWeek = useMemo(() => {
    return Array.from({ length: weeks }, (_, index) =>
      (nonProjectDemand.data ?? []).reduce((sum, row) => sum + (row.weeks[index] ?? 0), 0),
    );
  }, [nonProjectDemand.data, weeks]);

  const totalHours = totalByWeek.reduce((sum, value) => sum + value, 0);
  const activeCategories = new Set(
    (nonProjectDemand.data ?? []).filter((row) => row.weeks.slice(0, weeks).some((value) => value > 0)).map((row) => row.categoryId),
  );

  return (
    <AccentSection accent="requests" title="Other work" subtitle="All non-project demand across the organization for the next planning period.">
      <div className="card">
        <div className="toolbar my-workload-header">
          <h2 style={{ margin: 0, flex: 1 }}>Other demand</h2>
          <div className="weeks-lookahead-control">
            <label htmlFor="other-work-weeks">Weeks to show</label>
            <input
              id="other-work-weeks"
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

        <div className="department-header-kpis" aria-label="Other work KPIs" style={{ marginBottom: '1rem' }}>
          <div className="department-header-kpi">
            <span className="value">{activeCategories.size}</span>
            <span className="label">Active categories</span>
          </div>
          <div className="department-header-kpi">
            <span className="value">{totalHours}</span>
            <span className="label">Total hours</span>
          </div>
        </div>

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
              {groupedDemand.length === 0 && (
                <tr className="no-demand-notice-row">
                  <td colSpan={chartColumns.length + 1}>No other work demand found for the selected period.</td>
                </tr>
              )}
              {groupedDemand.map((category, categoryIndex) => (
                <Fragment key={category.id}>
                  <tr className={`non-project-category-row ${categoryIndex % 2 === 0 ? 'category-band-70' : 'category-band-60'}`}>
                    <th scope="row" className="matrix-label">{category.name}</th>
                    {chartColumns.map((week) => (
                      <td key={`${category.id}-${week}`}>{category.total[week] || ''}</td>
                    ))}
                  </tr>

                  {category.subcategories.map((subcategory) => (
                    <Fragment key={`${category.id}-${subcategory.id}`}>
                      <tr className="non-project-demand-section-row">
                        <th scope="row" className="matrix-label">{subcategory.name}</th>
                        {chartColumns.map((week) => (
                          <td key={`${category.id}-${subcategory.id}-${week}`}>{subcategory.total[week] || ''}</td>
                        ))}
                      </tr>

                      {subcategory.rows.map((row, rowIndex) => (
                        <tr
                          key={row.id}
                          className={`assignment-row non-project-demand-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}`}
                        >
                          <th scope="row" className="matrix-label">
                            <span>{row.personName}</span>
                            <span className="department-detail-inline"> · {row.departmentName}</span>
                            {row.description && <span className="non-project-demand-description"> — {row.description}</span>}
                          </th>
                          {chartColumns.map((week) => (
                            <td key={`${row.id}-${week}`}>{row.weeks[week] || ''}</td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="non-project-demand-section-row non-project-demand-total-row">
                <th scope="row" className="matrix-label">Total</th>
                {chartColumns.map((week) => (
                  <td key={`total-${week}`}>{totalByWeek[week] || ''}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </AccentSection>
  );
}
