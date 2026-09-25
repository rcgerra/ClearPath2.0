import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AccentSection from '../components/admin/AccentSection';
import SiteCapacityAnalytics from '../components/SiteCapacityAnalytics';
import KpiRow from '../components/KpiRow';
import NonProjectDemandCategoriesPage from './admin/NonProjectDemandCategoriesPage';
import { demandApi, nonProjectDemandApi } from '../api/client';
import { currentWeekStart, PLANNING_HORIZONS, weekLabelShort, weekValue, weekYear } from '../utils/arrayParser';
import { formatCount } from '../utils/format';

type DemandRow = {
  id: string;
  name: string;
  total: number[];
};

type DemandGroup = {
  id: string;
  name: string;
  total: number[];
  rows: DemandRow[];
};

type AccountingRow = {
  category: string;
  subcategory: string;
  previousPrevious: number;
  next: number;
  recent: number;
  previous: number;
  total: number;
};

type AccountingGroup = {
  category: string;
  rows: AccountingRow[];
  previousPrevious: number;
  next: number;
  recent: number;
  previous: number;
  total: number;
};

const DEFAULT_WEEKS = 26;

function emptyWeeks(length: number): number[] {
  return new Array(length).fill(0);
}

function addWeeks(target: number[], source: number[]): number[] {
  return target.map((value, index) => value + (source[index] ?? 0));
}

function sumPeriod(weeks: number[], start: number, end: number): number {
  let total = 0;
  for (let week = start; week <= end; week += 1) total += weeks[week] ?? 0;
  return total;
}

