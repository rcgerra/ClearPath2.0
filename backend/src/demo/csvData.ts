import fs from 'node:fs';
import path from 'node:path';

export type CsvRow = Record<string, string>;

export const sourceFiles = [
  'departments.csv',
  'people.csv',
  'projects.csv',
  'requests.csv',
  'capacities.csv',
  'demands.csv',
  'programs.csv',
  'functions.csv',
  'locations.csv',
  'sites.csv',
  'categories.csv',
  'questions.csv',
  'answers.csv',
  'skillsets.csv',
  'demo_skill_categories.csv',
  'demo_skills.csv',
  'demo_person_skills.csv',
  'demo_non_project_categories.csv',
  'demo_non_project_subcategories.csv',
  'demo_non_project_demand.csv',
] as const;

const generatedId = (index: number, prefix: string) =>
  `${prefix}${String(index + 1).padStart(7, '0')}-0000-4000-8000-000000000000`;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])))
    .filter((item) => Object.values(item).some(Boolean));
}

function value(row: CsvRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = row[key]?.trim();
    if (candidate) return candidate;
  }
  return undefined;
}

function numberValue(row: CsvRow, ...keys: string[]): number | undefined {
  const raw = value(row, ...keys);
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(row: CsvRow, ...keys: string[]): boolean {
  const raw = value(row, ...keys)?.toLowerCase();
  return raw === undefined ? true : ['true', '1', 'yes', 'active'].includes(raw);
}

function dateValue(row: CsvRow, ...keys: string[]): string | undefined {
  return value(row, ...keys)?.slice(0, 10);
}

/** Parses ISO-ish ("2026-09-11 ...") or US-style ("5/26/2026 19:57") date strings into YYYY-MM-DD. */
function flexibleDateValue(row: CsvRow, ...keys: string[]): string | undefined {
  const raw = value(row, ...keys);
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function weeksValue(row: CsvRow, ...keys: string[]): number[] {
  const raw = value(row, ...keys);
  const weeks = raw ? raw.split(';').map((entry) => Number(entry.trim()) || 0) : [];
  return Array.from({ length: 1333 }, (_, index) => weeks[index] ?? 0);
}

function nonProjectSchedule(row: CsvRow): { weeks: number[]; pastWeeks: number[] } {
  const startWeek = numberValue(row, 'startWeek');
  const durationWeeks = numberValue(row, 'durationWeeks');
  const hoursPerWeek = numberValue(row, 'hoursPerWeek');
  if (startWeek === undefined || durationWeeks === undefined || hoursPerWeek === undefined) {
    return { weeks: weeksValue(row, 'weeks'), pastWeeks: weeksValue(row, 'pastWeeks') };
  }

  const weeks = new Array(1333).fill(0);
  const pastWeeks = new Array(1333).fill(0);
  for (let offset = 0; offset < durationWeeks; offset += 1) {
    const week = startWeek + offset;
    if (week >= 0 && week < weeks.length) weeks[week] = hoursPerWeek;
    else if (week < 0 && -week <= pastWeeks.length) pastWeeks[-week - 1] = hoursPerWeek;
  }
  return { weeks, pastWeeks };
}

function isGuid(candidate: string | undefined): candidate is string {
  // Dataverse GUIDs are not always RFC 4122 v1-v5 compliant; the real exports frequently use
  // variant/version nibble combinations outside the strict pattern. Treat any well-formed GUID
  // shape as a GUID rather than synthesizing a replacement ID.
  return Boolean(candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate));
}

class IdIndex {
  private readonly values = new Map<string, string>();

  public add(rawId: string | undefined, name: string | undefined, id: string): void {
    if (rawId) this.values.set(rawId.toLowerCase(), id);
    if (name) this.values.set(name.toLowerCase(), id);
  }

  public get(rawValue: string | undefined): string | undefined {
    if (!rawValue) return undefined;
    return this.values.get(rawValue.toLowerCase()) ?? (isGuid(rawValue) ? rawValue : undefined);
  }
}

function makeRecords(rows: CsvRow[], prefix: string, idKeys: string[], nameKeys: string[]): Array<{ row: CsvRow; id: string; name?: string }> {
  return rows.map((row, index) => {
    const rawId = value(row, ...idKeys);
    const name = value(row, ...nameKeys);
    return { row, id: isGuid(rawId) ? rawId : generatedId(index, prefix), name };
  });
}

export function readRows(directory: string, file: string): CsvRow[] {
  const filePath = path.join(directory, file);
  if (!fs.existsSync(filePath)) throw new Error(`Demo CSV file not found: ${filePath}`);
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

export function loadDemoData(directory = process.env.DEMO_CSV_DIR ?? path.resolve(process.cwd(), 'demo-data')) {
  const rows = Object.fromEntries(sourceFiles.map((file) => [file, readRows(directory, file)])) as Record<string, CsvRow[]>;

  const functionRecords = makeRecords(rows['functions.csv'], 'f', ['new_functionsid'], ['new_functionname', 'new_name']);
  const siteRecords = makeRecords(rows['sites.csv'], 's', ['new_sitesid'], ['new_name', 'new_sitename']);
  const locationRecords = makeRecords(rows['locations.csv'], 'l', ['cr714__locationsid'], ['cr714_name']);
  const programRecords = makeRecords(rows['programs.csv'], 'g', ['cr714__programsid'], ['cr714_name', 'cr714_longname']);
  const skillsetRecords = makeRecords(rows['skillsets.csv'], 'k', ['new_skillsetsid'], ['new_name']);
  const categoryRecords = makeRecords(rows['categories.csv'], 'c', ['cr714__categoriesid'], ['cr714_name']);
  const departmentRecords = makeRecords(rows['departments.csv'], 'd', ['new_departmentid'], ['new_name', 'new_departmentname']);
  const personRecords = makeRecords(rows['people.csv'], 'p', ['new_peopleid'], ['new_name']);
  const projectRecords = makeRecords(rows['projects.csv'], 'j', ['new_projectsid'], ['new_name', 'new_projectname']);
  const requestRecords = makeRecords(rows['requests.csv'], 'r', ['cr714__requestsid'], ['cr714_name', 'cr714_shorttitle']);

  const functionsIndex = new IdIndex();
  const sitesIndex = new IdIndex();
  const locationsIndex = new IdIndex();
  const programsIndex = new IdIndex();
  const skillsetsIndex = new IdIndex();
  const categoriesIndex = new IdIndex();
  const departmentsIndex = new IdIndex();
  const peopleIndex = new IdIndex();
  const projectsIndex = new IdIndex();
  const requestsIndex = new IdIndex();
  for (const record of functionRecords) functionsIndex.add(value(record.row, 'new_functionsid'), record.name, record.id);
  for (const record of siteRecords) sitesIndex.add(value(record.row, 'new_sitesid'), record.name, record.id);
  for (const record of locationRecords) locationsIndex.add(value(record.row, 'cr714__locationsid'), record.name, record.id);
  for (const record of programRecords) programsIndex.add(value(record.row, 'cr714__programsid'), record.name, record.id);
  for (const record of skillsetRecords) skillsetsIndex.add(value(record.row, 'new_skillsetsid'), record.name, record.id);
  for (const record of categoryRecords) categoriesIndex.add(value(record.row, 'cr714__categoriesid'), record.name, record.id);
  for (const record of departmentRecords) departmentsIndex.add(value(record.row, 'new_departmentid'), record.name, record.id);
  for (const record of personRecords) {
    peopleIndex.add(value(record.row, 'new_peopleid'), record.name, record.id);
    peopleIndex.add(value(record.row, 'new_userid.azureactivedirectoryobjectid'), record.name, record.id);
    peopleIndex.add(value(record.row, 'new_email'), record.name, record.id);
  }
  for (const record of projectRecords) projectsIndex.add(value(record.row, 'new_projectsid'), record.name, record.id);
  for (const record of requestRecords) requestsIndex.add(value(record.row, 'cr714__requestsid'), record.name, record.id);

  const departmentById = new Map(departmentRecords.map((record) => [record.id, record]));
  /** Departments carry their function as free text (e.g. "Engineering"); people inherit it from their department. */
  const departmentFunctionById = new Map<string, { functionId?: string; functionName?: string }>();
  for (const record of departmentRecords) {
    const functionName = value(record.row, 'new_function');
    departmentFunctionById.set(record.id, { functionId: functionsIndex.get(functionName), functionName });
  }

  const people = personRecords.map(({ row, id }) => {
    const departmentId = departmentsIndex.get(value(row, 'new_departmentsid', '_new_departmentsid_value'));
    const departmentFunction = departmentId ? departmentFunctionById.get(departmentId) : undefined;
    return {
      id,
      name: value(row, 'new_name') ?? 'Unnamed person',
      email: value(row, 'new_email') ?? '',
      role: value(row, 'new_role', 'new_roles') ?? 'user',
      title: value(row, 'new_title') ?? '',
      employmentType: value(row, 'new_employeetype', 'new_employmenttype') ?? '',
      weeklyHours: numberValue(row, 'new_weeklyhours', 'cr714_weeklyhours') ?? 40,
      isActive: booleanValue(row, 'new_isactive', 'statuscode'),
      departmentId,
      departmentName: departmentId ? departmentById.get(departmentId)?.name : undefined,
      functionId: departmentFunction?.functionId,
      functionName: departmentFunction?.functionName,
    };
  });

  const users: DemoUser[] = personRecords.map(({ row, id }, index) => {
    const person = people[index];
    return {
      UserId: id,
      DisplayName: person.name,
      Email: person.email,
      Department: person.departmentName ?? value(row, 'new_departmentsid') ?? '',
      Manager: value(row, 'new_manager', '_new_manager_value') ?? '',
      Location: value(row, 'new_siteid', 'new_site', '_new_siteid_value') ?? '',
      Active: person.isActive,
    };
  });

  const personName = (personId: string | undefined) => people.find((person) => person.id === personId)?.name;
  const departmentName = (departmentId: string | undefined) => departmentRecords.find((department) => department.id === departmentId)?.name;
  const projectName = (projectId: string | undefined) => projectRecords.find((project) => project.id === projectId)?.name;

  const departments = departmentRecords.map(({ row, id, name }) => {
    const leadPersonId = peopleIndex.get(value(row, 'new_departmentlead', '_new_departmentlead_value', 'new_departmentlead.azureactivedirectoryobjectid'));
    return {
      id,
      name: name ?? 'Unnamed department',
      code: value(row, 'new_code', 'new_departmentcode'),
      leadPersonId,
      leadName: personName(leadPersonId),
      delegatePersonId: peopleIndex.get(value(row, 'new_delegate', '_new_delegate_value')),
      delegateName: personName(peopleIndex.get(value(row, 'new_delegate', '_new_delegate_value'))),
      functionId: functionsIndex.get(value(row, 'new_functionid', '_new_functionid_value', 'new_function')),
      functionName: value(row, 'new_function'),
      lastCheckIn: dateValue(row, 'new_lastcheckin', 'new_lastcheckedin'),
      isActive: booleanValue(row, 'new_isactive', 'statuscode'),
    };
  });

  const projects = projectRecords.map(({ row, id, name }) => ({
    id,
    name: name ?? 'Unnamed project',
    code: value(row, 'new_projectcode', 'new_code'),
    started: booleanValue(row, 'cr714_started', 'new_started'),
    spotId: value(row, 'new_spotid'),
    status: value(row, 'new_status', 'statuscode') ?? 'Planning',
    isActive: booleanValue(row, 'cr714_isactive', 'statecode'),
    priorityScore: numberValue(row, 'new_priorityscore', 'cr714_priorityscore') ?? 0,
    managerPersonId: peopleIndex.get(value(row, 'new_projectmanager', '_new_projectmanager_value', 'new_projectmanager.azureactivedirectoryobjectid')),
    managerName: undefined as string | undefined,
    sponsorPersonId: peopleIndex.get(value(row, 'cr714_sponsor', '_cr714_sponsor_value', 'cr714_sponsor.azureactivedirectoryobjectid')),
    sponsorName: undefined as string | undefined,
    delegatePersonId: peopleIndex.get(value(row, 'new_delegate', '_new_delegate_value')),
    delegateName: undefined as string | undefined,
    lastCheckIn: dateValue(row, 'new_lastupdated', 'new_lastcheckin'),
    departmentId: departmentsIndex.get(value(row, 'new_departmentid', '_new_departmentid_value')),
    departmentName: undefined as string | undefined,
    startDate: dateValue(row, 'new_startdate'),
    endDate: dateValue(row, 'new_enddate'),
    problemStatement: value(row, 'new_problemstatement', 'cr714_problemstatement') ?? '',
  }));
  for (const project of projects) {
    project.managerName = personName(project.managerPersonId);
    project.sponsorName = personName(project.sponsorPersonId);
    project.delegateName = personName(project.delegatePersonId);
    project.departmentName = departmentName(project.departmentId);
  }

  const requests = requestRecords.map(({ row, id, name }) => ({
    id,
    shortTitle: value(row, 'cr714_shorttitle') ?? name ?? 'Untitled request',
    spotId: value(row, 'new_spotid', 'cr714_spotid'),
    title: value(row, 'cr714_title', 'cr714_name') ?? name ?? 'Untitled request',
    phase: value(row, 'cr714_phase', 'cr714_workflowstep') ?? 'Draft',
    status: value(row, 'cr714_status', 'statuscode') ?? 'Submitted',
    disposition: value(row, 'cr714_disposition') ?? 'Pending',
    location: value(row, 'cr714_location') ?? '',
    isActive: booleanValue(row, 'cr714_isactive', 'statecode'),
    priorityScore: numberValue(row, 'cr714_priorityscore') ?? 0,
    requesterPersonId: peopleIndex.get(value(row, 'cr714_requester', '_cr714_requester_value')),
    requesterName: undefined as string | undefined,
    delegatePersonId: peopleIndex.get(value(row, 'cr714_delegate', '_cr714_delegate_value', 'cr714_delegates')),
    delegateName: undefined as string | undefined,
    sponsorPersonId: peopleIndex.get(value(row, 'cr714_sponsor', '_cr714_sponsor_value', 'cr714_sponsor.azureactivedirectoryobjectid')),
    sponsorName: undefined as string | undefined,
    sponsorNameFlat: value(row, 'cr714_sponsornameflat') ?? '',
    departmentId: departmentsIndex.get(value(row, 'cr714_departmentid', '_cr714_departmentid_value')),
    departmentName: undefined as string | undefined,
    submittedOn: value(row, 'createdon', 'cr714_submittedon', 'cr714_timestamp_submitted') ?? '',
    projectId: projectsIndex.get(value(row, 'cr714_projectid', '_cr714_projectid_value', 'cr714_businesscaseid')),
    neededBy: dateValue(row, 'cr714_whenneeded'),
    neededByJustification: value(row, 'cr714_whenneededjustification') ?? '',
    currentState: value(row, 'cr714_currentstate') ?? '',
    discoveryMethod: value(row, 'cr714_howdiscovered') ?? '',
    impactToOperations: value(row, 'cr714_impact') ?? '',
    desiredFutureState: value(row, 'cr714_desiredfuturestate') ?? '',
    additionalInformation: value(row, 'cr714_additionalinformation') ?? '',
  }));
  for (const request of requests) {
    request.requesterName = personName(request.requesterPersonId);
    request.delegateName = personName(request.delegatePersonId);
    request.sponsorName = personName(request.sponsorPersonId) ?? (request.sponsorNameFlat || undefined);
    request.departmentName = departmentName(request.departmentId);
  }

  const capacity = rows['capacities.csv'].map((row, index) => {
    const personId = peopleIndex.get(value(row, 'new_personid', '_new_personid_value'));
    return {
      id: isGuid(value(row, 'new_capacityid')) ? value(row, 'new_capacityid')! : generatedId(index, 'e'),
      personId: personId ?? '',
      personName: personName(personId) ?? 'Unassigned',
      departmentId: people.find((person) => person.id === personId)?.departmentId,
      departmentName: departmentName(people.find((person) => person.id === personId)?.departmentId),
      availabilityHours: null,
      weeks: weeksValue(row, 'cr714_availabilityhours', 'new_availabilityhours'),
      weeklyBaseline: numberValue(row, 'new_weeklybaseline', 'cr714_weeklybaseline') ?? people.find((person) => person.id === personId)?.weeklyHours ?? 40,
      notes: value(row, 'new_notes', 'cr714_notes') ?? '',
    };
  });

  const demand = rows['demands.csv'].map((row, index) => {
    const projectId = projectsIndex.get(value(row, 'new_projectid', '_new_projectid_value'));
    const personId = peopleIndex.get(value(row, 'new_personid', '_new_personid_value'));
    const person = personId ? people.find((candidate) => candidate.id === personId) : undefined;
    // Assignments rarely set their own function; fall back to the person's function, which itself
    // falls back to their department's function via the department \u2192 function relationship above.
    const functionId = functionsIndex.get(value(row, 'new_functionid', '_new_functionid_value')) ?? person?.functionId;
    const weeks = weeksValue(row, 'cr714_demandhours', 'new_demandhours');
    return {
      id: isGuid(value(row, 'new_demandid')) ? value(row, 'new_demandid')! : generatedId(index, 'q'),
      projectId: projectId ?? '',
      projectName: projectName(projectId),
      personId,
      personName: personName(personId),
      functionId,
      functionName: functionRecords.find((record) => record.id === functionId)?.name ?? person?.functionName,
      demandHours: null,
      weeks,
      startWeek: weeks.findIndex((hours) => hours > 0),
      endWeek: weeks.reduce((lastWeek, hours, week) => (hours > 0 ? week : lastWeek), 0),
      status: value(row, 'new_status', 'statuscode') ?? 'Planned',
      createdOn: flexibleDateValue(row, 'CreatedOn'),
    };
  });

  // The source CSVs carry no start/end date columns; derive plausible ones from each project's
  // demand schedule so timeline-based analytics (e.g. percent complete) have something to show.
  const maxEndWeekByProject = new Map<string, number>();
  for (const row of demand) {
    if (!row.projectId || row.endWeek < 0) continue;
    maxEndWeekByProject.set(row.projectId, Math.max(maxEndWeekByProject.get(row.projectId) ?? 0, row.endWeek));
  }
  const hashWeeksAgo = (id: string) => {
    const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
    return 4 + (sum % 37); // 4-40 weeks in the past, stable per project id.
  };
  for (const project of projects) {
    const maxEndWeek = maxEndWeekByProject.get(project.id);
    if (maxEndWeek === undefined) continue;
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - hashWeeksAgo(project.id) * 7);
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + maxEndWeek * 7);
    project.startDate = start.toISOString().slice(0, 10);
    project.endDate = end.toISOString().slice(0, 10);
  }

  return {
    departments,
    people,
    users,
    projects,
    requests,
    functions: functionRecords.map(({ id, name }) => ({ id, name: name ?? 'Unnamed function' })),
    categories: categoryRecords.map(({ row, id, name }) => ({
      id,
      name: name ?? 'Unnamed category',
      weight: numberValue(row, 'cr714_categoryweight') ?? 1,
      parent: value(row, 'cr714_categorytype') === 'Complexity' ? 'Complexity' : 'Impact',
      categoryType: value(row, 'cr714_categorytype') ?? 'Importance',
      notes: value(row, 'cr714_notes'),
      isActive: booleanValue(row, 'cr714_isactive'),
    })),
    capacity,
    demand,
    programs: programRecords,
    locations: locationRecords,
    sites: siteRecords,
    skillsets: skillsetRecords,
    questions: rows['questions.csv'].map((row, index) => ({
      id: value(row, 'cr714__questionsid', 'cr714_questionsid') ?? generatedId(index, 'q'),
      text: value(row, 'cr714_questiontext', 'cr714_name') ?? 'Untitled question',
      categoryId: value(row, 'cr714_categoryid', '_cr714_category_value'),
      weight: numberValue(row, 'cr714_questionweight', 'cr714_weight') ?? 1,
      sequence: numberValue(row, 'cr714_sequence', 'importsequencenumber') ?? index,
      answerType: 'score',
      isActive: booleanValue(row, 'cr714_isactive'),
      required: booleanValue(row, 'cr714_required'),
      metric: value(row, 'cr714_metric'),
      helpText: value(row, 'cr714_questionhelptext'),
      subtitle: value(row, 'cr714_questionsubtitle'),
      options: [0, 1, 5, 10, 15].map((score) => ({
        score,
        label: ({ 0: 'No impact', 1: 'Low impact', 5: 'Moderate impact', 10: 'High impact', 15: 'Critical impact' } as Record<number, string>)[score],
        text: value(row, `cr714_label${score}`) ?? '',
      })),
    })),
    answers: rows['answers.csv'].map((row, index) => ({
      id: value(row, 'cr714__answersid', 'cr714_answersid') ?? generatedId(index, 'a'),
      questionId: value(row, 'cr714_questionid', '_cr714_question_value') ?? '',
      requestId: value(row, 'cr714_parentid', '_cr714_request_value') ?? '',
      value: value(row, 'cr714_response') ?? '',
      score: numberValue(row, 'cr714_basescore') ?? 0,
      comment: value(row, 'cr714_explanation') ?? '',
      justification: value(row, 'cr714_explanation') ?? '',
      methodology: value(row, 'cr714_howcalculated') ?? '',
    })),
  };
}

