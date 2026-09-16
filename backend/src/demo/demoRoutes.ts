import { Router } from 'express';
import { env } from '../config/env';
import { signToken } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';

/**
 * In-memory sample data used only when DEMO_MODE=true, so the UI can be reviewed
 * without Dataverse credentials. Never mounted when DEMO_MODE is off.
 */
/** Table prefixes mapped to hex so generated ids are valid GUIDs. */
const HEX_PREFIX: Record<string, string> = { d: 'd', p: 'a', f: 'f', j: 'b', r: 'c', c: 'e', u: '9' };

const id = (n: number, prefix: string) =>
  `${HEX_PREFIX[prefix] ?? 'a'}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`.slice(0, 36);

const departments = [
  { id: id(1, 'd'), name: 'Engineering', code: 'ENG', leadPersonId: id(1, 'p'), leadName: 'Avery Lane', delegatePersonId: id(8, 'p'), delegateName: 'Ronn Gerra', functionId: id(1, 'f'), functionName: 'Software Engineering', lastCheckIn: '2026-09-04', isActive: true },
  { id: id(2, 'd'), name: 'Data & Analytics', code: 'DNA', leadPersonId: id(2, 'p'), leadName: 'Bilal Ahmed', functionId: id(2, 'f'), functionName: 'Analytics', lastCheckIn: '2026-08-21', isActive: true },
  { id: id(3, 'd'), name: 'Quality', code: 'QA', leadPersonId: id(4, 'p'), leadName: 'Dana Ortiz', functionId: id(3, 'f'), functionName: 'Quality Assurance', lastCheckIn: '2026-09-09', isActive: true },
  { id: id(4, 'd'), name: 'Regulatory Affairs', code: 'REG', leadPersonId: id(5, 'p'), leadName: 'Elena Petrova', functionId: id(4, 'f'), functionName: 'Regulatory', lastCheckIn: '2026-06-30', isActive: false },
];

const people = [
  { id: id(1, 'p'), name: 'Avery Lane', email: 'avery.lane@example.com', role: 'availability_moderator;demand_moderator', title: 'Engineering Lead', employmentType: 'FTE', weeklyHours: 40, isActive: true, departmentId: id(1, 'd'), departmentName: 'Engineering', functionId: id(1, 'f'), functionName: 'Software Engineering' },
  { id: id(2, 'p'), name: 'Bilal Ahmed', email: 'bilal.ahmed@example.com', role: 'availability_moderator', title: 'Analytics Lead', employmentType: 'FTE', weeklyHours: 40, isActive: true, departmentId: id(2, 'd'), departmentName: 'Data & Analytics', functionId: id(2, 'f'), functionName: 'Analytics' },
  { id: id(3, 'p'), name: 'Chen Wu', email: 'chen.wu@example.com', role: 'user', title: 'Senior Developer', employmentType: 'Contractor', weeklyHours: 36, isActive: true, departmentId: id(1, 'd'), departmentName: 'Engineering', functionId: id(1, 'f'), functionName: 'Software Engineering' },
  { id: id(4, 'p'), name: 'Dana Ortiz', email: 'dana.ortiz@example.com', role: 'admin;demand_moderator', title: 'Quality Manager', employmentType: 'FTE', weeklyHours: 32, isActive: true, departmentId: id(3, 'd'), departmentName: 'Quality', functionId: id(3, 'f'), functionName: 'Quality Assurance' },
  { id: id(5, 'p'), name: 'Elena Petrova', email: 'elena.petrova@example.com', role: 'user', title: 'Regulatory Specialist', employmentType: 'FTE', weeklyHours: 40, isActive: false, departmentId: id(4, 'd'), departmentName: 'Regulatory Affairs', functionId: id(4, 'f'), functionName: 'Regulatory' },
  { id: id(6, 'p'), name: 'Farid Haddad', email: 'farid.haddad@example.com', role: 'user', title: 'Data Engineer', employmentType: 'Contractor', weeklyHours: 40, isActive: true, departmentId: id(2, 'd'), departmentName: 'Data & Analytics', functionId: id(2, 'f'), functionName: 'Analytics' },
  { id: id(7, 'p'), name: 'Grace Kim', email: 'grace.kim@example.com', role: 'demand_moderator', title: 'Program Manager', employmentType: 'FTE', weeklyHours: 40, isActive: true, departmentId: id(1, 'd'), departmentName: 'Engineering', functionId: id(1, 'f'), functionName: 'Software Engineering' },
  { id: id(8, 'p'), name: 'Ronn Gerra', email: 'ronn.gerra@takeda.com', role: 'admin;demand_moderator', title: 'Resource Management Lead', employmentType: 'FTE', weeklyHours: 40, isActive: true, departmentId: id(1, 'd'), departmentName: 'Engineering', functionId: id(1, 'f'), functionName: 'Software Engineering' },
];

