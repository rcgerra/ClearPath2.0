import { ReactNode, useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  /** Value used for sorting and free-text search. */
  value: (row: T) => string | number | null | undefined;
  /** Overrides `value` for sorting only, e.g. a lifecycle position. */
  sortValue?: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  getRowClassName?: (row: T) => string | undefined;
  search?: string;
  initialSortKey?: string;
  emptyMessage?: string;
  isLoading?: boolean;
}

type Direction = 'asc' | 'desc';

function compare(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export default function DataTable<T>({
  rows,
  columns,
  getRowKey,
  getRowClassName,
  search = '',
  initialSortKey,
  emptyMessage = 'No records found.',
  isLoading = false,
}: Props<T>) {
  const [sortKey, setSortKey] = useState(initialSortKey ?? columns[0]?.key);
  const [direction, setDirection] = useState<Direction>('asc');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? rows.filter((row) =>
          columns.some((column) => String(column.value(row) ?? '').toLowerCase().includes(term)),
        )
      : rows;

    const column = columns.find((entry) => entry.key === sortKey);
    if (!column) return filtered;
    const sortBy = column.sortValue ?? column.value;
    return [...filtered].sort((a, b) => {
      const result = compare(sortBy(a), sortBy(b));
      return direction === 'asc' ? result : -result;
    });
  }, [rows, columns, search, sortKey, direction]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection('asc');
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = column.key === sortKey;
              const sortable = column.sortable !== false;
              return (
                <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                  {sortable ? (
                    <button
                      type="button"
                      className={`sort-header${isSorted ? ' sorted' : ''}`}
                      onClick={() => toggleSort(column.key)}
                      aria-sort={isSorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {column.label}
                      <span className="sort-arrow" aria-hidden="true">
                        {isSorted ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={columns.length} className="muted">
                Loading…
              </td>
            </tr>
          )}
          {!isLoading && visible.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!isLoading &&
            visible.map((row) => (
              <tr key={getRowKey(row)} className={getRowClassName?.(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : (column.value(row) ?? '—')}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!isLoading && visible.length > 0 && (
        <p className="muted table-count">
          {visible.length} of {rows.length} records
        </p>
      )}
    </div>
  );
}