export type DemoData = ReturnType<typeof loadDemoData>;
export type DemoCollection = keyof DemoData;

export interface DemoDemandCategory {
  id: string;
  name: string;
  isActive: boolean;
}

export interface DemoDemandSubcategory extends DemoDemandCategory {
  categoryId: string;
}

export interface DemoNonProjectDemand {
  id: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  personId: string;
  departmentId: string;
  description: string;
  weeks: number[];
  pastWeeks?: number[];
  isActive: boolean;
}

export interface DemoUser {
  UserId: string;
  DisplayName: string;
  Email: string;
  Department: string;
  Manager: string;
  Location: string;
  Active: boolean;
}

const nonProjectDemandHierarchy = [
  ['Production Support', ['Batch Execution', 'Manufacturing Operations', 'Floor Support', 'Troubleshooting', 'Production Scheduling', 'MPS Support', 'Material/Supply']],
  ['Administrative / Development', ['Tier Board Support', 'Governance', 'Reporting/KPI tracking', 'Meetings', 'Training/Upskilling', 'Time Off', 'Development activities']],
  ['Testing / Lab Support', ['QC & Sample Testing', 'Method Development', 'Analytical/Lab Support', 'Stability/Environmental', 'QA Batch Review']],
  ['Engineering & Technical Support', ['Preventative/Corrective Maintenance', 'Work Orders', 'Equipment Troubleshooting', 'Break/Fix', 'Validation Maintenance', 'Qualification', 'Feasibility Assessments', 'Ad Hoc SME Support']],
  ['Operational Services', ['Manufacturing Sciences Floor Support', 'Material Qualification / Suppliers', 'Regulatory Request', 'Document Revisions']],
  ['CI / Optimization', ['CI Initiatives', 'Process Improvements', 'Cost Reductions', 'Yield Improvements', 'AOS Maturity', 'Waste Reduction']],
  ['Quality', ['Non-Project Change Controls', 'CAPAs', 'Investigations', 'Deviations', 'Agency Commitments', 'Regulatory Audits']],
  ['EHS', ['EHS CAPAs', 'Environmental Compliance']],
  ['Just Do Its', ['BetterWay', 'Minor Document Updates', 'Quick Wins']],
  ['Functional Projects', ['Automation Improvements']],
  ['SPOT Projects', ['Tech Transfers', 'Asset Replacements', 'Building Modifications', 'Automation Systems']],
] as const;