const projects = [
  { id: id(1, 'j'), name: 'ClearPath Rollout', code: 'CP-001',
      started: true,
        spotId: 'SPOT-10241', status: 'Active', isActive: true, priorityScore: 78.5, managerPersonId: id(1, 'p'), managerName: 'Avery Lane', sponsorPersonId: id(4, 'p'), sponsorName: 'Dana Ortiz', delegatePersonId: id(7, 'p'), delegateName: 'Grace Kim', lastCheckIn: '2026-09-08', departmentId: id(1, 'd'), departmentName: 'Engineering', startDate: '2026-04-06', endDate: '2026-12-18', problemStatement: 'Resource plans live in disconnected spreadsheets, so allocations are reworked every month.' },
  { id: id(2, 'j'), name: 'Capacity Signal Dashboard', code: 'CP-002',
      started: false,
        spotId: 'SPOT-10388', status: 'Planning', isActive: true, priorityScore: 64, managerPersonId: id(7, 'p'), managerName: 'Grace Kim', sponsorPersonId: id(8, 'p'), sponsorName: 'Ronn Gerra', lastCheckIn: '2026-08-27', departmentId: id(2, 'd'), departmentName: 'Data & Analytics', startDate: '2026-09-01', endDate: '2027-03-31', problemStatement: 'Leads cannot see over-allocation until delivery slips.' },
  { id: id(3, 'j'), name: 'Batch Release Automation', code: 'CP-003',
      started: true,
        spotId: 'SPOT-10077', status: 'Active', isActive: true, priorityScore: 71.25, managerPersonId: id(4, 'p'), managerName: 'Dana Ortiz', sponsorPersonId: id(1, 'p'), sponsorName: 'Avery Lane', delegatePersonId: id(8, 'p'), delegateName: 'Ronn Gerra', lastCheckIn: '2026-09-10', departmentId: id(3, 'd'), departmentName: 'Quality', startDate: '2026-02-02', endDate: '2026-11-27', problemStatement: 'Batch release paperwork is manual and delays product disposition.' },
  { id: id(4, 'j'), name: 'Supplier Portal Refresh', code: 'CP-004',
      started: false,
        spotId: 'SPOT-10512', status: 'On hold', isActive: false, priorityScore: 42, managerPersonId: id(7, 'p'), managerName: 'Grace Kim', sponsorPersonId: id(4, 'p'), sponsorName: 'Dana Ortiz', lastCheckIn: '2026-05-19', departmentId: id(1, 'd'), departmentName: 'Engineering', startDate: '2026-01-12', endDate: '2026-10-30', problemStatement: 'Suppliers submit documentation by email, creating audit gaps.' },
];

