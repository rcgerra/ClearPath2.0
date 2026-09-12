/**
 * Registry of the Dataverse tables linked from the MBO-Staffing-Model environment.
 * `systemuser` is the corporate user master and is never written to by this app.
 */
export type TableAccess = 'readwrite' | 'readonly';

export interface TableDefinition {
  /** Route/alias key used by the API and UI. */
  key: string;
  /** Dataverse logical name. */
  logicalName: string;
  /** Display name in the environment. */
  displayName: string;
  access: TableAccess;
}

export const TABLES: TableDefinition[] = [
  { key: 'adm', logicalName: 'new_adm', displayName: '_ADM', access: 'readwrite' },
  { key: 'answers', logicalName: 'cr714_answers', displayName: '_Answers', access: 'readwrite' },
  { key: 'capacity', logicalName: 'new_capacity', displayName: '_Capacity', access: 'readwrite' },
  { key: 'categories', logicalName: 'cr714_categories', displayName: '_Categories', access: 'readwrite' },
  { key: 'demand', logicalName: 'new_demand', displayName: '_Demand', access: 'readwrite' },
  { key: 'departments', logicalName: 'new_department', displayName: '_Departments', access: 'readwrite' },
  { key: 'feedback', logicalName: 'cr714_feedback', displayName: '_feedback', access: 'readwrite' },
  { key: 'functions', logicalName: 'new_functions', displayName: '_Functions', access: 'readwrite' },
  { key: 'locations', logicalName: 'cr714_locations', displayName: '_Locations', access: 'readwrite' },
  { key: 'people', logicalName: 'new_people', displayName: '_People', access: 'readwrite' },
  { key: 'programs', logicalName: 'cr714_programs', displayName: '_Programs', access: 'readwrite' },
  { key: 'projects', logicalName: 'new_projects', displayName: '_Projects', access: 'readwrite' },
  { key: 'questions', logicalName: 'cr714_questions', displayName: '_Questions', access: 'readwrite' },
  { key: 'requests', logicalName: 'cr714_requests', displayName: '_Requests', access: 'readwrite' },
  { key: 'sites', logicalName: 'new_sites', displayName: '_Sites', access: 'readwrite' },
  { key: 'skillsets', logicalName: 'new_skillsets', displayName: '_Skillsets', access: 'readwrite' },
  { key: 'users', logicalName: 'systemuser', displayName: 'User', access: 'readonly' },
];

const byKey = new Map(TABLES.map((table) => [table.key, table]));
const byLogicalName = new Map(TABLES.map((table) => [table.logicalName, table]));

export function getTable(keyOrLogicalName: string): TableDefinition | undefined {
  const normalized = keyOrLogicalName.toLowerCase();
  return byKey.get(normalized) ?? byLogicalName.get(normalized);
}

export function requireTable(keyOrLogicalName: string): TableDefinition {
  const table = getTable(keyOrLogicalName);
  if (!table) throw Object.assign(new Error(`Unknown table '${keyOrLogicalName}'.`), { status: 404 });
  return table;
}

export function assertWritable(table: TableDefinition): void {
  if (table.access === 'readonly') {
    throw Object.assign(new Error(`Table '${table.displayName}' is read-only.`), { status: 403 });
  }
}
