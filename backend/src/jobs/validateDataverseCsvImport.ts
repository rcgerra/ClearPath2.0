import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';

interface CsvRow { [key: string]: string; }
interface EntityMap { file: string; target: string; sourceId: string; targetId: string; }
interface EntityReport {
  sourceFile: string;
  targetTable: string;
  sourceCount: number;
  sourceUniqueIds: number;
  targetCount: number;
  targetUniqueLegacyIds: number;
  missingInSql: string[];
  extraInSql: string[];
  duplicateSourceIds: string[];
  duplicateSqlIds: string[];
}
interface ValidationReport {
  generatedAt: string;
  sourceDirectory: string;
  entities: EntityReport[];
  orphanedForeignKeys: Array<{ check: string; count: number }>;
  duplicateRows: Array<{ check: string; count: number }>;
  dataIntegrity: Array<{ check: string; count: number; details?: string }>;
}

const entities: EntityMap[] = [
  { file: 'functions.csv', target: 'Functions', sourceId: 'new_functionsid', targetId: 'FunctionId' },
  { file: 'sites.csv', target: 'Sites', sourceId: 'new_sitesid', targetId: 'SiteId' },
  { file: 'locations.csv', target: 'Locations', sourceId: 'cr714__locationsid', targetId: 'LocationId' },
  { file: 'programs.csv', target: 'Programs', sourceId: 'cr714__programsid', targetId: 'ProgramId' },
  { file: 'skillsets.csv', target: 'Skillsets', sourceId: 'new_skillsetsid', targetId: 'SkillsetId' },
  { file: 'categories.csv', target: 'ScoringCategories', sourceId: 'cr714__categoriesid', targetId: 'CategoryId' },
  { file: 'people.csv', target: 'People', sourceId: 'new_peopleid', targetId: 'PersonId' },
  { file: 'departments.csv', target: 'Departments', sourceId: 'new_departmentid', targetId: 'DepartmentId' },
  { file: 'questions.csv', target: 'ScoringQuestions', sourceId: 'cr714__questionsid', targetId: 'QuestionId' },
  { file: 'requests.csv', target: 'Requests', sourceId: 'cr714__requestsid', targetId: 'RequestId' },
  { file: 'projects.csv', target: 'Projects', sourceId: 'new_projectsid', targetId: 'ProjectId' },
  { file: 'answers.csv', target: 'ScoringAnswers', sourceId: 'cr714__answersid', targetId: 'AnswerId' },
  { file: 'capacities.csv', target: 'Capacity', sourceId: 'new_capacityid', targetId: 'CapacityId' },
  { file: 'demands.csv', target: 'DemandAllocations', sourceId: 'new_demandid', targetId: 'DemandAllocationId' },
];

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
}

async function scalar(db: sql.ConnectionPool, query: string, params: Record<string, unknown>): Promise<number> {
  const request = db.request();
  for (const [name, value] of Object.entries(params)) request.input(name, value as never);
  const result = await request.query<{ Count: number }>(query);
  return Number(result.recordset[0]?.Count ?? 0);
}

async function values(db: sql.ConnectionPool, query: string, params: Record<string, unknown>): Promise<string[]> {
  const request = db.request();
  for (const [name, value] of Object.entries(params)) request.input(name, value as never);
  const result = await request.query<{ Id: string }>(query);
  return result.recordset.map((row) => row.Id);
}