const requests = [
  { id: id(1, 'r'), shortTitle: 'Staffing spreadsheet rework',
        spotId: 'SPOT-10241', title: 'Manual staffing spreadsheets cause rework', phase: 'Processed', status: 'Approved', isActive: true, priorityScore: 78.5, requesterPersonId: id(1, 'p'), requesterName: 'Avery Lane', departmentId: id(1, 'd'), departmentName: 'Engineering', submittedOn: '2026-03-11T09:12:00Z', projectId: id(1, 'j'), problemStatement: 'Resource plans live in disconnected spreadsheets, so department leads and project managers work from different numbers.', businessCase: 'Consolidate planning into one model.', expectedBenefit: 'Reduce planning effort by 30%.' },
  { id: id(2, 'r'), shortTitle: 'Over-allocation blind spot',
        spotId: 'SPOT-10388', title: 'No visibility into over-allocated staff', phase: 'SG1 Review', status: 'Submitted', isActive: true, priorityScore: 64, requesterPersonId: id(3, 'p'), requesterName: 'Chen Wu', delegatePersonId: id(4, 'p'), delegateName: 'Dana Ortiz', departmentId: id(2, 'd'), departmentName: 'Data & Analytics', submittedOn: '2026-07-02T14:40:00Z', problemStatement: 'Individuals are committed beyond their available hours without anyone seeing it until delivery slips.', businessCase: 'Weekly supply vs demand view.', expectedBenefit: 'Fewer late projects.' },
  { id: id(3, 'r'), shortTitle: 'Audit trail for suppliers',
        spotId: 'SPOT-10512', title: 'Supplier documents arrive by email with no audit trail', phase: 'DQ Check', status: 'Submitted', isActive: true, priorityScore: 42, requesterPersonId: id(4, 'p'), requesterName: 'Dana Ortiz',
        delegatePersonId: id(8, 'p'),
        delegateName: 'Ronn Gerra', departmentId: id(3, 'd'), departmentName: 'Quality', submittedOn: '2026-08-19T08:05:00Z', problemStatement: 'Supplier documentation is emailed and stored inconsistently, creating audit findings.', businessCase: 'Central supplier portal.', expectedBenefit: 'Close audit gap.' },
  { id: id(4, 'r'), shortTitle: 'Late CAPA escalation', title: 'CAPA escalations are noticed too late', phase: 'Draft', status: 'Submitted', isActive: true, priorityScore: 0, requesterPersonId: id(5, 'p'), requesterName: 'Elena Petrova', departmentId: id(4, 'd'), departmentName: 'Regulatory Affairs', submittedOn: '2026-09-05T16:22:00Z', problemStatement: 'CAPA due dates are tracked manually and escalate only after they are overdue.' },
  { id: id(5, 'r'), shortTitle: 'Legacy training tracker',
        spotId: 'SPOT-09933', title: 'Retire the legacy training tracker', phase: 'Prioritization', status: 'Submitted', isActive: false, priorityScore: 18, requesterPersonId: id(6, 'p'), requesterName: 'Farid Haddad', departmentId: id(2, 'd'), departmentName: 'Data & Analytics', submittedOn: '2026-02-14T11:30:00Z', problemStatement: 'The legacy tracker duplicates the LMS and nobody maintains it.' },
  { id: id(6, 'r'), shortTitle: 'Site capacity model',
        spotId: 'SPOT-10604', title: 'Model capacity by site rather than department', phase: 'PIRT Assessment', status: 'Submitted', isActive: true, priorityScore: 55, requesterPersonId: id(8, 'p'),
        requesterName: 'Ronn Gerra', delegatePersonId: id(1, 'p'), delegateName: 'Avery Lane', departmentId: id(1, 'd'), departmentName: 'Engineering', submittedOn: '2026-08-28T13:15:00Z', problemStatement: 'Capacity is planned by department, which hides site-level constraints.' },
  { id: id(7, 'r'), shortTitle: 'Demand intake form',
        spotId: 'SPOT-10450', title: 'Standardize the demand intake form', phase: 'Configuration', status: 'Approved', isActive: true, priorityScore: 61, requesterPersonId: id(4, 'p'), requesterName: 'Dana Ortiz', departmentId: id(3, 'd'), departmentName: 'Quality', submittedOn: '2026-06-09T10:02:00Z', problemStatement: 'Every department submits demand in a different format.' },
];

const functions = [
  { id: id(1, 'f'), name: 'Software Engineering' },
  { id: id(2, 'f'), name: 'Analytics' },
  { id: id(3, 'f'), name: 'Quality Assurance' },
  { id: id(4, 'f'), name: 'Regulatory' },
];

const categories = [
  { id: id(1, 'c'), name: 'Business value', weight: 2 },
  { id: id(2, 'c'), name: 'Risk reduction', weight: 1.5 },
  { id: id(3, 'c'), name: 'Compliance', weight: 2.5 },
];

const router = Router();

function patch<T extends { id: string }>(collection: T[], recordId: string, body: Record<string, unknown>): T {
  const record = collection.find((entry) => entry.id === recordId);
  if (!record) throw new HttpError(404, 'Record not found.');
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) (record as Record<string, unknown>)[key] = value;
  }
  return record;
}

/** Mirrors the real session endpoint: identity comes from the host, not a login form. */
router.get('/auth/session', (_req, res) => {
  const person = demoPerson();
  const user = {
    userId: id(9, 'u'),
    personId: person.id,
    email: person.email,
    name: person.name,
    roles: ['admin', 'availability_moderator', 'demand_moderator', 'user'] as const,
  };
  res.json({ token: signToken({ ...user, roles: [...user.roles] }), user });
});

