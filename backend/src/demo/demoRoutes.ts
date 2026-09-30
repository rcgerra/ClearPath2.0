import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AuthUser, Role, ROLES, authenticate, requireRole, signToken, signViewAsToken } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { CsvDataService } from './csvData';
import { demoDataService } from './demoDataService';
import { canAssignRequestDelegate, canEditAssignedRecord, canEditAvailability, canEditDemand, canEditRequest } from './demoPermissions';
import { combineParentScores, getPrioritizationModel, updatePrioritizationModel } from '../services/prioritizationModel';
import { getReferenceMetadata, listReferenceMetadata, referenceMetadataSchema, saveReferenceMetadata } from '../services/referenceMetadata';
import { opportunitySubmissionSchema } from '../services/opportunitySubmission';
import { requestStageIndex } from '../services/requestWorkflow';
import { verifyEntraIdToken } from '../services/entraIdentity';
import { searchEntraUsers } from '../services/graphDirectory';
import { assertDepartmentSite, assertSiteCreator, assertSiteLead, assignPersonSite, personSiteId, resolveCreationSite, resolvePersonCreationSite, viewSiteId } from '../services/siteScope';

/**
 * In-memory sample data used only when DEMO_MODE=true, so the UI can be reviewed
 * without Dataverse credentials. Never mounted when DEMO_MODE is off.
 */
/** Table prefixes mapped to hex so generated ids are valid GUIDs. */
const HEX_PREFIX: Record<string, string> = { d: 'd', p: 'a', f: 'f', j: 'b', r: 'c', c: 'e', u: '9' };

const id = (n: number, prefix: string) =>
  `${HEX_PREFIX[prefix] ?? 'a'}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`.slice(0, 36);
const dataService = demoDataService;

function requestWithProjectSpot<Request extends { id: string; projectId?: string; spotId?: string }>(request: Request) {
  const project = request.projectId ? dataService.find('projects', request.projectId) : undefined;
  return { ...request, spotId: project ? project.spotId : request.spotId };
}

function projectWithRequestLink<Project extends { id: string }>(project: Project) {
  const request = dataService.list('requests').find((row) => row.projectId === project.id);
  return { ...project, requestId: request?.id };
}

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

router.get('/auth/config', (_req, res) => {
  res.json({
    authMode: env.authMode,
    ...(env.authMode === 'entra' ? { tenantId: env.entraTenantId, clientId: env.entraClientId } : {}),
  });
});

router.post('/auth/entra', asyncHandler(async (req, res) => {
  if (env.authMode !== 'entra') throw new HttpError(404, 'Entra sign-in is not enabled.');
  const { idToken } = z.object({ idToken: z.string().min(1).max(20000) }).parse(req.body);
  let identity: Awaited<ReturnType<typeof verifyEntraIdToken>>;
  try {
    identity = await verifyEntraIdToken(idToken);
  } catch {
    throw new HttpError(401, 'The Entra ID token is invalid or expired.');
  }
  const selectedUser = dataService.listUsers().find((candidate) =>
    candidate.Active && candidate.Email.toLowerCase() === identity.email,
  );
  const person = selectedUser ? dataService.find('people', selectedUser.UserId) : undefined;
  if (!selectedUser || !person) throw new HttpError(403, 'Your Entra account is not linked to an active ClearPath user.');
  const roles = new Set(parsePersonRoles(person.role));
  if (env.adminEmails.includes(identity.email)) roles.add('admin');
  if (env.portfolioManagerEmails.includes(identity.email)) roles.add('portfolio_manager');
  const user = {
    userId: selectedUser.UserId,
    personId: person.id,
    email: identity.email,
    name: selectedUser.DisplayName || identity.name,
    roles: [...roles],
    departmentId: person.departmentId,
    authProvider: 'entra' as const,
  };
  res.json({ token: signToken(user), user });
}));

router.get('/auth/users', (req, res) => {
  if (env.authMode === 'entra') throw new HttpError(404, 'The temporary user directory is disabled.');
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
  if (env.authMode === 'entra') throw new HttpError(404, 'Temporary user sign-in is disabled.');
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
    authProvider: 'dev' as const,
  };
  res.json({ token: signToken(user), user });
});

router.use(authenticate);

