import { Router } from 'express';
import { env } from '../config/env';
import { AuthUser, Role, ROLES, authenticate, requireRole, signToken, signViewAsToken } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { CsvDataService } from './csvData';
import { canEditAssignedRecord, canEditAvailability, canEditDemand } from './demoPermissions';
import { combineParentScores, getPrioritizationModel, updatePrioritizationModel } from '../services/prioritizationModel';

/**
 * In-memory sample data used only when DEMO_MODE=true, so the UI can be reviewed
 * without Dataverse credentials. Never mounted when DEMO_MODE is off.
 */
/** Table prefixes mapped to hex so generated ids are valid GUIDs. */
const HEX_PREFIX: Record<string, string> = { d: 'd', p: 'a', f: 'f', j: 'b', r: 'c', c: 'e', u: '9' };

const id = (n: number, prefix: string) =>
  `${HEX_PREFIX[prefix] ?? 'a'}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`.slice(0, 36);
const dataService = env.demoMode ? new CsvDataService() : CsvDataService.empty();

function seedPrioritizationSamples(): void {
  if (!env.demoMode) return;
  const sponsor = dataService.findPersonByEmail(env.devUserEmail);
  if (!sponsor) return;
  const samples = [
    ['SAMPLE - Stabilize cold-chain monitoring', 'Reduce temperature excursion risk across the distribution network.'],
    ['SAMPLE - Expand validation automation', 'Automate repeatable validation evidence to shorten release cycles.'],
    ['SAMPLE - Reduce batch release cycle time', 'Improve quality review flow without increasing compliance risk.'],
  ];
  const requests = dataService.list('requests');
  samples.forEach(([shortTitle, description], index) => {
    const sampleId = id(900 + index, 'r');
    if (dataService.find('requests', sampleId)) return;
    dataService.create('requests', {
      id: sampleId,
      shortTitle,
      title: shortTitle,
      name: shortTitle,
      spotId: undefined,
      phase: 'Prioritization',
      status: 'Submitted',
      disposition: 'Pending',
      location: '',
      isActive: true,
      priorityScore: 0,
      sponsorPersonId: sponsor.id,
      sponsorName: sponsor.name,
      sponsorNameFlat: sponsor.name,
      requesterPersonId: sponsor.id,
      requesterName: sponsor.name,
      delegatePersonId: undefined,
      delegateName: undefined,
      departmentId: undefined,
      departmentName: undefined,
      categoryId: undefined,
      submittedOn: new Date().toISOString(),
      projectId: undefined,
      neededBy: undefined,
      neededByJustification: '',
      discoveryMethod: '',
      impactToOperations: '',
      desiredFutureState: '',
      currentState: description,
      additionalInformation: 'Demo item for reviewing the sponsor prioritization workflow.',
    } as (typeof requests)[number]);
  });
}

seedPrioritizationSamples();

const router = Router();

function patch(collection: Parameters<CsvDataService['update']>[0], recordId: string, body: Record<string, unknown>) {
  const record = dataService.update(collection, recordId, body);
  if (!record) throw new HttpError(404, 'Record not found.');
  return record;
}

function assertDemoAvailabilityEditable(user: AuthUser | undefined, personId?: string, departmentId?: string): void {
  const department = departmentId ? dataService.find('departments', departmentId) : undefined;
  if (canEditAvailability(user, personId, department)) return;
  throw new HttpError(403, 'Only the person, their department lead, department delegate or an admin can change this.');
}

function assertDemoNonProjectEditable(user: AuthUser | undefined, recordId: string): void {
  const record = dataService.findNonProjectDemand(recordId);
  if (!record) throw new HttpError(404, 'Non-project demand row not found.');
  assertDemoAvailabilityEditable(user, record.personId, record.departmentId);
}

