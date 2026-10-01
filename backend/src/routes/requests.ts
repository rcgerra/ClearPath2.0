import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { projectRepository, requestRepository } from '../repositories/sql';
import { canAssignRequestDelegate, canEditRequest } from '../demo/demoPermissions';
import { assertReferenceSite, getReferenceMetadata, listReferenceMetadata, saveReferenceMetadata } from '../services/referenceMetadata';
import { opportunitySubmissionSchema } from '../services/opportunitySubmission';
import { requestStageIndex } from '../services/requestWorkflow';
import { resolveCreationSite } from '../services/siteScope';
import { personSiteId, viewSiteForRequest } from '../services/siteScope';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';

const router = Router();

const captureSchema = z.object({
  title: z.string().min(3).max(200),
  shortTitle: z.string().max(100).optional(),
  spotId: z.string().max(50).optional(),
  phase: z.string().max(100).optional(),
  disposition: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  siteId: z.string().max(36).optional(),
  neededBy: z.string().max(50).optional(),
  neededByJustification: z.string().max(4000).optional(),
  currentState: z.string().min(10).max(4000),
  discoveryMethod: z.string().max(4000).optional(),
  impactToOperations: z.string().max(4000).optional(),
  desiredFutureState: z.string().max(4000).optional(),
  additionalInformation: z.string().max(4000).optional(),
  departmentId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  delegatePersonId: z.string().min(1).optional(),
  sponsorPersonId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  status: z.string().max(100).optional(),
});

const updateSchema = captureSchema.partial().extend({
  priorityScore: z.number().min(0).max(1000).optional(),
  projectId: z.string().min(1).optional(),
});

function toRequest(record: Awaited<ReturnType<typeof requestRepository.findById>>) {
  if (!record) throw new HttpError(404, 'Opportunity not found.');
  return {
    id: record.RequestApiId,
    name: record.Name,
    title: record.Title ?? record.Name,
    shortTitle: record.ShortTitle,
    spotId: record.ProjectApiId ? record.ProjectSpotId : record.SpotId,
    phase: record.Phase,
    disposition: record.Disposition,
    location: undefined,
    neededBy: record.WhenNeeded,
    neededByJustification: record.WhenNeededJustification,
    currentState: record.CurrentState,
    discoveryMethod: record.HowDiscovered,
    impactToOperations: record.Impact,
    desiredFutureState: record.DesiredFutureState,
    additionalInformation: record.AdditionalInformation,
    status: record.Status,
    submittedOn: record.SubmittedOn,
    requesterPersonId: record.RequesterPersonApiId ?? undefined,
    requesterName: record.RequesterName ?? undefined,
    delegatePersonId: record.DelegatePersonApiId ?? undefined,
    delegateName: record.DelegateName ?? undefined,
    sponsorPersonId: record.SponsorPersonApiId ?? undefined,
    sponsorName: record.SponsorPersonName ?? record.SponsorNameFlat ?? undefined,
    isActive: record.IsActive,
    departmentId: record.DepartmentApiId ?? undefined,
    departmentName: record.DepartmentName ?? undefined,
    categoryId: record.CategoryApiId ?? undefined,
    categoryName: record.CategoryName ?? undefined,
    priorityScore: record.PriorityScore,
    projectId: record.ProjectApiId ?? undefined,
  };
}

async function resolveInput(input: z.infer<typeof updateSchema>) {
  return {
    Name: input.title,
    Title: input.title,
    ShortTitle: input.shortTitle,
    SpotId: input.spotId,
    Phase: input.phase,
    Disposition: input.disposition,
    WhenNeeded: input.neededBy,
    WhenNeededJustification: input.neededByJustification,
    CurrentState: input.currentState,
    HowDiscovered: input.discoveryMethod,
    Impact: input.impactToOperations,
    DesiredFutureState: input.desiredFutureState,
    AdditionalInformation: input.additionalInformation,
    Status: input.status,
    IsActive: input.isActive,
    PriorityScore: input.priorityScore,
    DepartmentId: input.departmentId === undefined ? undefined : await requestRepository.resolveId('Departments', 'DepartmentId', input.departmentId),
    CategoryId: input.categoryId === undefined ? undefined : await requestRepository.resolveId('ScoringCategories', 'CategoryId', input.categoryId),
    DelegatePersonId: input.delegatePersonId === undefined ? undefined : await requestRepository.resolvePersonId(input.delegatePersonId),
    SponsorUserId: input.sponsorPersonId === undefined ? undefined : await requestRepository.resolveUserId(input.sponsorPersonId),
    ProjectId: input.projectId === undefined ? undefined : await requestRepository.resolveId('Projects', 'ProjectId', input.projectId),
  };
}

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const records = await requestRepository.listFiltered({
    includeInactive: true,
    minePersonId: req.query.mine === 'true' ? req.user?.personId : undefined,
    departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
  });
  const metadata = await listReferenceMetadata('requests');
  const siteId = await viewSiteForRequest(req);
  const peopleSites = siteId ? new Map((await dv.list('people', { select: [COLUMNS.people.id, COLUMNS.people.siteId], top: 2000 }))
    .map((person) => [String(person[COLUMNS.people.id]).toLowerCase(), String(person[COLUMNS.people.siteId] ?? '')])) : new Map<string, string>();
  res.json(records.map((record) => ({ ...toRequest(record), ...metadata.get(record.RequestApiId.toLowerCase()) }))
    .filter((request) => !siteId || (request.siteId ?? peopleSites.get(String(request.requesterPersonId ?? '').toLowerCase()))?.toLowerCase() === siteId.toLowerCase()));
}));