router.post('/auth/refresh', asyncHandler(async (req, res) => {
  const selectedUser = dataService.findUser(req.user?.userId ?? '');
  const person = selectedUser ? dataService.find('people', selectedUser.UserId) : undefined;
  if (!selectedUser || !selectedUser.Active || !person) throw new HttpError(403, 'Your account is not linked to an active ClearPath user.');

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
    authProvider: req.user?.authProvider ?? 'dev' as const,
  };
  res.json({ token: signToken(user), user });
}));

const scopedSite = (req: Request) => viewSiteId(req.user, typeof req.headers['x-clearpath-site'] === 'string' ? req.headers['x-clearpath-site'] : undefined);
const atSite = (siteId: string | undefined, visibleSite: string | undefined) => !visibleSite || siteId?.toLowerCase() === visibleSite.toLowerCase();

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
    authProvider: req.user?.authProvider,
  };
  res.json({ viewAsToken: signViewAsToken(user), user });
});

function assertSite(siteId: unknown): void {
  if (siteId !== undefined && siteId !== '' && (typeof siteId !== 'string' || !dataService.find('sites', siteId))) {
    throw new HttpError(400, 'Select a valid site.');
  }
}

router.get('/departments', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const metadata = await listReferenceMetadata('departments');
  res.json(dataService.list('departments').map((row) => ({ ...row, ...metadata.get(row.id.toLowerCase()) }))
    .filter((row) => atSite(row.siteId, visibleSite)));
}));
router.get('/departments/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('departments', req.params.id);
  if (!record) throw new HttpError(404, 'Department not found.');
  const detail = { ...record, ...await getReferenceMetadata('departments', record.id) };
  if (!atSite(detail.siteId, await scopedSite(req))) throw new HttpError(404, 'Department not found.');
  res.json(detail);
}));
router.post('/departments', asyncHandler(async (req, res) => {
  await assertSiteCreator(req.user);
  assertSite(req.body?.siteId);
  const siteId = await resolveCreationSite(req.user, req.body?.siteId);
  const departments = dataService.list('departments');
  const record = { id: id(departments.length + 1, 'd'), isActive: true, ...req.body, siteId } as (typeof departments)[number];
  dataService.create('departments', record);
  await saveReferenceMetadata('departments', record.id, { siteId });
  res.status(201).json({ id: record.id });
}));
router.patch('/departments/:id', asyncHandler(async (req, res) => {
  const department = dataService.find('departments', req.params.id);
  if (!department) throw new HttpError(404, 'Department not found.');
  if (!canEditAssignedRecord(req.user, department.leadPersonId, department.delegatePersonId)) {
    throw new HttpError(403, 'Only the department lead, their delegate or an admin can change this department.');
  }
  if (req.body?.siteId !== undefined && !req.user?.roles.includes('admin')) throw new HttpError(403, 'Only admins can reassign a record to another site.');
  assertSite(req.body?.siteId);
  if (req.body?.siteId !== undefined) await saveReferenceMetadata('departments', department.id, { siteId: req.body.siteId });
  res.json(patch('departments', req.params.id, req.body));
}));