function monthLabel(week: number): string {
  const date = currentWeekStart();
  date.setUTCDate(date.getUTCDate() + week * 7);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function periodSubtitle(startWeek: number, endWeek: number): string {
  return `${monthLabel(startWeek)} - ${monthLabel(endWeek)}`;
}

export default function OtherWorkPage() {
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [lookDirection, setLookDirection] = useState<'ahead' | 'back'>('ahead');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const projectDemand = useQuery({ queryKey: ['demand', 'all'], queryFn: () => demandApi.list() });
  const nonProjectDemand = useQuery({ queryKey: ['non-project-demand', 'all'], queryFn: () => nonProjectDemandApi.list() });

  const columns = useMemo(
    () => Array.from({ length: weeks }, (_, index) => (lookDirection === 'back' ? -(index + 1) : index)),
    [weeks, lookDirection],
  );

  const groupedDemand = useMemo<DemandGroup[]>(() => {
    const categories = new Map<string, DemandGroup>();

    for (const row of nonProjectDemand.data ?? []) {
      const categoryKey = row.categoryId ?? '__general__';
      const category = categories.get(categoryKey) ?? {
        id: categoryKey,
        name: row.categoryName ?? 'Other work',
        total: emptyWeeks(weeks),
        rows: [],
      };
      const subcategoryKey = row.subcategoryId ?? '__general__';
      const subcategory = category.rows.find((item) => item.id === subcategoryKey) ?? {
        id: subcategoryKey,
        name: row.subcategoryName ?? 'General',
        total: emptyWeeks(weeks),
        rows: [],
      };

      subcategory.total = addWeeks(subcategory.total, columns.map((week) => weekValue(row.weeks, week, row.pastWeeks)));
      if (!category.rows.some((item) => item.id === subcategoryKey)) category.rows.push(subcategory);
      category.total = addWeeks(category.total, columns.map((week) => weekValue(row.weeks, week, row.pastWeeks)));
      categories.set(categoryKey, category);
    }

    return Array.from(categories.values()).sort((first, second) => first.name.localeCompare(second.name));
  }, [columns, nonProjectDemand.data, weeks]);

  const groupedProjects = useMemo<DemandGroup>(() => {
    const projects = new Map<string, DemandGroup>();
    for (const row of projectDemand.data ?? []) {
      const projectId = row.projectId;
      const project = projects.get(projectId) ?? {
        id: projectId,
        name: row.projectName ?? row.name ?? 'Unnamed project',
        total: emptyWeeks(weeks),
        rows: [],
      };
      project.total = addWeeks(project.total, columns.map((week) => row.weeks[week] ?? 0));
      projects.set(projectId, project);
    }

    const total = Array.from(projects.values()).reduce((sum, project) => addWeeks(sum, project.total), emptyWeeks(weeks));
    return { id: 'projects', name: 'Projects', total, rows: [] };
  }, [columns, projectDemand.data, weeks]);

  const totalByWeek = useMemo(() => {
    return Array.from({ length: weeks }, (_, index) =>
      [...(projectDemand.data ?? []), ...(nonProjectDemand.data ?? [])].reduce(
        (sum, row) => sum + weekValue(row.weeks, columns[index], 'pastWeeks' in row ? row.pastWeeks : undefined),
        0,
      ),
    );
  }, [columns, nonProjectDemand.data, projectDemand.data, weeks]);

  const totalHours = totalByWeek.reduce((sum, value) => sum + value, 0);
  const activeActivities = new Set(
    (nonProjectDemand.data ?? [])
      .filter((row) => columns.some((week) => weekValue(row.weeks, week, row.pastWeeks) > 0))
      .map((row) => row.subcategoryId ?? row.id),
  );

  const accountingRows = useMemo<AccountingRow[]>(() => {
    const rows = new Map<string, AccountingRow>();
    const add = (category: string, subcategory: string, weeksForRow: number[], pastWeeksForRow?: number[]) => {
      const key = `${category}:${subcategory}`;
      const row = rows.get(key) ?? { category, subcategory, previousPrevious: 0, next: 0, recent: 0, previous: 0, total: 0 };
      row.previousPrevious += sumPeriod(pastWeeksForRow ?? [], 26, 38);
      row.next += sumPeriod(weeksForRow, 0, 12);
      row.recent += sumPeriod(pastWeeksForRow ?? [], 0, 12);
      row.previous += sumPeriod(pastWeeksForRow ?? [], 13, 25);
      row.total = row.previousPrevious + row.previous + row.recent + row.next;
      rows.set(key, row);
    };

    for (const row of projectDemand.data ?? []) add('Projects', 'All project demand', row.weeks);
    for (const row of nonProjectDemand.data ?? []) {
      add(row.categoryName ?? 'Other work', row.subcategoryName ?? 'General', row.weeks, row.pastWeeks);
    }

    return Array.from(rows.values()).sort((first, second) =>
      first.category.localeCompare(second.category) || first.subcategory.localeCompare(second.subcategory),
    );
  }, [nonProjectDemand.data, projectDemand.data]);

  const accountingTotals = accountingRows.reduce(
    (totals, row) => ({
      previousPrevious: totals.previousPrevious + row.previousPrevious,
      next: totals.next + row.next,
      recent: totals.recent + row.recent,
      previous: totals.previous + row.previous,
      total: totals.total + row.total,
    }),
    { previousPrevious: 0, next: 0, recent: 0, previous: 0, total: 0 },
  );

  const accountingGroups = accountingRows.reduce<AccountingGroup[]>((groups, row) => {
    const group = groups.find((current) => current.category === row.category) ?? {
      category: row.category,
      rows: [],
      previousPrevious: 0,
      next: 0,
      recent: 0,
      previous: 0,
      total: 0,
    };
    group.rows.push(row);
    group.previousPrevious += row.previousPrevious;
    group.next += row.next;
    group.recent += row.recent;
    group.previous += row.previous;
    group.total += row.total;
    if (!groups.includes(group)) groups.push(group);
    return groups;
  }, []);


  const lookDirectionControl = (
    <div className="pill-toggle" role="group" aria-label="Look direction">
      <button type="button" className={lookDirection === 'ahead' ? 'active' : ''} onClick={() => setLookDirection('ahead')}>
        Look ahead
      </button>
      <button type="button" className={lookDirection === 'back' ? 'active' : ''} onClick={() => setLookDirection('back')}>
        Look back
      </button>
    </div>
  );

  const kpis = (
    <>
      <KpiRow
        ariaLabel="Other work KPIs"
        variant="compact"
        items={[
          { key: 'active', value: formatCount(activeActivities.size), label: 'Active activities' },
          { key: 'hours', value: formatCount(totalHours), label: 'Total hours' },
        ]}
      />
      <div className="pill-toggle" role="group" aria-label="Planning horizon">
        {PLANNING_HORIZONS.map((horizon) => (
          <button key={horizon} type="button" className={weeks === horizon ? 'active' : ''} onClick={() => setWeeks(horizon)}>{horizon} weeks</button>
        ))}
      </div>
    </>
  );

  return (
    <>
    <AccentSection
      accent="projects"
      title="Run the Business"
      subtitle="All non-project demand across the organization for the selected planning window."
      headerContent={kpis}
      actions={lookDirectionControl}
      collapsible
    >
      <div className="toolbar">
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>Non-project demand</h2>
          <p className="page-subtitle" style={{ margin: '0.25rem 0 0' }}>
            Review demand and manage the categories available to department leads.
          </p>
        </div>
      </div>
      <div className="card">
        <div className="matrix-scroll">
          <table className="weekly-matrix demand-grid department-person-matrix">
            <thead>
              <tr>
                <th className="matrix-label" aria-hidden="true" />
                {columns.map((week) => (
                  <th key={week} className={weekYear(week) % 2 === 1 ? 'year-shade-alt' : undefined}>
                    {weekLabelShort(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(projectDemand.data ?? []).length === 0 && groupedDemand.length === 0 && (
                <tr className="no-demand-notice-row">
                  <td colSpan={columns.length + 1}>No project or non-project demand found for the selected period.</td>
                </tr>
              )}
              {[groupedProjects, ...groupedDemand].map((group, groupIndex) => (
                <Fragment key={group.id}>
                  <tr className={`non-project-category-row ${groupIndex % 2 === 0 ? 'category-band-70' : 'category-band-60'}`}>
                    <th scope="row" className="matrix-label">
                      {group.id === 'projects' ? (
                        group.name
                      ) : (
                        <button
                          type="button"
                          className="table-row-expand-button"
                          aria-expanded={Boolean(expandedCategories[group.id])}
                          onClick={() => setExpandedCategories((current) => ({ ...current, [group.id]: !current[group.id] }))}
                        >
                          <span className={expandedCategories[group.id] ? 'workload-collapse-chevron' : 'workload-collapse-chevron collapsed'} aria-hidden="true" />
                          {group.name}
                        </button>
                      )}
                    </th>
                    {columns.map((week) => (
                      <td key={`${group.id}-${week}`}>{formatCount(group.total[week])}</td>
                    ))}
                  </tr>

                  {group.id !== 'projects' && expandedCategories[group.id] && group.rows.map((subcategory, rowIndex) => (
                    <tr key={subcategory.id} className={`assignment-row non-project-demand-row ${rowIndex % 2 === 0 ? 'band-strong' : 'band-light'}`}>
                      <th scope="row" className="matrix-label">{subcategory.name}</th>
                      {columns.map((week) => (
                        <td key={`${subcategory.id}-${week}`}>{formatCount(subcategory.total[week])}</td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="non-project-demand-section-row non-project-demand-total-row">
                <th scope="row" className="matrix-label">Total</th>
                {columns.map((week) => (
                  <td key={`total-${week}`}>{formatCount(totalByWeek[week])}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </AccentSection>
    <AccentSection
      accent="departments"
      title="Live Capacity Model"
      subtitle="Total demand grouped by project and non-project category."
      collapsible
    >
      <div className="demand-accounting-layout">
        <SiteCapacityAnalytics
          projectDemand={projectDemand.data ?? []}
          nonProjectDemand={nonProjectDemand.data ?? []}
        />
        <div className="card table-card">
          <h2 className="accounting-title">Demand accounting</h2>
          <table className="data-table demand-accounting-table">
          <thead>
            <tr>
              <th colSpan={2}>Category / Subcategory</th>
              <th>
                <span className="accounting-period-header">Previous Quarter</span>
                <small className="accounting-period-subtitle">{periodSubtitle(-39, -27)}</small>
              </th>
              <th>
                <span className="accounting-period-header">Last Quarter</span>
                <small className="accounting-period-subtitle">{periodSubtitle(-26, -14)}</small>
              </th>
              <th>
                <span className="accounting-period-header">This Quarter</span>
                <small className="accounting-period-subtitle">{periodSubtitle(-13, -1)}</small>
              </th>
              <th>
                <span className="accounting-period-header">Next Quarter</span>
                <small className="accounting-period-subtitle">{periodSubtitle(0, 12)}</small>
              </th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {accountingGroups.map((group) => (
              <Fragment key={group.category}>
                <tr className="accounting-category-row">
                  <th colSpan={2}>{group.category}</th>
                  <th>{formatCount(group.previousPrevious)}</th>
                  <th>{formatCount(group.previous)}</th>
                  <th>{formatCount(group.recent)}</th>
                  <th>{formatCount(group.next)}</th>
                  <th>{formatCount(group.total)}</th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={`${row.category}-${row.subcategory}`} className="accounting-subcategory-row">
                    <td colSpan={2}>{row.subcategory}</td>
                    <td>{formatCount(row.previousPrevious)}</td>
                    <td>{formatCount(row.previous)}</td>
                    <td>{formatCount(row.recent)}</td>
                    <td>{formatCount(row.next)}</td>
                    <td>{formatCount(row.total)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {accountingRows.length === 0 && <tr><td colSpan={6}>No demand accounting data found.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Total demand</th>
              <th>{formatCount(accountingTotals.previousPrevious)}</th>
              <th>{formatCount(accountingTotals.previous)}</th>
              <th>{formatCount(accountingTotals.recent)}</th>
              <th>{formatCount(accountingTotals.next)}</th>
              <th>{formatCount(accountingTotals.total)}</th>
            </tr>
          </tfoot>
          </table>
        </div>
      </div>
    </AccentSection>
    <AccentSection
      accent="projects"
      title="Non-project demand categories"
      subtitle="Categories available when department leads assign work outside a project."
      collapsible
    >
      <NonProjectDemandCategoriesPage embedded />
    </AccentSection>
    </>
  );
}