function assertDemoDemandEditable(user: AuthUser | undefined, projectId: string): void {
  const project = dataService.find('projects', projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (canEditDemand(user, project)) return;
  throw new HttpError(403, 'Only the project manager, their delegate, a demand moderator or an admin can change this.');
}

router.get('/auth/users', (req, res) => {
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const users = dataService.listUsers()
    .filter((user) => !search || user.DisplayName.toLowerCase().includes(search) || user.Email.toLowerCase().includes(search))
    .slice(0, 200);
  res.json(users.map((user) => ({
    id: user.UserId,
    personId: user.UserId,
    fullName: user.DisplayName,
    email: user.Email,
    jobTitle: dataService.find('people', user.UserId)?.title,
  })));
});

/** Mirrors the real session endpoint using the selected CSV-backed user. */
router.get('/auth/session', (req, res) => {
  const selectedUser = dataService.findUser(String(req.query.userId ?? ''));
  const person = selectedUser ? dataService.find('people', selectedUser.UserId) : undefined;
  if (!selectedUser || !selectedUser.Active || !person) throw new HttpError(403, 'Select an active user.');
  const roles = new Set(parsePersonRoles(person.role));
  if (env.adminEmails.includes(selectedUser.Email.toLowerCase())) roles.add('admin');
  if (env.portfolioManagerEmails.includes(selectedUser.Email.toLowerCase())) roles.add('portfolio_manager');
  const user = {
    userId: selectedUser.UserId,
    personId: person.id,
    email: selectedUser.Email,
    name: selectedUser.DisplayName,
    roles: [...roles],
    departmentId: person.departmentId,
  };
  res.json({ token: signToken(user), user });
});

router.use(authenticate);

function parsePersonRoles(raw: unknown): Role[] {
  const roles = String(raw ?? '')
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((value): value is Role => (ROLES as readonly string[]).includes(value));
  return roles.includes('user') ? roles : ['user', ...roles];
}

/** Mirrors the real /auth/view-as endpoint using the selected CSV-backed person. */
router.post('/auth/view-as', requireRole('admin'), (req, res) => {
  const personId = String(req.body?.personId ?? '');
  if (!personId) throw new HttpError(400, 'personId is required.');
  const person = dataService.find('people', personId);
  if (!person) throw new HttpError(404, 'Person not found.');
  if (person.isActive === false) throw new HttpError(403, 'Inactive people cannot be viewed as.');
  const user = {
    userId: person.id,
    personId: person.id,
    email: person.email ?? '',
    name: person.name,
    roles: parsePersonRoles(person.role),
    departmentId: person.departmentId,
  };
  res.json({ viewAsToken: signViewAsToken(user), user });
});

router.get('/departments', (_req, res) => res.json(dataService.list('departments')));
router.get('/departments/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('departments', req.params.id);
  if (!record) throw new HttpError(404, 'Department not found.');
  res.json(record);
}));
router.post('/departments', requireRole('admin'), (req, res) => {
  const departments = dataService.list('departments');
  const record = { id: id(departments.length + 1, 'd'), isActive: true, ...req.body } as (typeof departments)[number];
  dataService.create('departments', record);
  res.status(201).json({ id: record.id });
});
router.patch('/departments/:id', asyncHandler(async (req, res) => {
  const department = dataService.find('departments', req.params.id);
  if (!department) throw new HttpError(404, 'Department not found.');
  if (!canEditAssignedRecord(req.user, department.leadPersonId, department.delegatePersonId)) {
    throw new HttpError(403, 'Only the department lead, their delegate or an admin can change this department.');
  }
  res.json(patch('departments', req.params.id, req.body));
}));

router.get('/people', (req, res) => {
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  const functionId = req.query.functionId ? String(req.query.functionId) : undefined;
  const search = req.query.search ? String(req.query.search).toLowerCase() : undefined;
  const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;
  let rows = dataService.list('people');
  if (departmentId) rows = rows.filter((row) => row.departmentId === departmentId);
  if (functionId) rows = rows.filter((row) => row.functionId === functionId);
  if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search));
  if (active !== undefined) rows = rows.filter((row) => row.isActive === active);
  res.json(rows);
});
router.get('/people/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('people', req.params.id);
  if (!record) throw new HttpError(404, 'Person not found.');
  res.json(record);
}));
router.post('/people', requireRole('admin'), (req, res) => {
  const people = dataService.list('people');
  const record = { id: id(people.length + 1, 'p'), isActive: true, ...req.body } as (typeof people)[number];
  dataService.create('people', record);
  res.status(201).json({ id: record.id });
});
router.patch('/people/:id', asyncHandler(async (req, res) => {
  const person = dataService.find('people', req.params.id);
  if (!person) throw new HttpError(404, 'Person not found.');
  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  const isSelf = person.id.toLowerCase() === req.user?.personId?.toLowerCase();
  if (!isAdmin && Object.hasOwn(req.body ?? {}, 'role')) {
    throw new HttpError(403, 'Only admins can assign security roles.');
  }
  if (!isAdmin && !isSelf) {
    const department = person.departmentId ? dataService.find('departments', person.departmentId) : undefined;
    if (!department || !canEditAssignedRecord(req.user, department.leadPersonId, department.delegatePersonId)
      || Object.keys(req.body ?? {}).some((key) => key !== 'departmentId')) {
      throw new HttpError(403, 'Department leads and delegates may only transfer team members.');
    }
  }
  res.json(patch('people', req.params.id, req.body));
}));