router.get('/people', asyncHandler(async (req, res) => {
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  const functionId = req.query.functionId ? String(req.query.functionId) : undefined;
  const search = req.query.search ? String(req.query.search).toLowerCase() : undefined;
  const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;
  let rows = dataService.list('people');
  if (departmentId) rows = rows.filter((row) => row.departmentId === departmentId);
  if (functionId) rows = rows.filter((row) => row.functionId === functionId);
  if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search));
  if (active !== undefined) rows = rows.filter((row) => row.isActive === active);
  const metadata = await listReferenceMetadata('people');
  const visibleSite = await scopedSite(req);
  res.json(rows.map((row) => ({ ...row, ...metadata.get(row.id.toLowerCase()) }))
    .filter((row) => atSite(row.siteId, visibleSite)));
}));
router.get('/people/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('people', req.params.id);
  if (!record) throw new HttpError(404, 'Person not found.');
  const detail = { ...record, ...await getReferenceMetadata('people', record.id) };
  if (record.id.toLowerCase() !== req.user?.personId?.toLowerCase()
    && !atSite(detail.siteId, await scopedSite(req))) throw new HttpError(404, 'Person not found.');
  res.json(detail);
}));
router.post('/people', asyncHandler(async (req, res) => {
  await assertSiteCreator(req.user);
  assertSite(req.body?.siteId);
  const siteId = await resolvePersonCreationSite(req.user, req.body?.siteId);
  await assertDepartmentSite(req.body?.departmentId, siteId, req.user);
  const people = dataService.list('people');
  const record = { id: id(people.length + 1, 'p'), ...req.body, isActive: true, role: 'user', siteId } as (typeof people)[number];
  dataService.create('people', record);
  await assignPersonSite(record.id, siteId);
  res.status(201).json({ id: record.id });
}));
router.patch('/people/:id', asyncHandler(async (req, res) => {
  const person = dataService.find('people', req.params.id);
  if (!person) throw new HttpError(404, 'Person not found.');
  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  const isSelf = person.id.toLowerCase() === req.user?.personId?.toLowerCase();
  if (!isAdmin && Object.hasOwn(req.body ?? {}, 'role')) {
    throw new HttpError(403, 'Only admins can assign security roles.');
  }
  if (!isAdmin && Object.hasOwn(req.body ?? {}, 'siteId')) throw new HttpError(403, 'Only admins can reassign a person to another site.');
  if (req.body?.siteId !== undefined) assertSite(req.body.siteId);
  if (!isAdmin && !isSelf) {
    const department = person.departmentId ? dataService.find('departments', person.departmentId) : undefined;
    if (!department || !canEditAssignedRecord(req.user, department.leadPersonId, department.delegatePersonId)
      || Object.keys(req.body ?? {}).some((key) => key !== 'departmentId')) {
      throw new HttpError(403, 'Department leads and delegates may only transfer team members.');
    }
  }
  const updated = patch('people', req.params.id, req.body);
  if (req.body?.siteId) await assignPersonSite(person.id, req.body.siteId);
  res.json(updated);
}));