router.get('/departments', (_req, res) => res.json(departments));
router.get('/departments/:id', asyncHandler(async (req, res) => {
  const record = departments.find((entry) => entry.id === req.params.id);
  if (!record) throw new HttpError(404, 'Department not found.');
  res.json(record);
}));
router.post('/departments', (req, res) => {
  const record = { id: id(departments.length + 1, 'd'), isActive: true, ...req.body } as (typeof departments)[number];
  departments.push(record);
  res.status(201).json({ id: record.id });
});
router.patch('/departments/:id', asyncHandler(async (req, res) => {
  res.json(patch(departments, req.params.id, req.body));
}));

router.get('/people', (_req, res) => res.json(people));
router.get('/people/:id', asyncHandler(async (req, res) => {
  const record = people.find((entry) => entry.id === req.params.id);
  if (!record) throw new HttpError(404, 'Person not found.');
  res.json(record);
}));
router.post('/people', (req, res) => {
  const record = { id: id(people.length + 1, 'p'), isActive: true, ...req.body } as (typeof people)[number];
  people.push(record);
  res.status(201).json({ id: record.id });
});
router.patch('/people/:id', asyncHandler(async (req, res) => {
  res.json(patch(people, req.params.id, req.body));
}));

router.get('/projects', (_req, res) => res.json(projects));
router.get('/projects/:id', asyncHandler(async (req, res) => {
  const record = projects.find((entry) => entry.id === req.params.id);
  if (!record) throw new HttpError(404, 'Project not found.');
  res.json(record);
}));
router.get('/projects/:id/team', (req, res) => res.json(demand.filter((row) => row.projectId === req.params.id)));
router.post('/projects', (req, res) => {
  const record = { id: id(projects.length + 1, 'j'), ...req.body } as (typeof projects)[number];
  projects.push(record);
  res.status(201).json({ id: record.id });
});
router.patch('/projects/:id', asyncHandler(async (req, res) => {
  res.json(patch(projects, req.params.id, req.body));
}));

router.get('/requests', (req, res) => {
  if (req.query.mine !== 'true') {
    res.json(requests);
    return;
  }
  const me = demoPerson().id;
  res.json(requests.filter((row) => row.requesterPersonId === me || row.delegatePersonId === me));
});
router.get('/requests/:id', asyncHandler(async (req, res) => {
  const record = requests.find((entry) => entry.id === req.params.id);
  if (!record) throw new HttpError(404, 'Request not found.');
  res.json(record);
}));
router.patch('/requests/:id', asyncHandler(async (req, res) => {
  res.json(patch(requests, req.params.id, req.body));
}));

router.get('/lookups/functions', (_req, res) => res.json(functions));

/** Capacity and demand are mocked too, otherwise these paths fall through to Dataverse. */
const weeksOf = (hours: number, count: number) =>
  new Array(1333).fill(0).map((_, index) => (index < count ? hours : 0));

const capacity = people.map((person, index) => ({
  id: id(index + 1, 'e'),
  personId: person.id,
  personName: person.name,
  departmentId: person.departmentId,
  departmentName: person.departmentName,
  availabilityHours: null,
  weeks: weeksOf(person.weeklyHours ?? 40, 26),
  weeklyBaseline: person.weeklyHours ?? 40,
  notes: '',
}));

const demand = [
  { id: id(1, 'f'), projectId: id(1, 'j'), projectName: 'ClearPath Rollout', personId: id(8, 'p'), personName: 'Ronn Gerra', functionId: id(1, 'f'), functionName: 'Software Engineering', demandHours: null, weeks: weeksOf(12, 20), startWeek: 0, endWeek: 19, status: 'Committed' },
  { id: id(2, 'f'), projectId: id(3, 'j'), projectName: 'Batch Release Automation', personId: id(8, 'p'), personName: 'Ronn Gerra', functionId: id(3, 'f'), functionName: 'Quality Assurance', demandHours: null, weeks: weeksOf(10, 14), startWeek: 0, endWeek: 13, status: 'Planned' },
  { id: id(3, 'f'), projectId: id(1, 'j'), projectName: 'ClearPath Rollout', personId: id(3, 'p'), personName: 'Chen Wu', functionId: id(1, 'f'), functionName: 'Software Engineering', demandHours: null, weeks: weeksOf(24, 20), startWeek: 0, endWeek: 19, status: 'Committed' },
];

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