async function main(): Promise<void> {
  const sourceDirectory = process.argv[2] ?? process.env.DATAVERSE_CSV_DIR;
  const outputPath = process.argv[3] ?? path.join(sourceDirectory ?? '.', 'sql-import-validation.json');
  if (!sourceDirectory) throw new Error('Usage: npm run validate:csv -- <csv-directory> [output-json]');

  const pool = await sql.connect({
    server: process.env.SQL_SERVER ?? 'localhost', database: process.env.SQL_DATABASE ?? 'ClearPath',
    user: process.env.SQL_USER, password: process.env.SQL_PASSWORD,
    options: { encrypt: process.env.SQL_ENCRYPT === 'true', trustServerCertificate: process.env.SQL_TRUST_CERT !== 'false' },
  });
  const report: ValidationReport = { generatedAt: new Date().toISOString(), sourceDirectory, entities: [], orphanedForeignKeys: [], duplicateRows: [], dataIntegrity: [] };

  for (const entity of entities) {
    const rows = parseCsv(await fs.readFile(path.join(sourceDirectory, entity.file), 'utf8'));
    const sourceIds = rows.map((row) => row[entity.sourceId]).filter(Boolean);
    const sourceCounts = new Map<string, number>();
    sourceIds.forEach((id) => sourceCounts.set(id, (sourceCounts.get(id) ?? 0) + 1));
    const duplicateSourceIds = [...sourceCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    const sourceUniqueIds = [...sourceCounts.keys()];
    const sqlIds = await values(pool, `SELECT LegacyDataverseId AS Id FROM dbo.[${entity.target}] WHERE LegacyDataverseId IS NOT NULL`, {});
    const sqlCounts = new Map<string, number>();
    sqlIds.forEach((id) => sqlCounts.set(id, (sqlCounts.get(id) ?? 0) + 1));
    const missingInSql = sourceUniqueIds.filter((id) => !sqlCounts.has(id));
    const extraInSql = sqlIds.filter((id) => !sourceCounts.has(id));
    const duplicateSqlIds = [...sqlCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    report.entities.push({ sourceFile: entity.file, targetTable: entity.target, sourceCount: rows.length, sourceUniqueIds: sourceUniqueIds.length, targetCount: await scalar(pool, `SELECT COUNT(*) AS Count FROM dbo.[${entity.target}]`, {}), targetUniqueLegacyIds: new Set(sqlIds).size, missingInSql, extraInSql, duplicateSourceIds, duplicateSqlIds });
  }

  const orphanChecks: Array<[string, string]> = [
    ['Departments.FunctionId', 'SELECT COUNT(*) AS Count FROM dbo.Departments d LEFT JOIN dbo.Functions f ON f.FunctionId = d.FunctionId WHERE d.FunctionId IS NOT NULL AND f.FunctionId IS NULL'],
    ['Departments.DepartmentLeadUserId', 'SELECT COUNT(*) AS Count FROM dbo.Departments d LEFT JOIN dbo.DirectoryUsers u ON u.DirectoryUserId = d.DepartmentLeadUserId WHERE d.DepartmentLeadUserId IS NOT NULL AND u.DirectoryUserId IS NULL'],
    ['People.DepartmentId', 'SELECT COUNT(*) AS Count FROM dbo.People p LEFT JOIN dbo.Departments d ON d.DepartmentId = p.DepartmentId WHERE p.DepartmentId IS NOT NULL AND d.DepartmentId IS NULL'],
    ['Requests.ProgramId', 'SELECT COUNT(*) AS Count FROM dbo.Requests r LEFT JOIN dbo.Programs p ON p.ProgramId = r.ProgramId WHERE r.ProgramId IS NOT NULL AND p.ProgramId IS NULL'],
    ['Projects.RequestId', 'SELECT COUNT(*) AS Count FROM dbo.Projects p LEFT JOIN dbo.Requests r ON r.RequestId = p.RequestId WHERE p.RequestId IS NOT NULL AND r.RequestId IS NULL'],
    ['Projects.DepartmentId', 'SELECT COUNT(*) AS Count FROM dbo.Projects p LEFT JOIN dbo.Departments d ON d.DepartmentId = p.DepartmentId WHERE p.DepartmentId IS NOT NULL AND d.DepartmentId IS NULL'],
    ['DemandAllocations.ProjectId', 'SELECT COUNT(*) AS Count FROM dbo.DemandAllocations d LEFT JOIN dbo.Projects p ON p.ProjectId = d.ProjectId WHERE p.ProjectId IS NULL'],
    ['DemandAllocations.PersonId', 'SELECT COUNT(*) AS Count FROM dbo.DemandAllocations d LEFT JOIN dbo.People p ON p.PersonId = d.PersonId WHERE d.PersonId IS NOT NULL AND p.PersonId IS NULL'],
    ['Capacity.PersonId', 'SELECT COUNT(*) AS Count FROM dbo.Capacity c LEFT JOIN dbo.People p ON p.PersonId = c.PersonId WHERE p.PersonId IS NULL'],
    ['ScoringAnswers.RequestId', 'SELECT COUNT(*) AS Count FROM dbo.ScoringAnswers a LEFT JOIN dbo.Requests r ON r.RequestId = a.RequestId WHERE r.RequestId IS NULL'],
  ];
  for (const [check, query] of orphanChecks) report.orphanedForeignKeys.push({ check, count: await scalar(pool, query, {}) });

  report.duplicateRows.push({ check: 'CapacityWeeks parent/week', count: await scalar(pool, 'SELECT COUNT(*) AS Count FROM (SELECT CapacityId, WeekStartDate FROM dbo.CapacityWeeks GROUP BY CapacityId, WeekStartDate HAVING COUNT(*) > 1) x', {}) });
  report.duplicateRows.push({ check: 'DemandWeeks parent/week', count: await scalar(pool, 'SELECT COUNT(*) AS Count FROM (SELECT DemandAllocationId, WeekStartDate FROM dbo.DemandWeeks GROUP BY DemandAllocationId, WeekStartDate HAVING COUNT(*) > 1) x', {}) });
  report.dataIntegrity.push({ check: 'Invalid CapacityWeeks hours', count: await scalar(pool, 'SELECT COUNT(*) AS Count FROM dbo.CapacityWeeks WHERE Hours < 0 OR Hours > 99', {}) });
  report.dataIntegrity.push({ check: 'Invalid DemandWeeks hours', count: await scalar(pool, 'SELECT COUNT(*) AS Count FROM dbo.DemandWeeks WHERE Hours < 0 OR Hours > 99', {}) });
  report.dataIntegrity.push({ check: 'People without names', count: await scalar(pool, "SELECT COUNT(*) AS Count FROM dbo.People WHERE NULLIF(LTRIM(RTRIM(Name)), '') IS NULL", {}) });
  report.dataIntegrity.push({ check: 'Projects without names', count: await scalar(pool, "SELECT COUNT(*) AS Count FROM dbo.Projects WHERE NULLIF(LTRIM(RTRIM(Name)), '') IS NULL", {}) });
  report.dataIntegrity.push({ check: 'Requests without names', count: await scalar(pool, "SELECT COUNT(*) AS Count FROM dbo.Requests WHERE NULLIF(LTRIM(RTRIM(Name)), '') IS NULL", {}) });

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, entities: report.entities.length, missing: report.entities.reduce((total, item) => total + item.missingInSql.length, 0), orphans: report.orphanedForeignKeys.reduce((total, item) => total + item.count, 0), duplicates: report.duplicateRows.reduce((total, item) => total + item.count, 0), integrityFailures: report.dataIntegrity.reduce((total, item) => total + item.count, 0) }, null, 2));
  await pool.close();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
