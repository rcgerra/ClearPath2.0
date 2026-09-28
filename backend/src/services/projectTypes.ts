import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { query } from '../database/connection';

export interface ProjectType {
  id: string;
  name: string;
  sortOrder: number;
}

/** Seeded options; kept in sync with database/10_governance.sql. */
const DEFAULT_PROJECT_TYPES: ProjectType[] = [
  { id: 'non-project', name: 'Non-Project', sortOrder: 1 },
  { id: 'just-do-it', name: 'Just Do It', sortOrder: 2 },
  { id: 'functional-project', name: 'Functional Project', sortOrder: 3 },
  { id: 'spot-light-project', name: 'SPOT Light Project', sortOrder: 4 },
  { id: 'spot-standard-project', name: 'SPOT Standard Project', sortOrder: 5 },
];

const demoFile = path.join(
  process.env.DEMO_CSV_DIR ?? path.resolve(process.cwd(), 'demo-data'),
  'project-types.json',
);

let demoTypes: ProjectType[] | null = null;

function loadDemoTypes(): ProjectType[] {
  if (demoTypes) return demoTypes;
  if (fs.existsSync(demoFile)) {
    try {
      demoTypes = JSON.parse(fs.readFileSync(demoFile, 'utf8')) as ProjectType[];
      return demoTypes;
    } catch (error) {
      console.warn('Could not read project types; falling back to defaults.', error);
    }
  }
  demoTypes = [...DEFAULT_PROJECT_TYPES];
  return demoTypes;
}

export async function listProjectTypes(): Promise<ProjectType[]> {
  if (env.demoMode) return [...loadDemoTypes()].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await query<{ ProjectTypeId: number; Name: string; SortOrder: number }>(
    'SELECT ProjectTypeId, Name, SortOrder FROM dbo.ProjectTypes WHERE IsActive = 1 ORDER BY SortOrder, Name',
  );
  return rows.map((row) => ({ id: String(row.ProjectTypeId), name: row.Name, sortOrder: row.SortOrder }));
}