router.get('/projects', (_req, res) => res.json(dataService.list('projects')));
router.get('/projects/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('projects', req.params.id);
  if (!record) throw new HttpError(404, 'Project not found.');
  res.json(record);
}));
router.get('/projects/:id/team', (req, res) => res.json(dataService.filterBy('demand', (row) => row.projectId === req.params.id)));
router.post('/projects', requireRole('admin'), (req, res) => {
  const projects = dataService.list('projects');
  const record = { id: id(projects.length + 1, 'j'), ...req.body } as (typeof projects)[number];
  dataService.create('projects', record);
  res.status(201).json({ id: record.id });
});
router.patch('/projects/:id', asyncHandler(async (req, res) => {
  const project = dataService.find('projects', req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (!canEditAssignedRecord(req.user, project.managerPersonId, project.delegatePersonId)) {
    throw new HttpError(403, 'Only the project manager, their delegate or an admin can change this project.');
  }
  res.json(patch('projects', req.params.id, req.body));
}));

router.get('/requests', (req, res) => {
  const requests = dataService.list('requests');
  if (req.query.mine !== 'true') {
    res.json(requests);
    return;
  }
  const me = req.user?.personId;
  res.json(dataService.filterBy('requests', (row) => row.requesterPersonId === me || row.delegatePersonId === me));
});
router.get('/requests/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('requests', req.params.id);
  if (!record) throw new HttpError(404, 'Request not found.');
  res.json(record);
}));
/** Captures a new intake request; disposition always starts Pending and the phase starts Draft. */
router.post('/requests', (req, res) => {
  const requests = dataService.list('requests');
  const requester = dataService.find('people', req.user?.personId ?? '');
  const sponsor = req.body?.sponsorPersonId ? dataService.find('people', String(req.body.sponsorPersonId)) : undefined;
  const delegate = req.body?.delegatePersonId ? dataService.find('people', String(req.body.delegatePersonId)) : undefined;
  const department = req.body?.departmentId ? dataService.find('departments', String(req.body.departmentId)) : undefined;
  const shortTitle = String(req.body?.shortTitle ?? '').trim() || 'Untitled request';
  const record = {
    id: id(requests.length + 1, 'r'),
    shortTitle,
    title: shortTitle,
    name: shortTitle,
    spotId: undefined,
    phase: 'Draft',
    status: 'Submitted',
    disposition: 'Pending',
    location: req.body?.location ? String(req.body.location) : '',
    isActive: true,
    priorityScore: 0,
    requesterPersonId: requester?.id,
    requesterName: requester?.name,
    delegatePersonId: delegate?.id,
    delegateName: delegate?.name,
    sponsorPersonId: sponsor?.id,
    sponsorName: sponsor?.name,
    sponsorNameFlat: sponsor?.name ?? '',
    departmentId: department?.id,
    departmentName: department?.name,
    categoryId: req.body?.categoryId ? String(req.body.categoryId) : undefined,
    submittedOn: new Date().toISOString(),
    projectId: undefined,
    neededBy: req.body?.neededBy ? String(req.body.neededBy) : undefined,
    neededByJustification: req.body?.neededByJustification ? String(req.body.neededByJustification) : '',
    currentState: req.body?.currentState ? String(req.body.currentState) : '',
    discoveryMethod: req.body?.discoveryMethod ? String(req.body.discoveryMethod) : '',
    impactToOperations: req.body?.impactToOperations ? String(req.body.impactToOperations) : '',
    desiredFutureState: req.body?.desiredFutureState ? String(req.body.desiredFutureState) : '',
    additionalInformation: req.body?.additionalInformation ? String(req.body.additionalInformation) : '',
  } as (typeof requests)[number];
  dataService.create('requests', record);
  res.status(201).json({ id: record.id });
});
router.patch('/requests/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  res.json(patch('requests', req.params.id, req.body));
}));