const weeksOf = (hours: number, count: number) =>
  new Array(1333).fill(0).map((_, index) => (index < count ? hours : 0));

const seededDemandId = (family: 1 | 2, value: number) =>
  `c${family}${String(value).padStart(6, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;

export interface DemoSkillCategory {
  id: string;
  name: string;
  isActive: boolean;
}

export interface DemoSkill {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  isActive: boolean;
}

export interface DemoPersonSkill {
  id: string;
  personId: string;
  skillId: string;
  skillName: string;
  categoryId: string;
  categoryName: string;
}

const SKILL_CATEGORY_NAMES = [
  'Certifications',
  'Software & Systems',
  'Engineering & Equipment',
  'Project & Program Management',
  'Process & Quality',
  'General',
] as const;

/** Seeds the skill repository from demo-data/skillsets.csv, grouped into starter categories. */
const SKILL_CATEGORY_BY_NAME: Record<string, (typeof SKILL_CATEGORY_NAMES)[number]> = {
  'agile certified practitioner': 'Certifications',
  pmp: 'Certifications',
  'certified scrum master': 'Certifications',
  'lss green belt': 'Certifications',
  sap: 'Software & Systems',
  powerapps: 'Software & Systems',
  'powerapps development': 'Software & Systems',
  'process control systems': 'Software & Systems',
  'building control systems': 'Software & Systems',
  'data analytics': 'Software & Systems',
  bioreactors: 'Engineering & Equipment',
  'filter integrity testers (fit)': 'Engineering & Equipment',
  'instrument qualification': 'Engineering & Equipment',
  calibration: 'Engineering & Equipment',
  metrology: 'Engineering & Equipment',
  'process system design': 'Engineering & Equipment',
  'project management': 'Project & Program Management',
  'program management': 'Project & Program Management',
  'portfolio management': 'Project & Program Management',
  'risk management': 'Project & Program Management',
  'lean manufacturing': 'Process & Quality',
  'chage control': 'Process & Quality',
  'problem solving': 'Process & Quality',
  'preventative maintenance': 'Process & Quality',
  'supplier notification changes (snc)': 'Process & Quality',
  msc: 'Process & Quality',
  samd: 'Process & Quality',
};

const seededSkillId = (family: 3 | 4, value: number) =>
  `s${family}${String(value).padStart(6, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;

export class CsvDataService {
  private readonly data: DemoData;
  private readonly directory?: string;
  private readonly sourceRows = new Map<string, CsvRow[]>();
  private readonly recordRows = new Map<object, { file: string; row: CsvRow }>();
  private readonly nonProjectDemandCategories: DemoDemandCategory[];
  private readonly nonProjectDemandSubcategories: DemoDemandSubcategory[];
  private readonly nonProjectDemand: DemoNonProjectDemand[];
  private readonly skillCategories: DemoSkillCategory[];
  private readonly skills: DemoSkill[];
  private readonly personSkills: DemoPersonSkill[];

  public constructor(directory?: string, initialData?: DemoData) {
    this.data = initialData ?? loadDemoData(directory);
    this.directory = initialData ? undefined : directory ?? process.env.DEMO_CSV_DIR ?? path.resolve(process.cwd(), 'demo-data');
    if (this.directory) {
      for (const file of sourceFiles) this.sourceRows.set(file, readRows(this.directory, file));
      this.bindSourceRows();
    }
    this.skillCategories = SKILL_CATEGORY_NAMES.map((name, index) => ({
      id: seededSkillId(3, index + 1),
      name,
      isActive: true,
    }));
    this.skills = this.data.skillsets.map((record, index) => {
      const categoryName = SKILL_CATEGORY_BY_NAME[record.name?.toLowerCase() ?? ''] ?? 'General';
      const category = this.skillCategories.find((entry) => entry.name === categoryName) ?? this.skillCategories[this.skillCategories.length - 1];
      return {
        id: isGuid(record.id) ? record.id : seededSkillId(4, index + 1),
        categoryId: category.id,
        categoryName: category.name,
        name: record.name ?? 'Unnamed skill',
        isActive: true,
      };
    });
    this.personSkills = [];
    this.nonProjectDemandCategories = nonProjectDemandHierarchy.map(([name], index) => ({
      id: seededDemandId(1, index + 1),
      name,
      isActive: true,
    }));
    let subcategorySequence = 0;
    this.nonProjectDemandSubcategories = nonProjectDemandHierarchy.flatMap(([, names], categoryIndex) =>
      names.map((name) => {
        subcategorySequence += 1;
        return {
          id: seededDemandId(2, subcategorySequence),
          categoryId: this.nonProjectDemandCategories[categoryIndex].id,
          name,
          isActive: true,
        };
      }),
    );
    this.nonProjectDemand = [
      {
        id: 'a1000001-0000-4000-8000-000000000001',
        categoryId: this.nonProjectDemandCategories[0].id,
        categoryName: this.nonProjectDemandCategories[0].name,
        subcategoryId: this.nonProjectDemandSubcategories[0].id,
        subcategoryName: this.nonProjectDemandSubcategories[0].name,
        personId: this.data.people[0]?.id ?? '',
        departmentId: this.data.departments[0]?.id ?? '',
        description: 'Ongoing coverage',
        weeks: weeksOf(6, 20),
        isActive: true,
      },
      {
        id: 'a1000002-0000-4000-8000-000000000002',
        categoryId: this.nonProjectDemandCategories[1].id,
        categoryName: this.nonProjectDemandCategories[1].name,
        subcategoryId: this.nonProjectDemandSubcategories[7].id,
        subcategoryName: this.nonProjectDemandSubcategories[7].name,
        personId: this.data.people[2]?.id ?? '',
        departmentId: this.data.departments[0]?.id ?? '',
        description: 'Weekly governance sync',
        weeks: weeksOf(4, 16),
        isActive: true,
      },
    ];
    this.loadGeneratedCsvData();
  }

  private loadGeneratedCsvData(): void {
    const rows = (file: string) => this.sourceRows.get(file) ?? [];
    const boolean = (raw: string | undefined) => ['true', '1', 'yes', 'active'].includes((raw ?? '').toLowerCase());

    if (rows('demo_skill_categories.csv').length) {
      this.skillCategories.splice(0, this.skillCategories.length, ...rows('demo_skill_categories.csv').map((row) => ({
        id: row.id,
        name: row.name,
        isActive: boolean(row.isActive),
      })));
    }
    if (rows('demo_skills.csv').length) {
      this.skills.splice(0, this.skills.length, ...rows('demo_skills.csv').map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        name: row.name,
        isActive: boolean(row.isActive),
      })));
    }
    if (rows('demo_person_skills.csv').length) {
      this.personSkills.splice(0, this.personSkills.length, ...rows('demo_person_skills.csv').map((row) => ({
        id: row.id,
        personId: row.personId,
        skillId: row.skillId,
        skillName: row.skillName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
      })));
    }
    if (rows('demo_non_project_categories.csv').length) {
      this.nonProjectDemandCategories.splice(0, this.nonProjectDemandCategories.length, ...rows('demo_non_project_categories.csv').map((row) => ({
        id: row.id,
        name: row.name,
        isActive: boolean(row.isActive),
      })));
    }
    if (rows('demo_non_project_subcategories.csv').length) {
      this.nonProjectDemandSubcategories.splice(0, this.nonProjectDemandSubcategories.length, ...rows('demo_non_project_subcategories.csv').map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        name: row.name,
        isActive: boolean(row.isActive),
      })));
    }
    if (rows('demo_non_project_demand.csv').length) {
      this.nonProjectDemand.splice(0, this.nonProjectDemand.length, ...rows('demo_non_project_demand.csv').map((row) => {
        const schedule = nonProjectSchedule(row);
        return {
          id: row.id,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          subcategoryId: row.subcategoryId,
          subcategoryName: row.subcategoryName,
          personId: row.personId,
          departmentId: row.departmentId,
          description: row.description,
          ...schedule,
          isActive: boolean(row.isActive),
        };
      }));
    }
  }

  private persistGenerated(file: string, records: object[]): void {
    if (!this.directory) return;
    const rows = records.map((record) => Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, Array.isArray(value) ? value.join(';') : String(value ?? '')]),
    ));
    this.sourceRows.set(file, rows);
    this.writeRows(file, rows);
  }

  public static empty(): CsvDataService {
    return new CsvDataService(undefined, {
      departments: [],
      people: [],
      users: [],
      projects: [],
      requests: [],
      functions: [],
      categories: [],
      capacity: [],
      demand: [],
      programs: [],
      locations: [],
      sites: [],
      skillsets: [],
      questions: [],
      answers: [],
    } as unknown as DemoData);
  }

  public list<Collection extends DemoCollection>(collection: Collection): DemoData[Collection] {
    return this.data[collection];
  }

  public find<Collection extends DemoCollection>(collection: Collection, recordId: string): DemoData[Collection][number] | undefined {
    return (this.data[collection] as Array<DemoData[Collection][number]>).find((record) => (record as { id?: string }).id === recordId);
  }

  public create<Collection extends DemoCollection>(collection: Collection, record: DemoData[Collection][number]): DemoData[Collection][number] {
    (this.data[collection] as Array<DemoData[Collection][number]>).push(record);
    this.persistRecord(collection, record, true);
    return record;
  }

  public update<Collection extends DemoCollection>(collection: Collection, recordId: string, changes: Record<string, unknown>) {
    const record = this.find(collection, recordId);
    if (!record) return undefined;
    Object.entries(changes).forEach(([key, value]) => {
      if (value !== undefined) (record as Record<string, unknown>)[key] = value;
    });
    this.persistRecord(collection, record);
    return record;
  }

  public remove<Collection extends DemoCollection>(collection: Collection, recordId: string): boolean {
    const records = this.data[collection] as Array<{ id: string }>;
    const index = records.findIndex((record) => record.id === recordId);
    if (index < 0) return false;
    const record = records[index];
    records.splice(index, 1);
    this.persistRemoval(collection, record);
    return true;
  }

  public updateWeeks<Collection extends 'capacity' | 'demand'>(collection: Collection, recordId: string, changes: Record<string, unknown>) {
    const record = this.find(collection, recordId) as (DemoData[Collection][number] & { weeks: number[] }) | undefined;
    if (!record) return undefined;
    const { week, startWeek, endWeek, hours } = changes;
    if (Number.isFinite(week)) {
      record.weeks[Number(week)] = Number(hours);
    } else if (Number.isFinite(startWeek) && Number.isFinite(endWeek)) {
      for (let index = Number(startWeek); index <= Number(endWeek) && index < record.weeks.length; index += 1) {
        record.weeks[index] = Number(hours);
      }
    }
    this.persistRecord(collection, record);
    return record;
  }

  private bindSourceRows(): void {
    const bindings: Array<[DemoCollection, string]> = [
      ['departments', 'departments.csv'], ['people', 'people.csv'], ['projects', 'projects.csv'],
      ['requests', 'requests.csv'], ['capacity', 'capacities.csv'], ['demand', 'demands.csv'],
      ['programs', 'programs.csv'], ['functions', 'functions.csv'], ['locations', 'locations.csv'],
      ['sites', 'sites.csv'], ['categories', 'categories.csv'], ['questions', 'questions.csv'],
      ['answers', 'answers.csv'], ['skillsets', 'skillsets.csv'],
    ];
    for (const [collection, file] of bindings) {
      const records = this.data[collection] as unknown as object[];
      const rows = this.sourceRows.get(file) ?? [];
      records.forEach((record, index) => {
        const row = rows[index];
        if (row) this.recordRows.set(record, { file, row });
      });
    }
  }

  private persistRecord(collection: DemoCollection, record: unknown, isNew = false): void {
    try {
      const binding = this.recordRows.get(record as object);
      const file = binding?.file ?? this.fileFor(collection);
      if (!file || !this.directory) return;
      const rows = this.sourceRows.get(file) ?? [];
      const template = rows[0] ?? {};
      const row = binding?.row ?? Object.fromEntries(Object.keys(template).map((header) => [header, '']));
      if (isNew || !binding) rows.push(row);
      this.writeRecord(collection, record as Record<string, unknown>, row);
      if (!binding) this.recordRows.set(record as object, { file, row });
      this.sourceRows.set(file, rows);
      this.writeRows(file, rows);
    } catch (error) {
      // Never let CSV persistence failures break an otherwise-successful in-memory edit.
      console.warn(`Could not persist ${collection} record; the change is kept in memory only.`, error);
    }
  }

  private persistRemoval(_collection: DemoCollection, record: unknown): void {
    const binding = this.recordRows.get(record as object);
    if (!binding || !this.directory) return;
    const rows = this.sourceRows.get(binding.file) ?? [];
    const index = rows.indexOf(binding.row);
    if (index >= 0) rows.splice(index, 1);
    this.recordRows.delete(record as object);
    this.writeRows(binding.file, rows);
  }

  private fileFor(collection: DemoCollection): string | undefined {
    return ({
      departments: 'departments.csv', people: 'people.csv', projects: 'projects.csv', requests: 'requests.csv',
      capacity: 'capacities.csv', demand: 'demands.csv', programs: 'programs.csv', functions: 'functions.csv',
      locations: 'locations.csv', sites: 'sites.csv', categories: 'categories.csv', questions: 'questions.csv',
      answers: 'answers.csv', skillsets: 'skillsets.csv',
    } as Partial<Record<DemoCollection, string>>)[collection];
  }

  private writeRecord(collection: DemoCollection, record: Record<string, unknown>, row: CsvRow): void {
    const fields: Partial<Record<DemoCollection, Record<string, string[]>>> = {
      departments: {
        id: ['new_departmentid'],
        name: ['new_name', 'new_departmentname'],
        code: ['new_code', 'new_departmentcode'],
        isActive: ['new_isactive'],
        leadPersonId: ['new_departmentlead.azureactivedirectoryobjectid', 'new_departmentlead', '_new_departmentlead_value'],
        lastCheckIn: ['new_lastcheckin', 'new_lastupdated'],
      },
      people: { id: ['new_peopleid'], name: ['new_name'], email: ['new_email'], role: ['new_role', 'new_roles'], title: ['new_title'], employmentType: ['new_employeetype', 'new_employmenttype'], weeklyHours: ['new_weeklyhours', 'cr714_weeklyhours'], isActive: ['new_isactive'], departmentId: ['new_departmentsid', '_new_departmentsid_value'], functionId: ['new_functionid', '_new_functionid_value'] },
      projects: {
        id: ['new_projectsid'],
        name: ['new_name', 'new_projectname'],
        code: ['new_projectcode', 'new_code'],
        status: ['new_status'],
        isActive: ['cr714_isactive'],
        priorityScore: ['new_priorityscore', 'cr714_priorityscore'],
        problemStatement: ['new_problemstatement', 'cr714_problemstatement'],
        startDate: ['new_startdate'],
        endDate: ['new_enddate'],
        departmentId: ['new_departmentid', '_new_departmentid_value'],
        managerPersonId: ['new_projectmanager.azureactivedirectoryobjectid', 'new_projectmanager', '_new_projectmanager_value'],
        sponsorPersonId: ['cr714_sponsor.azureactivedirectoryobjectid', 'cr714_sponsor', '_cr714_sponsor_value'],
        lastCheckIn: ['new_lastupdated', 'new_lastcheckin'],
        spotId: ['new_spotid'],
      },
      requests: {
        id: ['cr714__requestsid'],
        shortTitle: ['cr714_shorttitle'],
        title: ['cr714_title', 'cr714_name'],
        phase: ['cr714_phase', 'cr714_workflowstep'],
        status: ['cr714_status'],
        disposition: ['cr714_disposition'],
        location: ['cr714_location'],
        isActive: ['cr714_isactive'],
        priorityScore: ['cr714_priorityscore'],
        neededBy: ['cr714_whenneeded'],
        neededByJustification: ['cr714_whenneededjustification'],
        currentState: ['cr714_currentstate'],
        discoveryMethod: ['cr714_howdiscovered'],
        impactToOperations: ['cr714_impact'],
        desiredFutureState: ['cr714_desiredfuturestate'],
        additionalInformation: ['cr714_additionalinformation'],
        sponsorNameFlat: ['cr714_sponsornameflat'],
        departmentId: ['cr714_departmentid', '_cr714_departmentid_value'],
      },
      capacity: { id: ['new_capacityid'], weeklyBaseline: ['new_weeklybaseline', 'cr714_weeklybaseline'], notes: ['new_notes', 'cr714_notes'], weeks: ['cr714_availabilityhours', 'new_availabilityhours'] },
      demand: { id: ['new_demandid'], status: ['new_status'], weeks: ['cr714_demandhours', 'new_demandhours'] },
      programs: { name: ['cr714_name', 'cr714_longname'] }, functions: { name: ['new_name', 'new_functionname'] },
      locations: { name: ['cr714_name'] }, sites: { name: ['new_name', 'new_sitename'] }, skillsets: { name: ['new_name'] },
      categories: { name: ['cr714_name'], weight: ['cr714_categoryweight'], parent: ['cr714_categorytype'], categoryType: ['cr714_categorytype'], notes: ['cr714_notes'], isActive: ['cr714_isactive'] },
      questions: {
        id: ['cr714__questionsid', 'cr714_questionsid'], text: ['cr714_name', 'cr714_questiontext'],
        categoryId: ['cr714_categoryid'], weight: ['cr714_questionweight', 'cr714_weight'], sequence: ['importsequencenumber', 'cr714_sequence'],
        isActive: ['cr714_isactive'], required: ['cr714_required'], metric: ['cr714_metric'], helpText: ['cr714_questionhelptext'],
        subtitle: ['cr714_questionsubtitle'],
      },
      answers: {
        id: ['cr714__answersid', 'cr714_answersid'], questionId: ['cr714_questionid'], requestId: ['cr714_parentid'],
        value: ['cr714_response'], score: ['cr714_basescore'], comment: ['cr714_explanation'], justification: ['cr714_explanation'], methodology: ['cr714_howcalculated'],
      },
    };
    for (const [key, value] of Object.entries(record)) {
      const candidates = fields[collection]?.[key];
      if (!candidates) continue;
      const column = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(row, candidate));
      if (column) row[column] = key === 'weeks' && Array.isArray(value) ? value.join(';') : String(value ?? '');
    }
  }

  private writeRows(file: string, rows: CsvRow[]): void {
    const headers = rows.length ? Object.keys(rows[0]) : Object.keys(this.sourceRows.get(file)?.[0] ?? {});
    if (!this.directory || !headers.length) return;
    const quote = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const text = [headers.join(','), ...rows.map((row) => headers.map((header) => quote(row[header] ?? '')).join(','))].join('\n') + '\n';
    try {
      fs.writeFileSync(path.join(this.directory, file), text, 'utf8');
    } catch (error) {
      // Edits still apply in-memory for the session even if the CSV is locked (e.g. open in Excel).
      console.warn(`Could not write ${file} back to disk; the change is kept in memory only.`, error);
    }
  }

  public findPersonByEmail(email: string | undefined) {
    return this.list('people').find((person) => person.email === email) ?? this.list('people')[this.list('people').length - 1];
  }

  public listUsers(): DemoUser[] {
    return this.data.users;
  }

  public findUser(userId: string): DemoUser | undefined {
    return this.data.users.find((user) => user.UserId === userId);
  }

  public findUserByEmail(email: string | undefined): DemoUser | undefined {
    return this.data.users.find((user) => user.Email === email) ?? this.data.users[this.data.users.length - 1];
  }

  public listCapacity(): DemoData['capacity'] {
    return this.data.capacity;
  }

  public listDemand(): DemoData['demand'] {
    return this.data.demand;
  }

  public getPortfolioSummary() {
    const availability = this.data.capacity.reduce<number[]>(
      (total, row) => row.weeks.map((value, index) => (total[index] ?? 0) + value),
      new Array(1333).fill(0),
    );
    const demand = this.data.demand.reduce<number[]>(
      (total, row) => row.weeks.map((value, index) => (total[index] ?? 0) + value),
      new Array(1333).fill(0),
    );
    return {
      projectCount: this.data.projects.length,
      requestCount: this.data.requests.length,
      peopleWithCapacity: this.data.people.length,
      demandRows: this.data.demand.length,
      availability,
      demand,
      net: availability.map((value, index) => value - demand[index]),
    };
  }

  public filterBy<Collection extends DemoCollection>(collection: Collection, predicate: (record: DemoData[Collection][number]) => boolean) {
    return this.list(collection).filter(predicate);
  }

  public listSkillCategories(): DemoSkillCategory[] {
    return this.skillCategories;
  }

  public findSkillCategory(categoryId: string): DemoSkillCategory | undefined {
    return this.skillCategories.find((category) => category.id === categoryId);
  }

  public createSkillCategory(name: string): DemoSkillCategory {
    const category = { id: seededSkillId(3, this.skillCategories.length + 100), name, isActive: true };
    this.skillCategories.push(category);
    this.persistGenerated('demo_skill_categories.csv', this.skillCategories);
    return category;
  }

  public updateSkillCategory(categoryId: string, changes: Partial<Pick<DemoSkillCategory, 'name' | 'isActive'>>): DemoSkillCategory | undefined {
    const category = this.findSkillCategory(categoryId);
    if (!category) return undefined;
    if (changes.name !== undefined) category.name = changes.name;
    if (changes.isActive !== undefined) category.isActive = changes.isActive;
    this.persistGenerated('demo_skill_categories.csv', this.skillCategories);
    return category;
  }

  public listSkills(categoryId?: string): DemoSkill[] {
    return this.skills.filter((skill) => !categoryId || skill.categoryId === categoryId);
  }

  public findSkill(skillId: string): DemoSkill | undefined {
    return this.skills.find((skill) => skill.id === skillId);
  }

  public createSkill(categoryId: string, name: string): DemoSkill {
    const category = this.findSkillCategory(categoryId);
    const skill = {
      id: seededSkillId(4, this.skills.length + 1000),
      categoryId: category?.id ?? categoryId,
      categoryName: category?.name ?? 'General',
      name,
      isActive: true,
    };
    this.skills.push(skill);
    this.persistGenerated('demo_skills.csv', this.skills);
    return skill;
  }

  public updateSkill(skillId: string, changes: Partial<Pick<DemoSkill, 'name' | 'isActive'>>): DemoSkill | undefined {
    const skill = this.findSkill(skillId);
    if (!skill) return undefined;
    if (changes.name !== undefined) skill.name = changes.name;
    if (changes.isActive !== undefined) skill.isActive = changes.isActive;
    this.persistGenerated('demo_skills.csv', this.skills);
    return skill;
  }

  public listPersonSkills(personId: string): DemoPersonSkill[] {
    return this.personSkills.filter((row) => row.personId === personId);
  }

  public addPersonSkill(personId: string, skillId: string): DemoPersonSkill | undefined {
    const existing = this.personSkills.find((row) => row.personId === personId && row.skillId === skillId);
    if (existing) return existing;
    const skill = this.findSkill(skillId);
    if (!skill) return undefined;
    const record: DemoPersonSkill = {
      id: seededSkillId(4, this.personSkills.length + 5000),
      personId,
      skillId: skill.id,
      skillName: skill.name,
      categoryId: skill.categoryId,
      categoryName: skill.categoryName,
    };
    this.personSkills.push(record);
    this.persistGenerated('demo_person_skills.csv', this.personSkills);
    return record;
  }

  public removePersonSkill(personId: string, skillId: string): boolean {
    const index = this.personSkills.findIndex((row) => row.personId === personId && row.skillId === skillId);
    if (index < 0) return false;
    this.personSkills.splice(index, 1);
    this.persistGenerated('demo_person_skills.csv', this.personSkills);
    return true;
  }

  public listNonProjectDemandCategories(): DemoDemandCategory[] {
    return this.nonProjectDemandCategories;
  }

  public findNonProjectDemandCategory(categoryId: string): DemoDemandCategory | undefined {
    return this.nonProjectDemandCategories.find((category) => category.id === categoryId);
  }

  public updateNonProjectDemandCategory(categoryId: string, changes: Partial<Pick<DemoDemandCategory, 'name' | 'isActive'>>): DemoDemandCategory | undefined {
    const category = this.findNonProjectDemandCategory(categoryId);
    if (!category) return undefined;
    if (changes.name !== undefined) category.name = changes.name;
    if (changes.isActive !== undefined) category.isActive = changes.isActive;
    this.persistGenerated('demo_non_project_categories.csv', this.nonProjectDemandCategories);
    return category;
  }

  public createNonProjectDemandCategory(name: string): DemoDemandCategory {
    const category = { id: seededDemandId(1, this.nonProjectDemandCategories.length + 20), name, isActive: true };
    this.nonProjectDemandCategories.push(category);
    this.persistGenerated('demo_non_project_categories.csv', this.nonProjectDemandCategories);
    return category;
  }

  public listNonProjectDemandSubcategories(categoryId?: string): DemoDemandSubcategory[] {
    return this.nonProjectDemandSubcategories.filter((subcategory) => !categoryId || subcategory.categoryId === categoryId);
  }

  public findNonProjectDemandSubcategory(subcategoryId: string): DemoDemandSubcategory | undefined {
    return this.nonProjectDemandSubcategories.find((subcategory) => subcategory.id === subcategoryId);
  }

  public updateNonProjectDemandSubcategory(subcategoryId: string, changes: Partial<Pick<DemoDemandSubcategory, 'name' | 'isActive'>>): DemoDemandSubcategory | undefined {
    const subcategory = this.findNonProjectDemandSubcategory(subcategoryId);
    if (!subcategory) return undefined;
    if (changes.name !== undefined) subcategory.name = changes.name;
    if (changes.isActive !== undefined) subcategory.isActive = changes.isActive;
    this.persistGenerated('demo_non_project_subcategories.csv', this.nonProjectDemandSubcategories);
    return subcategory;
  }

  public createNonProjectDemandSubcategory(categoryId: string, name: string): DemoDemandSubcategory {
    const subcategory = { id: seededDemandId(2, this.nonProjectDemandSubcategories.length + 40), categoryId, name, isActive: true };
    this.nonProjectDemandSubcategories.push(subcategory);
    this.persistGenerated('demo_non_project_subcategories.csv', this.nonProjectDemandSubcategories);
    return subcategory;
  }

  public listNonProjectDemand(personId?: string, departmentId?: string): DemoNonProjectDemand[] {
    return this.nonProjectDemand.filter((row) => (!personId || row.personId === personId) && (!departmentId || row.departmentId === departmentId));
  }

  public findNonProjectDemand(recordId: string): DemoNonProjectDemand | undefined {
    return this.nonProjectDemand.find((row) => row.id === recordId);
  }

  public updateNonProjectDemandWeeks(recordId: string, changes: Record<string, unknown>): DemoNonProjectDemand | undefined {
    const record = this.findNonProjectDemand(recordId);
    if (!record) return undefined;
    const { week, startWeek, endWeek, hours } = changes;
    if (Number.isFinite(week)) record.weeks[Number(week)] = Number(hours);
    else if (Number.isFinite(startWeek) && Number.isFinite(endWeek)) {
      for (let index = Number(startWeek); index <= Number(endWeek) && index < record.weeks.length; index += 1) record.weeks[index] = Number(hours);
    }
    this.persistGenerated('demo_non_project_demand.csv', this.nonProjectDemand);
    return record;
  }

  public createNonProjectDemand(record: DemoNonProjectDemand): DemoNonProjectDemand {
    this.nonProjectDemand.push(record);
    this.persistGenerated('demo_non_project_demand.csv', this.nonProjectDemand);
    return record;
  }

  public updateNonProjectDemand(recordId: string, changes: Partial<Pick<DemoNonProjectDemand, 'isActive' | 'description'>>): DemoNonProjectDemand | undefined {
    const record = this.findNonProjectDemand(recordId);
    if (!record) return undefined;
    if (changes.isActive !== undefined) record.isActive = changes.isActive;
    if (changes.description !== undefined) record.description = changes.description;
    this.persistGenerated('demo_non_project_demand.csv', this.nonProjectDemand);
    return record;
  }

  public removeNonProjectDemand(recordId: string): boolean {
    const index = this.nonProjectDemand.findIndex((row) => row.id === recordId);
    if (index < 0) return false;
    this.nonProjectDemand.splice(index, 1);
    this.persistGenerated('demo_non_project_demand.csv', this.nonProjectDemand);
    return true;
  }
}