router.get('/projects', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const metadata = await listReferenceMetadata('projects');
  const departments = new Map(dataService.list('departments').map((row) => [row.id, row.siteId]));
  res.json(dataService.list('projects').map((row) => ({ ...projectWithRequestLink(row), ...metadata.get(row.id.toLowerCase()) }))
    .filter((row) => atSite(row.siteId ?? departments.get(row.departmentId ?? ''), visibleSite)));
}));
router.get('/projects/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('projects', req.params.id);
  if (!record) throw new HttpError(404, 'Project not found.');
  const detail = { ...projectWithRequestLink(record), ...await getReferenceMetadata('projects', record.id) };
  if (!atSite(detail.siteId ?? dataService.find('departments', record.departmentId ?? '')?.siteId, await scopedSite(req))) throw new HttpError(404, 'Project not found.');
  res.json(detail);
}));
router.get('/projects/:id/team', asyncHandler(async (req, res) => {
  const project = dataService.find('projects', req.params.id);
  const siteId = project ? (await getReferenceMetadata('projects', project.id)).siteId
    ?? dataService.find('departments', project.departmentId ?? '')?.siteId : undefined;
  if (!project || !atSite(siteId, await scopedSite(req))) throw new HttpError(404, 'Project not found.');
  res.json(dataService.filterBy('demand', (row) => row.projectId === req.params.id));
}));
router.post('/projects', asyncHandler(async (req, res) => {
  await assertSiteCreator(req.user);
  assertSite(req.body?.siteId);
  const siteId = await resolveCreationSite(req.user, req.body?.siteId);
  await assertDepartmentSite(req.body?.departmentId, siteId, req.user);
  const projects = dataService.list('projects');
  const record = { id: id(projects.length + 1, 'j'), ...req.body, siteId } as (typeof projects)[number];
  dataService.create('projects', record);
  await saveReferenceMetadata('projects', record.id, { siteId });
  res.status(201).json({ id: record.id });
}));
router.patch('/projects/:id', asyncHandler(async (req, res) => {
  const project = dataService.find('projects', req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (!canEditAssignedRecord(req.user, project.managerPersonId, project.delegatePersonId)) {
    throw new HttpError(403, 'Only the project manager, their delegate or an admin can change this project.');
  }
  if (req.body?.siteId !== undefined && !req.user?.roles.includes('admin')) throw new HttpError(403, 'Only admins can reassign a record to another site.');
  assertSite(req.body?.siteId);
  if (req.body?.siteId !== undefined) await saveReferenceMetadata('projects', project.id, { siteId: req.body.siteId });
  res.json(patch('projects', req.params.id, req.body));
}));

router.get('/requests', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const requests = dataService.list('requests');
  const metadata = await listReferenceMetadata('requests');
  const withSites = requests.map((row) => ({ ...requestWithProjectSpot(row), ...metadata.get(row.id.toLowerCase()) }))
    .filter((row) => atSite(row.siteId ?? dataService.find('people', row.requesterPersonId ?? '')?.siteId, visibleSite));
  if (req.query.mine !== 'true') {
    res.json(withSites);
    return;
  }
  const me = req.user?.personId;
  res.json(withSites.filter((row) => row.requesterPersonId === me || row.delegatePersonId === me));
}));
router.get('/requests/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('requests', req.params.id);
  if (!record) throw new HttpError(404, 'Opportunity not found.');
  const detail = { ...requestWithProjectSpot(record), ...await getReferenceMetadata('requests', record.id) };
  if (!atSite(detail.siteId ?? dataService.find('people', record.requesterPersonId ?? '')?.siteId, await scopedSite(req))) throw new HttpError(404, 'Opportunity not found.');
  res.json({ ...detail, workflowCompletedAt: dataService.workflowCompletedAt(record.id) });
}));
/** Captures a new intake request; disposition always starts Pending and the phase starts Draft. */
router.post('/requests', asyncHandler(async (req, res) => {
  assertSite(req.body?.siteId);
  const siteId = await resolveCreationSite(req.user, req.body?.siteId);
  if (req.body?.phase === 'Prioritization') opportunitySubmissionSchema.parse(req.body);
  const requests = dataService.list('requests');
  const requester = dataService.find('people', req.user?.personId ?? '');
  const sponsor = req.body?.sponsorPersonId ? dataService.find('people', String(req.body.sponsorPersonId)) : undefined;
  const delegate = req.body?.delegatePersonId ? dataService.find('people', String(req.body.delegatePersonId)) : undefined;
  const department = req.body?.departmentId ? dataService.find('departments', String(req.body.departmentId)) : undefined;
  const shortTitle = String(req.body?.shortTitle ?? '').trim() || 'Untitled opportunity';
  const record = {
    id: id(requests.length + 1, 'r'),
    shortTitle,
    title: shortTitle,
    name: shortTitle,
    spotId: undefined,
    phase: req.body?.phase === 'Prioritization' ? 'Prioritization' : 'Draft',
    status: req.body?.phase === 'Prioritization' ? 'Submitted' : 'Draft',
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
  await saveReferenceMetadata('requests', record.id, { siteId });
  res.status(201).json({ id: record.id });
}));
router.patch('/requests/:id', asyncHandler(async (req, res) => {
  const current = dataService.find('requests', req.params.id);
  if (!current) throw new HttpError(404, 'Opportunity not found.');
  if (!canEditRequest(req.user, current)) throw new HttpError(403, 'You cannot edit this opportunity at its current phase.');
  if (req.body?.siteId !== undefined && !req.user?.roles.includes('admin')) throw new HttpError(403, 'Only admins can reassign a record to another site.');
  const moderator = req.user?.roles.some((role) => role === 'admin' || role === 'intake_moderator');
  const submitting = req.body?.phase === 'Prioritization' && req.body?.status === 'Submitted' && requestStageIndex(current.phase) === 0;
  if (submitting) opportunitySubmissionSchema.parse({ ...current, ...req.body });
  const editableFields = ['title', 'shortTitle', 'spotId', 'siteId', 'location', 'neededBy', 'neededByJustification', 'currentState', 'discoveryMethod', 'impactToOperations', 'desiredFutureState', 'additionalInformation'];
  if (canAssignRequestDelegate(req.user, current)) editableFields.push('sponsorPersonId', 'delegatePersonId');
  if (submitting) editableFields.push('phase', 'status');
  if (!moderator && Object.keys(req.body).some((key) => !editableFields.includes(key))) {
    throw new HttpError(403, 'Only intake moderators and admins can change lifecycle or assignments.');
  }
  assertSite(req.body?.siteId);
  if (req.body?.siteId !== undefined) await saveReferenceMetadata('requests', current.id, { siteId: req.body.siteId });
  const sponsor = req.body?.sponsorPersonId ? dataService.find('people', String(req.body.sponsorPersonId)) : undefined;
  const delegate = req.body?.delegatePersonId ? dataService.find('people', String(req.body.delegatePersonId)) : undefined;
  res.json(patch('requests', req.params.id, {
    ...req.body,
    ...(req.body?.sponsorPersonId !== undefined ? { sponsorName: sponsor?.name, sponsorNameFlat: sponsor?.name ?? '' } : {}),
    ...(req.body?.delegatePersonId !== undefined ? { delegateName: delegate?.name } : {}),
  }));
}));

const editableLookups = ['functions', 'locations', 'programs', 'sites'] as const;
type EditableLookup = (typeof editableLookups)[number];

function lookupTable(value: string): EditableLookup {
  if (!editableLookups.includes(value as EditableLookup)) throw new HttpError(404, 'Reference table not found.');
  return value as EditableLookup;
}

router.get('/lookups/:table', asyncHandler(async (req, res, next) => {
  if (!editableLookups.includes(req.params.table as EditableLookup)) return next();
  const table = lookupTable(req.params.table);
  const visibleSite = table === 'sites' && req.user?.roles.includes('admin') ? undefined : await scopedSite(req);
  const departmentSites = new Set(dataService.list('departments').map((department) => department.siteId).filter(Boolean));
  const legacyLocationSite = table === 'locations' && departmentSites.size === 1 ? [...departmentSites][0] : undefined;
  const rows = await Promise.all(dataService.list(table).map(async (row) => ({
    ...row, ...(legacyLocationSite ? { siteId: legacyLocationSite } : {}), ...await getReferenceMetadata(table, row.id),
  })));
  res.json(rows.filter((row) => table === 'programs' || atSite(table === 'sites' ? row.id : row.siteId, visibleSite)));
}));
router.patch('/lookups/sites/:id/assistants', asyncHandler(async (req, res) => {
  if (!dataService.find('sites', req.params.id)) throw new HttpError(404, 'Site not found.');
  await assertSiteLead(req.user, req.params.id);
  const assistants = referenceMetadataSchema.pick({ assistantLeadPersonIds: true }).required().parse(req.body).assistantLeadPersonIds;
  for (const personId of assistants) {
    if (!dataService.find('people', personId)) throw new HttpError(400, 'Select an existing person as assistant site lead.');
    const assignedSite = await personSiteId(personId);
    if (!req.user?.roles.includes('admin') && assignedSite?.toLowerCase() !== req.params.id.toLowerCase()) {
      throw new HttpError(403, 'Assistant site leads must already belong to your site.');
    }
  }
  for (const personId of assistants) await assignPersonSite(personId, req.params.id);
  await saveReferenceMetadata('sites', req.params.id, { assistantLeadPersonIds: assistants });
  res.json({ id: req.params.id });
}));
router.post('/lookups/:table', requireRole('admin'), asyncHandler(async (req, res) => {
  const table = lookupTable(req.params.table);
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 200) throw new HttpError(400, 'Name must be between 1 and 200 characters.');
  const metadata = referenceMetadataSchema.parse(req.body);
  assertSite(metadata.siteId);
  if (table === 'sites') {
    for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((personId): personId is string => Boolean(personId))) {
      if (!dataService.find('people', personId)) throw new HttpError(400, 'Select a valid site lead.');
    }
  }
  const record = dataService.create(table, { id: randomUUID(), name, row: {} });
  if (Object.keys(metadata).length) await saveReferenceMetadata(table, record.id, metadata);
  if (table === 'sites') {
    for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((personId): personId is string => Boolean(personId))) {
      await assignPersonSite(personId, record.id);
    }
  }
  res.status(201).json({ id: record.id });
}));
router.patch('/lookups/:table/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const table = lookupTable(req.params.table);
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 200) throw new HttpError(400, 'Name must be between 1 and 200 characters.');
  const metadata = referenceMetadataSchema.parse(req.body);
  assertSite(metadata.siteId);
  if (table === 'sites') {
    for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((personId): personId is string => Boolean(personId))) {
      if (!dataService.find('people', personId)) throw new HttpError(400, 'Select a valid site lead.');
    }
  }
  const record = patch(table, req.params.id, { name });
  if (Object.keys(metadata).length) await saveReferenceMetadata(table, req.params.id, metadata);
  if (table === 'sites') {
    for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((personId): personId is string => Boolean(personId))) {
      await assignPersonSite(personId, req.params.id);
    }
  }
  res.json(record);
}));
router.delete('/lookups/:table/:id', requireRole('admin'), (req, res) => {
  const table = lookupTable(req.params.table);
  if (!dataService.remove(table, req.params.id)) throw new HttpError(404, 'Reference record not found.');
  res.status(204).end();
});