router.get('/lookups/functions', (_req, res) => res.json(dataService.list('functions')));
router.get('/lookups/locations', (_req, res) => res.json(dataService.list('locations')));

router.get('/capacity', (req, res) => {
  const personId = req.query.mine === 'true' ? req.user?.personId : req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  let rows = dataService.listCapacity();
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (departmentId) rows = rows.filter((row) => row.departmentId === departmentId);
  res.json(rows);
});

router.get('/capacity/person/:personId/net', (req, res) => {  const availability = dataService.listCapacity().filter((row) => row.personId === req.params.personId)
    .reduce<number[]>((total, row) => row.weeks.map((value, i) => (total[i] ?? 0) + value), new Array(1333).fill(0));
  const committed = dataService.listDemand().filter((row) => row.personId === req.params.personId)
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
  const person = dataService.find('people', req.body?.personId);
  assertDemoAvailabilityEditable(req.user, person?.id, person?.departmentId);
  const capacity = dataService.list('capacity');
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
  dataService.create('capacity', record);
  res.status(201).json({ id: record.id });
});

router.patch('/capacity/:id/weeks', asyncHandler(async (req, res) => {
  const current = dataService.find('capacity', req.params.id);
  if (!current) throw new HttpError(404, 'Availability row not found.');
  assertDemoAvailabilityEditable(req.user, current.personId, current.departmentId);
  const { week, startWeek, endWeek } = req.body ?? {};
  if (!Number.isFinite(week) && !(Number.isFinite(startWeek) && Number.isFinite(endWeek))) {
    throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  }
  const record = dataService.updateWeeks('capacity', req.params.id, req.body ?? {});
  if (!record) throw new HttpError(404, 'Availability row not found.');
  res.json({ id: record.id, weeks: record.weeks });
}));

router.patch('/capacity/:id', asyncHandler(async (req, res) => {
  const current = dataService.find('capacity', req.params.id);
  if (!current) throw new HttpError(404, 'Availability row not found.');
  assertDemoAvailabilityEditable(req.user, current.personId, current.departmentId);
  res.json(patch('capacity', req.params.id, req.body));
}));

router.delete('/capacity/:id', (req, res) => {
  const current = dataService.find('capacity', req.params.id);
  if (!current) throw new HttpError(404, 'Availability row not found.');
  assertDemoAvailabilityEditable(req.user, current.personId, current.departmentId);
  dataService.remove('capacity', req.params.id);
  res.status(204).end();
});

router.get('/demand', (req, res) => {
  const personId = req.query.mine === 'true' ? req.user?.personId : String(req.query.personId ?? '');  const projectId = String(req.query.projectId ?? '');
  let rows = dataService.list('demand');
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (projectId) rows = rows.filter((row) => row.projectId === projectId);
  res.json(rows);
});

const prioritizationScores = [0, 1, 5, 10, 15];
const scoreLabels: Record<number, string> = { 0: 'No impact', 1: 'Low impact', 5: 'Moderate impact', 10: 'High impact', 15: 'Critical impact' };

function prioritizationBreakdown(requestId: string) {
  const questions = dataService.list('questions').filter((question) => question.isActive);
  const categories = dataService.list('categories');
  const answers = dataService.list('answers').filter((answer) => String(answer.requestId).toLowerCase() === String(requestId).toLowerCase());
  const categoryScores = categories.map((category) => {
    const categoryQuestions = questions.filter((question) => question.categoryId?.toLowerCase() === category.id.toLowerCase());
    const weighted = categoryQuestions.reduce((total, question) => {
      const answer = answers.find((item) => item.questionId.toLowerCase() === question.id.toLowerCase());
      return total + Number(answer?.score ?? 0) * question.weight;
    }, 0);
    const weight = categoryQuestions.reduce((total, question) => total + question.weight, 0);
    return { parent: category.parent, score: weight ? weighted / weight : 0, weight: category.weight };
  });
  const parentScore = (parent: 'Impact' | 'Complexity') => {
    const rows = categoryScores.filter((category) => category.parent === parent);
    const weight = rows.reduce((total, category) => total + category.weight, 0);
    return weight ? rows.reduce((total, category) => total + category.score * category.weight, 0) / weight : 0;
  };
  const impactScore = parentScore('Impact');
  const complexityScore = parentScore('Complexity');
  return { impactScore, complexityScore, priorityScore: Math.round(combineParentScores(impactScore, complexityScore) * 100) / 100 };
}

