import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sql from 'mssql';

type CsvRow = Record<string, string>;
type Db = sql.ConnectionPool;

const sourceFiles = {
  people: 'people.csv', departments: 'departments.csv', functions: 'functions.csv',
  sites: 'sites.csv', locations: 'locations.csv', programs: 'programs.csv',
  skillsets: 'skillsets.csv', categories: 'categories.csv', questions: 'questions.csv',
  requests: 'requests.csv', projects: 'projects.csv', capacities: 'capacities.csv',
  demands: 'demands.csv', answers: 'answers.csv'
} as const;

const identityColumns: Record<string, string> = {
  DirectoryUsers: 'DirectoryUserId', Functions: 'FunctionId', Sites: 'SiteId', Locations: 'LocationId',
  Programs: 'ProgramId', Skillsets: 'SkillsetId', Departments: 'DepartmentId', People: 'PersonId',
  Requests: 'RequestId', Projects: 'ProjectId', ScoringCategories: 'CategoryId', ScoringQuestions: 'QuestionId',
  ScoringAnswers: 'AnswerId', Capacity: 'CapacityId', DemandAllocations: 'DemandAllocationId'
};

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
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift()?.map(value => value.replace(/^\uFEFF/, '').trim()) ?? [];
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
    .filter(item => Object.values(item).some(Boolean));
}

const value = (row: CsvRow, key: string) => row[key]?.trim() || null;
const bool = (raw: string | null) => raw === null ? null : ['true', '1', 'yes'].includes(raw.toLowerCase());
const guid = (raw: string | null) => raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
const number = (raw: string | null) => raw === null ? null : Number(raw.replace(/,/g, '')) || 0;
const dateOnly = (raw: string | null) => raw ? raw.slice(0, 10) : null;
const split = (raw: string | null) => raw ? raw.split(';').map(item => item.trim()).filter(Boolean) : [];

async function readRows(directory: string, file: string): Promise<CsvRow[]> {
  return parseCsv(await fs.readFile(path.join(directory, file), 'utf8'));
}

async function scalar(db: Db, query: string, params: Record<string, unknown>): Promise<number | null> {
  const request = db.request();
  for (const [key, item] of Object.entries(params)) request.input(key, item as never);
  const result = await request.query<{ Id: number }>(query);
  return result.recordset[0]?.Id ?? null;
}

async function ensure(db: Db, table: string, legacy: string, columns: Record<string, unknown>): Promise<number> {
  const names = ['LegacyDataverseId', ...Object.keys(columns)];
  const request = db.request().input('legacy', legacy);
  Object.values(columns).forEach((item, index) => request.input(`p${index}`, item as never));
  const identity = identityColumns[table];
  if (!identity) throw new Error(`Unsupported import table '${table}'`);
  const insertValues = ['@legacy', ...Object.keys(columns).map((_, index) => `@p${index}`)].join(', ');
  await request.query(`INSERT INTO dbo.${table} (${names.join(', ')}) SELECT ${insertValues} WHERE NOT EXISTS (SELECT 1 FROM dbo.${table} WHERE LegacyDataverseId = @legacy);`);
  const id = await scalar(db, `SELECT ${identity} AS Id FROM dbo.${table} WHERE LegacyDataverseId = @legacy`, { legacy });
  if (id === null) throw new Error(`Could not resolve ${table} for ${legacy}`);
  return id;
}

async function logError(db: Db, runId: string, file: string, table: string, rowNumber: number, row: CsvRow, error: unknown): Promise<void> {
  await db.request().input('run', runId).input('file', file).input('table', table).input('row', rowNumber)
    .input('message', error instanceof Error ? error.message : String(error)).input('raw', JSON.stringify(row))
    .query(`INSERT INTO dbo.ImportErrors (ImportRunId, SourceFile, TargetTable, SourceRowNumber, ErrorMessage, RawRow)
            VALUES (@run, @file, @table, @row, @message, @raw)`);
}