router.get('/analytics/stage-durations', asyncHandler(async (_req, res) => {
  res.json(await requestRepository.stageDurationAnalytics());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const record = await requestRepository.findByIdentifier(req.params.id);
  const details = toRequest(record);
  const metadata = await getReferenceMetadata('requests', details.id);
  const siteId = await viewSiteForRequest(req);
  if (siteId && (metadata.siteId ?? await personSiteId(details.requesterPersonId))?.toLowerCase() !== siteId.toLowerCase()) throw new HttpError(404, 'Opportunity not found.');
  res.json({ ...details, ...metadata, workflowCompletedAt: await requestRepository.workflowCompletedAt(record!.RequestId) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = captureSchema.parse(req.body);
  if (input.phase === 'Prioritization') opportunitySubmissionSchema.parse(input);
  const siteId = await resolveCreationSite(req.user, input.siteId);
  const requesterPersonId = req.user?.personId ? await requestRepository.resolvePersonId(req.user.personId) : null;
  const id = await requestRepository.create({
    ...(await resolveInput(input)),
    Name: input.title,
    Title: input.title,
    RequesterPersonId: requesterPersonId,
    SubmittedOn: new Date(),
    Status: input.status ?? 'Submitted',
    Phase: input.phase ?? 'Draft',
    IsActive: true,
  });
  const created = await requestRepository.findById(id);
  const apiId = toRequest(created).id;
  await saveReferenceMetadata('requests', apiId, { siteId, location: input.location });
  res.status(201).json({ id: apiId });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const input = updateSchema.parse(req.body);
  if (input.siteId !== undefined && !req.user?.roles.includes('admin')) throw new HttpError(403, 'Only admins can reassign a record to another site.');
  await assertReferenceSite(input.siteId);
  const current = await requestRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Opportunity not found.');
  if (!canEditRequest(req.user, toRequest(current))) throw new HttpError(403, 'You cannot edit this opportunity at its current phase.');
  const moderator = req.user?.roles.some((role) => role === 'admin' || role === 'portfolio_manager' || role === 'intake_moderator');
  const submitting = input.phase === 'Prioritization' && input.status === 'Submitted' && requestStageIndex(current.Phase) === 0;
  if (submitting) opportunitySubmissionSchema.parse({ ...toRequest(current), ...req.body });
  if (!moderator && (['disposition', 'isActive', 'priorityScore', 'projectId'].some((key) => key in input)
    || (('phase' in input || 'status' in input) && !submitting)
    || ('sponsorPersonId' in input && !canAssignRequestDelegate(req.user, toRequest(current)))
    || ('delegatePersonId' in input && !canAssignRequestDelegate(req.user, toRequest(current))))) {
    throw new HttpError(403, 'Only intake moderators and admins can change lifecycle or assignments.');
  }
  await requestRepository.update(current.RequestId, await resolveInput(input));
  if (input.siteId !== undefined || input.location !== undefined) {
    await saveReferenceMetadata('requests', current.RequestApiId, {
      ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
    });
  }
  res.json({ id: req.params.id });
}));

router.post('/:id/promote', requireRole('admin'), asyncHandler(async (req, res) => {
  const current = await requestRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Request not found.');
  const siteId = (await getReferenceMetadata('requests', current.RequestApiId)).siteId;
  const projectId = await projectRepository.create(await projectRepository.resolveInput({
    name: current.Title ?? current.Name,
    problemStatement: current.CurrentState,
    description: current.DesiredFutureState,
    status: 'Planning',
    priorityScore: current.PriorityScore ?? 0,
    requestId: String(current.RequestId),
    departmentId: current.DepartmentApiId ?? undefined,
    siteId,
  }));
  const project = await projectRepository.findById(projectId);
  if (!project) throw new HttpError(500, 'Promoted project could not be retrieved.');
  if (siteId) await saveReferenceMetadata('projects', project.ProjectApiId, { siteId });
  await requestRepository.update(current.RequestId, { Status: 'Approved', ProjectId: projectId });
  res.status(201).json({ projectId: project.ProjectApiId });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const request = await requestRepository.findByIdentifier(req.params.id);
  if (!request) throw new HttpError(404, 'Request not found.');
  await requestRepository.deactivate(request.RequestId);
  res.status(204).end();
}));

export default router;