function prioritizationComplete(requestId: string): boolean {
  const questions = dataService.list('questions').filter((question) => question.isActive);
  const answers = dataService.list('answers').filter((answer) => String(answer.requestId).toLowerCase() === String(requestId).toLowerCase());
  return questions.length > 0 && questions.every((question) => answers.some((answer) =>
    String(answer.questionId).toLowerCase() === String(question.id).toLowerCase()
    && answer.score !== undefined && String(answer.justification ?? answer.comment ?? '').trim().length > 0,
  ));
}

router.get('/prioritization/model', (_req, res) => res.json(getPrioritizationModel()));
router.patch('/prioritization/model', requireRole('admin'), (req, res) => {
  const impactWeight = Number(req.body?.impactWeight);
  const complexityWeight = Number(req.body?.complexityWeight);
  if (!Number.isFinite(impactWeight) || !Number.isFinite(complexityWeight) || impactWeight < 0 || complexityWeight < 0 || impactWeight > 1 || complexityWeight > 1 || impactWeight + complexityWeight <= 0) {
    throw new HttpError(400, 'Parent weights must be between 0 and 1, with at least one greater than zero.');
  }
  res.json(updatePrioritizationModel({ Impact: impactWeight, Complexity: complexityWeight }));
});
router.get('/prioritization/categories', (_req, res) => res.json(dataService.list('categories')));
router.get('/prioritization/requests', (_req, res) => {
  const requests = [...dataService.list('requests')]
    .sort((left, right) => Number(right.shortTitle?.startsWith('SAMPLE -')) - Number(left.shortTitle?.startsWith('SAMPLE -')))
    .map((request) => ({
    ...request,
    prioritizationComplete: prioritizationComplete(request.id),
    }));
  res.json(requests);
});
router.post('/prioritization/categories', requireRole('admin'), (req, res) => {
  const categories = dataService.list('categories');
  const record = { id: id(categories.length + 100, 'c'), isActive: true, categoryType: req.body.parent, ...req.body } as (typeof categories)[number];
  dataService.create('categories', record);
  res.status(201).json({ id: record.id });
});
router.patch('/prioritization/categories/:id', requireRole('admin'), (req, res) => res.json(patch('categories', req.params.id, {
  ...req.body,
  ...(req.body.parent ? { categoryType: req.body.parent } : {}),
})));
router.get('/prioritization/questions', (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = dataService.list('categories');
  const rows = dataService.list('questions')
    .filter((question) => includeInactive || question.isActive)
    .map((question) => ({
      ...question,
      categoryName: categories.find((category) => category.id.toLowerCase() === question.categoryId?.toLowerCase())?.name,
    }))
    .sort((left, right) => left.sequence - right.sequence);
  res.json(rows);
});
router.post('/prioritization/questions', requireRole('admin'), (req, res) => {
  const questions = dataService.list('questions');
  const record = {
    id: id(questions.length + 100, 'f'), text: req.body.text, categoryId: req.body.categoryId,
    weight: Number(req.body.weight ?? 1), sequence: Number(req.body.sequence ?? questions.length), answerType: 'score',
    isActive: true, required: true, metric: req.body.metric, helpText: req.body.helpText, subtitle: req.body.subtitle,
    options: prioritizationScores.map((score) => ({ score, label: scoreLabels[score], text: req.body.options?.[score] ?? '' })),
  } as (typeof questions)[number];
  dataService.create('questions', record);
  res.status(201).json({ id: record.id });
});
router.patch('/prioritization/questions/:id', requireRole('admin'), (req, res) => {
  const changes = { ...req.body };
  if (req.body.options) changes.options = prioritizationScores.map((score) => ({ score, label: scoreLabels[score], text: req.body.options[score] ?? '' }));
  res.json(patch('questions', req.params.id, changes));
});
router.get('/prioritization/requests/:requestId/answers', (req, res) => {
  res.json(dataService.list('answers').filter((answer) => answer.requestId.toLowerCase() === req.params.requestId.toLowerCase()));
});
router.post('/prioritization/submit', (req, res) => {
  const questions = dataService.list('questions').filter((question) => question.isActive);
  const submitted = Array.isArray(req.body.answers) ? req.body.answers : [];
  if (submitted.length !== questions.length || submitted.some((answer: { score?: number; justification?: string }) => !prioritizationScores.includes(Number(answer.score)) || (Number(answer.score) !== 0 && !String(answer.justification ?? '').trim())) || questions.some((question) => question.required !== false && submitted.find((answer: { questionId?: string }) => answer.questionId === question.id)?.score === 0)) {
    throw new HttpError(400, 'Every active prioritization question requires a rating and justification.');
  }
  const answers = dataService.list('answers');
  for (const submittedAnswer of submitted) {
    const current = answers.find((answer) => String(answer.requestId).toLowerCase() === String(req.body.requestId).toLowerCase()
      && String(answer.questionId).toLowerCase() === String(submittedAnswer.questionId).toLowerCase());
    const changes = {
      value: scoreLabels[submittedAnswer.score], score: submittedAnswer.score,
      comment: submittedAnswer.justification, justification: submittedAnswer.justification,
      methodology: submittedAnswer.methodology ?? '',
    };
    if (current) dataService.update('answers', current.id, changes);
    else dataService.create('answers', {
      id: id(answers.length + 1000, 'c'), requestId: req.body.requestId, questionId: submittedAnswer.questionId, ...changes,
    } as (typeof answers)[number]);
  }
  const breakdown = prioritizationBreakdown(req.body.requestId);
  dataService.update('requests', req.body.requestId, { priorityScore: breakdown.priorityScore });
  const ranked = dataService.list('requests').filter((request) => request.priorityScore !== undefined)
    .sort((left, right) => Number(right.priorityScore ?? 0) - Number(left.priorityScore ?? 0));
  const rank = ranked.findIndex((request) => request.id === req.body.requestId) + 1;
  const quartile = ['Highest quartile', 'Upper-middle quartile', 'Lower-middle quartile', 'Lowest quartile'][Math.min(3, Math.ceil((rank / ranked.length) * 4) - 1)] ?? 'Unranked';
  res.json({ requestId: req.body.requestId, quartile, topTen: rank > 0 && rank <= 10 });
});
router.get('/prioritization/ranking', (_req, res) => {
  const rows = dataService.list('requests').filter((request) => request.isActive !== false).map((request) => ({ ...request, ...prioritizationBreakdown(request.id) }))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .map((request, index, all) => ({ ...request, rank: index + 1, quartile: ['Highest quartile', 'Upper-middle quartile', 'Lower-middle quartile', 'Lowest quartile'][Math.min(3, Math.ceil(((index + 1) / all.length) * 4) - 1)], topTen: index < 10 }));
  res.json(rows);
});
router.get('/users', (req, res) => {
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const people = dataService.list('people')
    .filter((person) => !search || person.name.toLowerCase().includes(search) || person.email.toLowerCase().includes(search));
  res.json(people.map((person) => ({ id: person.id, personId: person.id, fullName: person.name, email: person.email })));
});
router.get('/admin/portfolio-summary', (_req, res) =>
  res.json(dataService.getPortfolioSummary()),
);