const seededDemandId = (family: 1 | 2, value: number) =>
  `c${family}${String(value).padStart(6, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;

interface DemoDemandCategory {
  id: string;
  name: string;
  isActive: boolean;
}

interface DemoDemandSubcategory extends DemoDemandCategory {
  categoryId: string;
}

const nonProjectDemandCategories: DemoDemandCategory[] = nonProjectDemandHierarchy.map(([name], index) => ({
  id: seededDemandId(1, index + 1),
  name,
  isActive: true,
}));

let subcategorySequence = 0;
const nonProjectDemandSubcategories: DemoDemandSubcategory[] = nonProjectDemandHierarchy.flatMap(([, names], categoryIndex) =>
  names.map((name) => {
    subcategorySequence += 1;
    return {
      id: seededDemandId(2, subcategorySequence),
      categoryId: nonProjectDemandCategories[categoryIndex].id,
      name,
      isActive: true,
    };
  }),
);

const nonProjectDemand = [
  {
    id: 'a1000001-0000-4000-8000-000000000001',
    categoryId: nonProjectDemandCategories[0].id,
    categoryName: nonProjectDemandCategories[0].name,
    subcategoryId: nonProjectDemandSubcategories[0].id,
    subcategoryName: nonProjectDemandSubcategories[0].name,
    personId: id(1, 'p'),
    departmentId: id(1, 'd'),
    weeks: weeksOf(6, 20),
  },
  {
    id: 'a1000002-0000-4000-8000-000000000002',
    categoryId: nonProjectDemandCategories[1].id,
    categoryName: nonProjectDemandCategories[1].name,
    subcategoryId: nonProjectDemandSubcategories[7].id,
    subcategoryName: nonProjectDemandSubcategories[7].name,
    personId: id(3, 'p'),
    departmentId: id(1, 'd'),
    weeks: weeksOf(4, 16),
  },
];

const demoPerson = () => people.find((entry) => entry.email === env.devUserEmail) ?? people[people.length - 1];

router.get('/capacity', (req, res) => {
  const personId = req.query.mine === 'true' ? demoPerson().id : String(req.query.personId ?? '');
  res.json(personId ? capacity.filter((row) => row.personId === personId) : capacity);
});

router.get('/capacity/person/:personId/net', (req, res) => {  const availability = capacity
    .filter((row) => row.personId === req.params.personId)
    .reduce<number[]>((total, row) => row.weeks.map((value, i) => (total[i] ?? 0) + value), new Array(1333).fill(0));
  const committed = demand
    .filter((row) => row.personId === req.params.personId)
    .reduce<number[]>((total, row) => row.weeks.map((value, i) => (total[i] ?? 0) + value), new Array(1333).fill(0));
  res.json({
    personId: req.params.personId,
    availability,
    demand: committed,
    net: availability.map((value, i) => value - committed[i]),
    overAllocatedWeeks: availability
      .map((value, i) => ({ week: i, over: committed[i] - value }))
      .filter((entry) => entry.over > 0),
  });
});

router.post('/capacity', (req, res) => {
  const person = people.find((entry) => entry.id === req.body?.personId);
  if (person && capacity.some((row) => row.personId === person.id)) {
    res.status(409).json({ error: 'That person already has an availability record.' });
    return;
  }
  const baseline = Number(req.body?.weeklyBaseline ?? person?.weeklyHours ?? 40);
  const weeks = Array.isArray(req.body?.weeks) && req.body.weeks.length
    ? new Array(1333).fill(0).map((_, index) => Number(req.body.weeks[index] ?? 0))
    : new Array(1333).fill(0).map((_, index) => (index < 26 ? baseline : 0));
  const record = {
    id: id(capacity.length + 20, 'e'),
    personId: person?.id ?? '',
    personName: person?.name ?? 'Unassigned',
    departmentId: String(req.body?.departmentId ?? person?.departmentId ?? ''),
    departmentName: person?.departmentName,
    availabilityHours: null,
    weeks,
    weeklyBaseline: baseline,
    notes: '',
  } as (typeof capacity)[number];
  capacity.push(record);
  res.status(201).json({ id: record.id });
});

router.patch('/capacity/:id/weeks', asyncHandler(async (req, res) => {
  const record = capacity.find((entry) => entry.id === req.params.id);
  if (!record) throw new HttpError(404, 'Availability row not found.');
  const { week, startWeek, endWeek, hours } = req.body ?? {};
  if (Number.isFinite(week)) {
    record.weeks[week] = hours;
  } else if (Number.isFinite(startWeek) && Number.isFinite(endWeek)) {
    for (let i = startWeek; i <= endWeek && i < record.weeks.length; i += 1) record.weeks[i] = hours;
  } else {
    throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  }
  res.json({ id: record.id, weeks: record.weeks });
}));

router.patch('/capacity/:id', asyncHandler(async (req, res) => {
  res.json(patch(capacity, req.params.id, req.body));
}));

router.delete('/capacity/:id', (req, res) => {
  const index = capacity.findIndex((entry) => entry.id === req.params.id);
  if (index >= 0) capacity.splice(index, 1);
  res.status(204).end();
});

router.get('/demand', (req, res) => {
  const personId = req.query.mine === 'true' ? demoPerson().id : String(req.query.personId ?? '');  const projectId = String(req.query.projectId ?? '');
  let rows = demand;
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (projectId) rows = rows.filter((row) => row.projectId === projectId);
  res.json(rows);
});router.get('/prioritization/categories', (_req, res) => res.json(categories));
router.get('/users', (_req, res) =>
  res.json(people.map((person) => ({ id: person.id, fullName: person.name, email: person.email }))),
);
router.get('/admin/portfolio-summary', (_req, res) =>
  res.json({
    projectCount: projects.length,
    requestCount: requests.length,
    peopleWithCapacity: people.length,
    demandRows: 12,
    availability: new Array(1333).fill(0).map((_, i) => (i < 26 ? 38 : 0)),
    demand: new Array(1333).fill(0).map((_, i) => (i < 26 ? 31 : 0)),
    net: new Array(1333).fill(0).map((_, i) => (i < 26 ? 7 : 0)),
  }),
);

router.post('/demand', (req, res) => {
  const person = people.find((entry) => entry.id === req.body?.personId);
  const project = projects.find((entry) => entry.id === req.body?.projectId);
  const fn = functions.find((entry) => entry.id === req.body?.functionId);
  if (person && demand.some((row) => row.projectId === req.body?.projectId && row.personId === person.id)) {
    res.status(409).json({ error: 'That person is already on this project team.' });
    return;
  }
  const weeks = new Array(1333).fill(0);
  const { startWeek, endWeek, hoursPerWeek, weeks: provided } = req.body ?? {};
  if (Array.isArray(provided)) {
    provided.forEach((value: number, index: number) => {
      if (index < weeks.length) weeks[index] = value;
    });
  } else if (Number.isFinite(startWeek) && Number.isFinite(endWeek) && Number.isFinite(hoursPerWeek)) {
    for (let i = startWeek; i <= endWeek && i < weeks.length; i += 1) weeks[i] = hoursPerWeek;
  }
  const record = {
    id: id(demand.length + 10, 'f'),
    projectId: String(req.body?.projectId ?? ''),
    projectName: project?.name ?? 'Project',
    personId: person?.id,
    personName: person?.name ?? 'Unassigned',
    functionId: fn?.id,
    functionName: fn?.name,
    demandHours: null,
    weeks,
    startWeek: 0,
    endWeek: 0,
    status: 'Planned',
  } as (typeof demand)[number];
  demand.push(record);
  res.status(201).json({ id: record.id });
});

router.patch('/demand/:id/weeks', asyncHandler(async (req, res) => {
  const record = demand.find((entry) => entry.id === req.params.id);
  if (!record) throw new HttpError(404, 'Demand row not found.');
  const { week, startWeek, endWeek, hours } = req.body ?? {};
  if (Number.isFinite(week)) {
    record.weeks[week] = hours;
  } else if (Number.isFinite(startWeek) && Number.isFinite(endWeek)) {
    for (let i = startWeek; i <= endWeek && i < record.weeks.length; i += 1) record.weeks[i] = hours;
  } else {
    throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  }
  res.json({ id: record.id, weeks: record.weeks });
}));

router.patch('/demand/:id', asyncHandler(async (req, res) => {
  res.json(patch(demand, req.params.id, req.body));
}));

router.get('/non-project-demand/categories', (_req, res) => res.json(nonProjectDemandCategories));

router.post('/non-project-demand/categories', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Category name is required.');
  if (nonProjectDemandCategories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That non-project demand category already exists.');
  }
  const category = { id: id(nonProjectDemandCategories.length + 20, 'c'), name, isActive: true };
  nonProjectDemandCategories.push(category);
  res.status(201).json({ id: category.id });
});

router.patch('/non-project-demand/categories/:id', (req, res) => {
  const category = nonProjectDemandCategories.find((entry) => entry.id === req.params.id);
  if (!category) throw new HttpError(404, 'Non-project demand category not found.');
  if (req.body?.name !== undefined) category.name = String(req.body.name).trim();
  if (req.body?.isActive !== undefined) category.isActive = Boolean(req.body.isActive);
  res.json({ id: category.id });
});

router.get('/non-project-demand/subcategories', (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  res.json(nonProjectDemandSubcategories.filter((subcategory) => !categoryId || subcategory.categoryId === categoryId));
});

router.post('/non-project-demand/subcategories', (req, res) => {
  const categoryId = String(req.body?.categoryId ?? '');
  const name = String(req.body?.name ?? '').trim();
  if (!nonProjectDemandCategories.some((category) => category.id === categoryId && category.isActive)) {
    throw new HttpError(404, 'Active non-project demand category not found.');
  }
  if (nonProjectDemandSubcategories.some((subcategory) => subcategory.categoryId === categoryId && subcategory.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That subcategory already exists in this category.');
  }
  const subcategory = { id: id(nonProjectDemandSubcategories.length + 40, 'c'), categoryId, name, isActive: true };
  nonProjectDemandSubcategories.push(subcategory);
  res.status(201).json({ id: subcategory.id });
});

router.patch('/non-project-demand/subcategories/:id', (req, res) => {
  const subcategory = nonProjectDemandSubcategories.find((entry) => entry.id === req.params.id);
  if (!subcategory) throw new HttpError(404, 'Non-project demand subcategory not found.');
  if (req.body?.name !== undefined) subcategory.name = String(req.body.name).trim();
  if (req.body?.isActive !== undefined) subcategory.isActive = Boolean(req.body.isActive);
  res.json({ id: subcategory.id });
});

router.get('/non-project-demand', (req, res) => {
  const personId = req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  res.json(
    nonProjectDemand.filter(
      (row) => (!personId || row.personId === personId) && (!departmentId || row.departmentId === departmentId),
    ),
  );
});

router.post('/non-project-demand', (req, res) => {
  const subcategory = nonProjectDemandSubcategories.find((entry) => entry.id === req.body?.subcategoryId && entry.isActive);
  const category = nonProjectDemandCategories.find((entry) => entry.id === subcategory?.categoryId && entry.isActive);
  if (!subcategory || !category) throw new HttpError(404, 'Active non-project demand subcategory not found.');
  if (nonProjectDemand.some((row) => row.personId === req.body?.personId && row.subcategoryId === subcategory.id)) {
    throw new HttpError(409, 'That non-project demand subcategory is already assigned to this person.');
  }
  const row = {
    id: id(nonProjectDemand.length + 30, 'n'),
    categoryId: category.id,
    categoryName: category.name,
    subcategoryId: subcategory.id,
    subcategoryName: subcategory.name,
    personId: String(req.body?.personId ?? ''),
    departmentId: String(req.body?.departmentId ?? ''),
    weeks: weeksOf(0, 0),
  };
  nonProjectDemand.push(row);
  res.status(201).json({ id: row.id });
});

router.patch('/non-project-demand/:id/weeks', (req, res) => {
  const row = nonProjectDemand.find((entry) => entry.id === req.params.id);
  if (!row) throw new HttpError(404, 'Non-project demand row not found.');
  const { week, startWeek, endWeek, hours } = req.body ?? {};
  if (Number.isFinite(week)) row.weeks[week] = hours;
  else if (Number.isFinite(startWeek) && Number.isFinite(endWeek)) {
    for (let index = startWeek; index <= endWeek && index < row.weeks.length; index += 1) row.weeks[index] = hours;
  } else throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  res.json({ id: row.id, weeks: row.weeks });
});

router.delete('/non-project-demand/:id', (req, res) => {
  const index = nonProjectDemand.findIndex((entry) => entry.id === req.params.id);
  if (index >= 0) nonProjectDemand.splice(index, 1);
  res.status(204).end();
});

router.delete('/demand/:id', (req, res) => {
  const index = demand.findIndex((entry) => entry.id === req.params.id);
  if (index >= 0) demand.splice(index, 1);
  res.status(204).end();
});

export default router;