router.get('/capacity', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const personId = req.query.mine === 'true' ? req.user?.personId : req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  let rows = dataService.listCapacity();
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (departmentId) rows = rows.filter((row) => row.departmentId === departmentId);
  res.json(rows.filter((row) => atSite(dataService.find('people', row.personId)?.siteId, visibleSite)));
}));

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

router.get('/demand', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const projectSites = await listReferenceMetadata('projects');
  const personId = req.query.mine === 'true' ? req.user?.personId : String(req.query.personId ?? '');  const projectId = String(req.query.projectId ?? '');
  let rows = dataService.list('demand');
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (projectId) rows = rows.filter((row) => row.projectId === projectId);
  res.json(rows.filter((row) => {
    const project = dataService.find('projects', row.projectId);
    const siteId = dataService.find('people', row.personId ?? '')?.siteId
      ?? projectSites.get(row.projectId.toLowerCase())?.siteId
      ?? dataService.find('departments', project?.departmentId ?? '')?.siteId;
    return atSite(siteId, visibleSite);
  }));
}));

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
router.get('/prioritization/requests', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const metadata = await listReferenceMetadata('requests');
  const requests = [...dataService.list('requests')]
    .filter((request) => atSite(metadata.get(request.id.toLowerCase())?.siteId
      ?? dataService.find('people', request.requesterPersonId ?? '')?.siteId, visibleSite))
    .sort((left, right) => Number(right.shortTitle?.startsWith('SAMPLE -')) - Number(left.shortTitle?.startsWith('SAMPLE -')))
    .map((request) => ({
    ...request,
    prioritizationComplete: prioritizationComplete(request.id),
    }));
  res.json(requests);
}));
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
  const request = dataService.find('requests', String(req.body.requestId ?? ''));
  if (!request) throw new HttpError(404, 'Request not found.');
  const moderator = req.user?.roles.some((role) => role === 'admin' || role === 'intake_moderator');
  if (!moderator && (request.phase && request.phase !== 'Draft' && request.phase !== 'Prioritization'
    || !req.user?.personId || req.user.personId.toLowerCase() !== request.sponsorPersonId?.toLowerCase())) {
    throw new HttpError(403, 'Only the sponsor can prioritize this opportunity before it moves past prioritization.');
  }
  const mode = req.body.mode === undefined ? 'complete' : req.body.mode;
  if (mode !== 'draft' && mode !== 'complete') throw new HttpError(400, 'Submission mode must be draft or complete.');
  const questions = dataService.list('questions').filter((question) => question.isActive);
  const submitted = Array.isArray(req.body.answers) ? req.body.answers : [];
  const questionById = new Map(questions.map((question) => [question.id.toLowerCase(), question]));
  const submittedByQuestion = new Map(submitted.map((answer: { questionId?: string }) => [String(answer.questionId ?? '').toLowerCase(), answer]));
  const invalidAnswer = submittedByQuestion.size !== submitted.length || submitted.some((answer: { questionId?: string; score?: number }) =>
    !questionById.has(String(answer.questionId ?? '').toLowerCase())
    || answer.score !== undefined && !prioritizationScores.includes(Number(answer.score)));
  const incomplete = questions.some((question) => {
    const answer = submittedByQuestion.get(question.id.toLowerCase()) as { score?: number; justification?: string } | undefined;
    return !answer || answer.score === undefined
      || question.required !== false && Number(answer.score) === 0
      || Number(answer.score) !== 0 && !String(answer.justification ?? '').trim();
  });
  if (invalidAnswer || mode === 'complete' && (submitted.length !== questions.length || incomplete)) {
    throw new HttpError(400, 'Every active prioritization question requires a rating and justification.');
  }
  const answers = dataService.list('answers');
  for (const submittedAnswer of submitted) {
    const score = submittedAnswer.score as number | undefined;
    const justification = String(submittedAnswer.justification ?? '').trim();
    const methodology = String(submittedAnswer.methodology ?? '').trim();
    if (mode === 'draft' && score === undefined && !justification && !methodology) continue;
    const current = answers.find((answer) => String(answer.requestId).toLowerCase() === String(req.body.requestId).toLowerCase()
      && String(answer.questionId).toLowerCase() === String(submittedAnswer.questionId).toLowerCase());
    const changes = {
      ...(score !== undefined ? { value: scoreLabels[score], score } : {}),
      comment: justification, justification,
      methodology,
    };
    if (current) dataService.update('answers', current.id, changes);
    else dataService.create('answers', {
      id: id(answers.length + 1000, 'c'), requestId: req.body.requestId, questionId: submittedAnswer.questionId, ...changes,
    } as (typeof answers)[number]);
  }
  if (mode === 'draft') {
    res.json({ requestId: req.body.requestId, mode });
    return;
  }
  const breakdown = prioritizationBreakdown(req.body.requestId);
  dataService.update('requests', req.body.requestId, { priorityScore: breakdown.priorityScore, phase: 'DQ Check' });
  const ranked = dataService.list('requests').filter((request) => request.priorityScore !== undefined)
    .sort((left, right) => Number(right.priorityScore ?? 0) - Number(left.priorityScore ?? 0));
  const rank = ranked.findIndex((request) => request.id === req.body.requestId) + 1;
  const quartile = ['Highest quartile', 'Upper-middle quartile', 'Lower-middle quartile', 'Lowest quartile'][Math.min(3, Math.ceil((rank / ranked.length) * 4) - 1)] ?? 'Unranked';
  res.json({ requestId: req.body.requestId, mode, quartile, topTen: rank > 0 && rank <= 10 });
});
router.get('/prioritization/ranking', asyncHandler(async (req, res) => {
  const siteId = await scopedSite(req);
  const metadata = await listReferenceMetadata('requests');
  const rows = dataService.list('requests').filter((request) => request.isActive !== false
    && atSite(metadata.get(request.id.toLowerCase())?.siteId ?? dataService.find('people', request.requesterPersonId ?? '')?.siteId, siteId))
    .map((request) => ({ ...request, ...prioritizationBreakdown(request.id) }))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .map((request, index, all) => ({ ...request, rank: index + 1, quartile: ['Highest quartile', 'Upper-middle quartile', 'Lower-middle quartile', 'Lowest quartile'][Math.min(3, Math.ceil(((index + 1) / all.length) * 4) - 1)], topTen: index < 10 }));
  res.json(rows);
}));
router.get('/users/directory', asyncHandler(async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  if (search.length < 3) {
    res.json([]);
    return;
  }
  res.json(await searchEntraUsers(search));
}));
router.get('/users', (req, res) => {
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const people = dataService.list('people')
    .filter((person) => !search || person.name.toLowerCase().includes(search) || person.email.toLowerCase().includes(search));
  res.json(people.map((person) => ({ id: person.id, personId: person.id, fullName: person.name, email: person.email })));
});
router.get('/admin/portfolio-summary', asyncHandler(async (req, res) => {
  const siteId = await scopedSite(req);
  if (!siteId) {
    res.json(dataService.getPortfolioSummary());
    return;
  }
  const projectSites = await listReferenceMetadata('projects');
  const requestSites = await listReferenceMetadata('requests');
  const capacity = dataService.listCapacity().filter((row) => atSite(dataService.find('people', row.personId)?.siteId, siteId));
  const demand = dataService.listDemand().filter((row) => atSite(dataService.find('people', row.personId ?? '')?.siteId
    ?? projectSites.get(row.projectId.toLowerCase())?.siteId, siteId));
  const sum = (rows: Array<{ weeks: number[] }>) => rows.reduce<number[]>((total, row) =>
    row.weeks.map((hours, week) => (total[week] ?? 0) + hours), new Array(1333).fill(0));
  const availability = sum(capacity);
  const committed = sum(demand);
  res.json({
    projectCount: dataService.list('projects').filter((row) => atSite(projectSites.get(row.id.toLowerCase())?.siteId
      ?? dataService.find('departments', row.departmentId ?? '')?.siteId, siteId)).length,
    requestCount: dataService.list('requests').filter((row) => atSite(requestSites.get(row.id.toLowerCase())?.siteId
      ?? dataService.find('people', row.requesterPersonId ?? '')?.siteId, siteId)).length,
    peopleWithCapacity: capacity.length,
    demandRows: demand.length,
    availability,
    demand: committed,
    net: availability.map((hours, week) => hours - committed[week]),
  });
}));

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

router.get('/non-project-demand', asyncHandler(async (req, res) => {
  const visibleSite = await scopedSite(req);
  const personId = req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  res.json(
    dataService.listNonProjectDemand(personId, departmentId)
      .filter((row) => atSite(dataService.find('people', row.personId)?.siteId, visibleSite)),
  );
}));

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
  res.json({ id: row.id, weeks: row.weeks, isActive: row.isActive });
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