router.post('/demand', (req, res) => {
  const person = dataService.find('people', req.body?.personId);
  const project = dataService.find('projects', req.body?.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (!person || person.id.toLowerCase() !== req.user?.personId?.toLowerCase()) {
    assertDemoDemandEditable(req.user, project.id);
  }
  const fn = dataService.find('functions', req.body?.functionId);
  const demand = dataService.list('demand');
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
  dataService.create('demand', record);
  res.status(201).json({ id: record.id });
});

router.patch('/demand/:id/weeks', asyncHandler(async (req, res) => {
  const current = dataService.find('demand', req.params.id);
  if (!current) throw new HttpError(404, 'Demand row not found.');
  if (!current.personId || current.personId.toLowerCase() !== req.user?.personId?.toLowerCase()) {
    assertDemoDemandEditable(req.user, current.projectId);
  }
  const { week, startWeek, endWeek } = req.body ?? {};
  if (!Number.isFinite(week) && !(Number.isFinite(startWeek) && Number.isFinite(endWeek))) {
    throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  }
  const record = dataService.updateWeeks('demand', req.params.id, req.body ?? {});
  if (!record) throw new HttpError(404, 'Demand row not found.');
  res.json({ id: record.id, weeks: record.weeks });
}));

router.patch('/demand/:id', asyncHandler(async (req, res) => {
  const current = dataService.find('demand', req.params.id);
  if (!current) throw new HttpError(404, 'Demand row not found.');
  assertDemoDemandEditable(req.user, current.projectId);
  res.json(patch('demand', req.params.id, req.body));
}));

router.get('/skills/categories', (_req, res) => res.json(dataService.listSkillCategories()));

router.post('/skills/categories', requireRole('admin'), (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Category name is required.');
  if (dataService.listSkillCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That skill category already exists.');
  }
  const category = dataService.createSkillCategory(name);
  res.status(201).json({ id: category.id });
});

router.patch('/skills/categories/:id', requireRole('admin'), (req, res) => {
  const category = dataService.updateSkillCategory(req.params.id, {
    name: typeof req.body?.name === 'string' ? req.body.name.trim() : undefined,
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
  });
  if (!category) throw new HttpError(404, 'Skill category not found.');
  res.json({ id: category.id });
});

router.get('/skills', (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  res.json(dataService.listSkills(categoryId));
});

/** Any authenticated user can add a new skill to an existing category. */
router.post('/skills', (req, res) => {
  const categoryId = String(req.body?.categoryId ?? '');
  const name = String(req.body?.name ?? '').trim();
  const category = dataService.findSkillCategory(categoryId);
  if (!category?.isActive) throw new HttpError(404, 'Active skill category not found.');
  if (!name) throw new HttpError(400, 'Skill name is required.');
  if (dataService.listSkills(categoryId).some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That skill already exists in this category.');
  }
  const skill = dataService.createSkill(categoryId, name);
  res.status(201).json({ id: skill.id });
});

router.patch('/skills/:id', requireRole('admin'), (req, res) => {
  const skill = dataService.updateSkill(req.params.id, {
    name: typeof req.body?.name === 'string' ? req.body.name.trim() : undefined,
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
  });
  if (!skill) throw new HttpError(404, 'Skill not found.');
  res.json({ id: skill.id });
});

router.get('/skills/people/:personId', (req, res) => res.json(dataService.listPersonSkills(req.params.personId)));

router.post('/skills/people/:personId', (req, res) => {
  const person = dataService.find('people', req.params.personId);
  if (!person) throw new HttpError(404, 'Person not found.');
  assertDemoAvailabilityEditable(req.user, person.id, person.departmentId);
  const skillId = String(req.body?.skillId ?? '');
  const record = dataService.addPersonSkill(req.params.personId, skillId);
  if (!record) throw new HttpError(404, 'Skill not found.');
  res.status(201).json({ id: record.id });
});

router.delete('/skills/people/:personId/:skillId', (req, res) => {
  const person = dataService.find('people', req.params.personId);
  if (!person) throw new HttpError(404, 'Person not found.');
  assertDemoAvailabilityEditable(req.user, person.id, person.departmentId);
  dataService.removePersonSkill(req.params.personId, req.params.skillId);
  res.status(204).end();
});

router.get('/non-project-demand/categories', (_req, res) => res.json(dataService.listNonProjectDemandCategories()));

router.post('/non-project-demand/categories', requireRole('admin'), (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Category name is required.');
  if (dataService.listNonProjectDemandCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That non-project demand category already exists.');
  }
  const category = dataService.createNonProjectDemandCategory(name);
  res.status(201).json({ id: category.id });
});

router.patch('/non-project-demand/categories/:id', requireRole('admin'), (req, res) => {
  const category = dataService.updateNonProjectDemandCategory(req.params.id, {
    name: req.body?.name === undefined ? undefined : String(req.body.name).trim(),
    isActive: req.body?.isActive === undefined ? undefined : Boolean(req.body.isActive),
  });
  if (!category) throw new HttpError(404, 'Non-project demand category not found.');
  res.json({ id: category.id });
});

router.get('/non-project-demand/subcategories', (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  res.json(dataService.listNonProjectDemandSubcategories(categoryId));
});

router.post('/non-project-demand/subcategories', requireRole('admin'), (req, res) => {
  const categoryId = String(req.body?.categoryId ?? '');
  const name = String(req.body?.name ?? '').trim();
  if (!dataService.findNonProjectDemandCategory(categoryId)?.isActive) {
    throw new HttpError(404, 'Active non-project demand category not found.');
  }
  if (dataService.listNonProjectDemandSubcategories(categoryId).some((subcategory) => subcategory.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That subcategory already exists in this category.');
  }
  const subcategory = dataService.createNonProjectDemandSubcategory(categoryId, name);
  res.status(201).json({ id: subcategory.id });
});

router.patch('/non-project-demand/subcategories/:id', requireRole('admin'), (req, res) => {
  const subcategory = dataService.updateNonProjectDemandSubcategory(req.params.id, {
    name: req.body?.name === undefined ? undefined : String(req.body.name).trim(),
    isActive: req.body?.isActive === undefined ? undefined : Boolean(req.body.isActive),
  });
  if (!subcategory) throw new HttpError(404, 'Non-project demand subcategory not found.');
  res.json({ id: subcategory.id });
});

router.get('/non-project-demand', (req, res) => {
  const personId = req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  res.json(
    dataService.listNonProjectDemand(personId, departmentId),
  );
});

router.post('/non-project-demand', (req, res) => {
  const person = dataService.find('people', String(req.body?.personId ?? ''));
  if (!person) throw new HttpError(404, 'Person not found.');
  assertDemoAvailabilityEditable(req.user, person.id, person.departmentId);
  const subcategory = dataService.findNonProjectDemandSubcategory(String(req.body?.subcategoryId ?? ''));
  const category = subcategory ? dataService.findNonProjectDemandCategory(subcategory.categoryId) : undefined;
  if (!subcategory || !category) throw new HttpError(404, 'Active non-project demand subcategory not found.');
  const description = String(req.body?.description ?? '').trim();
  if (!description) throw new HttpError(400, 'Description is required.');
  const row = {
    id: id(dataService.listNonProjectDemand().length + 30, 'n'),
    categoryId: category.id,
    categoryName: category.name,
    subcategoryId: subcategory.id,
    subcategoryName: subcategory.name,
    personId: person.id,
    departmentId: person.departmentId ?? '',
    description,
    weeks: new Array(1333).fill(0),
    isActive: true,
  };
  dataService.createNonProjectDemand(row);
  res.status(201).json({ id: row.id });
});

router.patch('/non-project-demand/:id/weeks', (req, res) => {
  assertDemoNonProjectEditable(req.user, req.params.id);
  const row = dataService.updateNonProjectDemandWeeks(req.params.id, req.body ?? {});
  if (!row) throw new HttpError(404, 'Non-project demand row not found.');
  res.json({ id: row.id, weeks: row.weeks });
});

router.patch('/non-project-demand/:id', (req, res) => {
  assertDemoNonProjectEditable(req.user, req.params.id);
  const row = dataService.updateNonProjectDemand(req.params.id, {
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
    description: typeof req.body?.description === 'string' ? req.body.description : undefined,
  });
  if (!row) throw new HttpError(404, 'Non-project demand row not found.');
  res.json({ id: row.id });
});

router.delete('/non-project-demand/:id', (req, res) => {
  assertDemoNonProjectEditable(req.user, req.params.id);
  dataService.removeNonProjectDemand(req.params.id);
  res.status(204).end();
});

router.delete('/demand/:id', (req, res) => {
  const current = dataService.find('demand', req.params.id);
  if (!current) throw new HttpError(404, 'Demand row not found.');
  assertDemoDemandEditable(req.user, current.projectId);
  dataService.remove('demand', req.params.id);
  res.status(204).end();
});

export default router;