async function weekly(db: Db, table: string, parentColumn: string, parentId: number, encoded: string | null): Promise<void> {
  const start = new Date(process.env.IMPORT_WEEK_START ?? '2026-01-05T00:00:00Z');
  for (const [index, item] of (encoded ? encoded.split(';') : []).entries()) {
    const week = new Date(start);
    week.setUTCDate(week.getUTCDate() + index * 7);
    await db.request().input('parent', parentId).input('week', week.toISOString().slice(0, 10)).input('hours', Number(item) || 0)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.${table} WHERE ${parentColumn} = @parent AND WeekStartDate = @week)
        INSERT dbo.${table} (${parentColumn}, WeekStartDate, Hours) VALUES (@parent, @week, @hours)`);
  }
}

async function main(): Promise<void> {
  const directory = process.argv[2] ?? process.env.DATAVERSE_CSV_DIR;
  if (!directory) throw new Error('Usage: npm run import:csv -- <csv-directory>');
  const pool = await sql.connect({
    server: process.env.SQL_SERVER ?? 'localhost', database: process.env.SQL_DATABASE ?? 'ClearPath',
    user: process.env.SQL_USER, password: process.env.SQL_PASSWORD,
    options: { encrypt: process.env.SQL_ENCRYPT === 'true', trustServerCertificate: process.env.SQL_TRUST_CERT !== 'false' }
  });
  const runId = crypto.randomUUID();
  await pool.request().input('run', runId).input('directory', directory)
    .query(`INSERT dbo.ImportRuns (ImportRunId, StartedDate, SourceDirectory, Status) VALUES (@run, SYSUTCDATETIME(), @directory, 'Running')`);
  let read = 0; let imported = 0; let failed = 0;
  const users = new Map<string, number>();
  const idCache = new Map<string, number>();
  const idFor = async (table: string, legacy: string | null) => {
    if (!legacy) return null;
    const key = `${table}:${legacy}`;
    if (idCache.has(key)) return idCache.get(key)!;
    const id = await scalar(pool, `SELECT ${identityColumns[table]} AS Id FROM dbo.${table} WHERE LegacyDataverseId = @legacy`, { legacy });
    if (id !== null) idCache.set(key, id);
    return id;
  };
  const processRows = async (name: keyof typeof sourceFiles, table: string, handler: (row: CsvRow) => Promise<void>) => {
    let rows: CsvRow[];
    try { rows = await readRows(directory, sourceFiles[name]); }
    catch (error) { failed += 1; await logError(pool, runId, sourceFiles[name], table, 0, {}, error); return; }
    for (let index = 0; index < rows.length; index += 1) {
      read += 1;
      try { await handler(rows[index]); imported += 1; }
      catch (error) { failed += 1; await logError(pool, runId, sourceFiles[name], table, index + 2, rows[index], error); }
    }
  };

  await processRows('functions', 'Functions', async row => { const id = guid(value(row, 'new_functionsid')); if (!id) throw new Error('Missing function GUID'); await ensure(pool, 'Functions', id, { Abbreviation: value(row, 'new_abbreviation'), Name: value(row, 'new_functionname') }); });
  await processRows('sites', 'Sites', async row => { const id = guid(value(row, 'new_sitesid')); if (!id) throw new Error('Missing site GUID'); await ensure(pool, 'Sites', id, { Abbreviation: value(row, 'new_abbreviation'), Name: value(row, 'new_name') ?? value(row, 'new_sitename') }); });
  await processRows('locations', 'Locations', async row => { const id = guid(value(row, 'cr714__locationsid')); if (!id) throw new Error('Missing location GUID'); await ensure(pool, 'Locations', id, { Abbreviation: value(row, 'cr714_abbrevaition'), Name: value(row, 'cr714_name') }); });
  await processRows('programs', 'Programs', async row => { const id = guid(value(row, 'cr714__programsid')); if (!id) throw new Error('Missing program GUID'); await ensure(pool, 'Programs', id, { Abbreviation: value(row, 'cr714_abbreviation'), Name: value(row, 'cr714_name'), LongName: value(row, 'cr714_longname'), Purpose: value(row, 'cr714_purpose'), Subprogram: value(row, 'cr714_subprogram') }); });
  await processRows('skillsets', 'Skillsets', async row => { const id = guid(value(row, 'new_skillsetsid')); if (!id) throw new Error('Missing skillset GUID'); await ensure(pool, 'Skillsets', id, { Name: value(row, 'new_name'), Description: value(row, 'new_skillsetdescription') }); });
  await processRows('categories', 'ScoringCategories', async row => { const id = guid(value(row, 'cr714__categoriesid')); if (!id) throw new Error('Missing category GUID'); await ensure(pool, 'ScoringCategories', id, { Name: value(row, 'cr714_name'), CategoryType: value(row, 'cr714_categorytype'), CategoryWeight: number(value(row, 'cr714_categoryweight')), Notes: value(row, 'cr714_notes') }); });

  const peopleRows = await readRows(directory, sourceFiles.people);
  for (const row of peopleRows) { const userGuid = guid(value(row, 'new_userid.azureactivedirectoryobjectid')); if (userGuid) users.set(userGuid, await ensure(pool, 'DirectoryUsers', userGuid, { AzureAdObjectId: userGuid, DisplayName: value(row, 'new_name') })); }
  await processRows('departments', 'Departments', async row => { const id = guid(value(row, 'new_departmentid')); if (!id) throw new Error('Missing department GUID'); const functionId = await scalar(pool, 'SELECT FunctionId AS Id FROM dbo.Functions WHERE Name = @name', { name: value(row, 'new_function') }); await ensure(pool, 'Departments', id, { FunctionId: functionId, DepartmentLeadUserId: users.get(guid(value(row, 'new_departmentlead.azureactivedirectoryobjectid')) ?? '') ?? null, Name: value(row, 'new_name') ?? value(row, 'new_departmentname'), Code: null, SiteName: value(row, 'new_site1') }); });
  await processRows('people', 'People', async row => { const id = guid(value(row, 'new_peopleid')); if (!id) throw new Error('Missing person GUID'); const departmentId = await idFor('Departments', value(row, 'new_departmentsid')); const directoryUserId = users.get(guid(value(row, 'new_userid.azureactivedirectoryobjectid')) ?? '') ?? null; const personId = await ensure(pool, 'People', id, { DepartmentId: departmentId, DirectoryUserId: directoryUserId, Name: value(row, 'new_name'), EmployeeTypeCode: value(row, 'new_employeetype'), LeadNote: value(row, 'new_leadnote'), WeeklyHours: null, FtePercent: null }); for (const skill of split(value(row, 'cr714_skillsets'))) { const skillId = await scalar(pool, 'SELECT SkillsetId AS Id FROM dbo.Skillsets WHERE Name = @name', { name: skill }); if (skillId) await pool.request().input('person', personId).input('skill', skillId).query('IF NOT EXISTS (SELECT 1 FROM dbo.PersonSkillsets WHERE PersonId = @person AND SkillsetId = @skill) INSERT dbo.PersonSkillsets (PersonId, SkillsetId) VALUES (@person, @skill)'); } });
  await processRows('requests', 'Requests', async row => { const id = guid(value(row, 'cr714__requestsid')); if (!id) throw new Error('Missing request GUID'); const programId = await scalar(pool, 'SELECT ProgramId AS Id FROM dbo.Programs WHERE Name = @name OR LongName = @name', { name: value(row, 'cr714_program') }); const sponsorUserId = users.get(guid(value(row, 'cr714_sponsor.azureactivedirectoryobjectid')) ?? '') ?? null; const requestId = await ensure(pool, 'Requests', id, { ProgramId: programId, SponsorUserId: sponsorUserId, Name: value(row, 'cr714_name'), ShortTitle: value(row, 'cr714_shorttitle'), CurrentState: value(row, 'cr714_currentstate'), DesiredFutureState: value(row, 'cr714_desiredfuturestate'), AdditionalInformation: value(row, 'cr714_additionalinformation'), Impact: value(row, 'cr714_impact'), HowDiscovered: value(row, 'cr714_howdiscovered'), Disposition: value(row, 'cr714_disposition'), ProjectType: value(row, 'cr714_projecttype'), WorkflowStep: value(row, 'cr714_workflowstep'), WhenNeeded: dateOnly(value(row, 'cr714_whenneeded')), WhenNeededJustification: value(row, 'cr714_whenneededjustification'), SponsorNameFlat: value(row, 'cr714_sponsornameflat') }); for (const location of split(value(row, 'cr714_location'))) { const locationId = await scalar(pool, 'SELECT LocationId AS Id FROM dbo.Locations WHERE Name = @name', { name: location }); if (locationId) await pool.request().input('request', requestId).input('location', locationId).query('IF NOT EXISTS (SELECT 1 FROM dbo.RequestLocations WHERE RequestId = @request AND LocationId = @location) INSERT dbo.RequestLocations (RequestId, LocationId) VALUES (@request, @location)'); } });
  await processRows('projects', 'Projects', async row => { const id = guid(value(row, 'new_projectsid')); if (!id) throw new Error('Missing project GUID'); await ensure(pool, 'Projects', id, { RequestId: await idFor('Requests', value(row, 'cr714_businesscaseid')), SiteId: await idFor('Sites', value(row, 'cr714_site')), ProjectManagerUserId: users.get(guid(value(row, 'new_projectmanager.azureactivedirectoryobjectid')) ?? '') ?? null, SponsorUserId: users.get(guid(value(row, 'cr714_sponsor.azureactivedirectoryobjectid')) ?? '') ?? null, Name: value(row, 'new_name') ?? value(row, 'new_projectname'), SpotId: value(row, 'new_spotid'), StatusCode: value(row, 'new_status'), MustDo: bool(value(row, 'cr714_mustdo')), Started: bool(value(row, 'cr714_started')), StartDate: null, EndDate: null, LastUpdatedDate: dateOnly(value(row, 'new_lastupdated')) }); });
  await processRows('questions', 'ScoringQuestions', async row => { const id = guid(value(row, 'cr714__questionsid')); if (!id) throw new Error('Missing question GUID'); const questionId = await ensure(pool, 'ScoringQuestions', id, { CategoryId: await idFor('ScoringCategories', value(row, 'cr714_categoryid')), Name: value(row, 'cr714_name'), Metric: value(row, 'cr714_metric'), Subtitle: value(row, 'cr714_questionsubtitle'), HelpText: value(row, 'cr714_questionhelptext'), Required: bool(value(row, 'cr714_required')) ?? false, QuestionWeight: number(value(row, 'cr714_questionweight')) }); for (const [code, key] of [['0', 'cr714_label0'], ['1', 'cr714_label1'], ['5', 'cr714_label5'], ['10', 'cr714_label10'], ['15', 'cr714_label15']] as const) { const label = value(row, key); if (label) await pool.request().input('question', questionId).input('code', code).input('label', label).query('IF NOT EXISTS (SELECT 1 FROM dbo.QuestionOptions WHERE QuestionId = @question AND OptionCode = @code) INSERT dbo.QuestionOptions (QuestionId, OptionCode, Label) VALUES (@question, @code, @label)'); } });
  await processRows('answers', 'ScoringAnswers', async row => { const id = guid(value(row, 'cr714__answersid')); if (!id) throw new Error('Missing answer GUID'); await ensure(pool, 'ScoringAnswers', id, { RequestId: await idFor('Requests', value(row, 'cr714_requestid') ?? value(row, '_cr714_request_value')), QuestionId: await idFor('ScoringQuestions', value(row, 'cr714_questionid') ?? value(row, '_cr714_question_value')), SelectedOptionId: null, AnswerValue: value(row, 'cr714_value'), Score: number(value(row, 'cr714_score')), Comment: value(row, 'cr714_comment') }); });
  await processRows('capacities', 'Capacity', async row => { const id = guid(value(row, 'new_capacityid')); if (!id) throw new Error('Missing capacity GUID'); const capacityId = await ensure(pool, 'Capacity', id, { PersonId: await idFor('People', value(row, 'new_personid')), WeeklyBaseline: null, Notes: null }); await weekly(pool, 'CapacityWeeks', 'CapacityId', capacityId, value(row, 'cr714_availabilityhours')); });
  await processRows('demands', 'DemandAllocations', async row => { const id = guid(value(row, 'new_demandid')); if (!id) throw new Error('Missing demand GUID'); const demandId = await ensure(pool, 'DemandAllocations', id, { ProjectId: await idFor('Projects', value(row, 'new_projectid')), PersonId: await idFor('People', value(row, 'new_personid')), FunctionId: null, Name: value(row, 'new_name'), StatusCode: value(row, 'new_status') }); await weekly(pool, 'DemandWeeks', 'DemandAllocationId', demandId, value(row, 'cr714_demandhours')); });
  await pool.request().input('run', runId).input('read', read).input('imported', imported).input('failed', failed).input('status', failed ? 'CompletedWithErrors' : 'Completed').query('UPDATE dbo.ImportRuns SET CompletedDate = SYSUTCDATETIME(), Status = @status, RowsRead = @read, RowsImported = @imported, RowsFailed = @failed WHERE ImportRunId = @run');
  await pool.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; });