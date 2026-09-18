import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { projectRepository, requestRepository } from '../repositories/sql';

const router = Router();

const captureSchema = z.object({
  title: z.string().min(3).max(200),
  shortTitle: z.string().max(100).optional(),
  spotId: z.string().max(50).optional(),
  phase: z.string().max(100).optional(),
  problemStatement: z.string().min(10).max(4000),
  businessCase: z.string().max(4000).optional(),
  expectedBenefit: z.string().max(4000).optional(),
  departmentId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  delegatePersonId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  status: z.string().max(100).optional(),
});

const updateSchema = captureSchema.partial().extend({
  priorityScore: z.number().min(0).max(1000).optional(),
  projectId: z.string().min(1).optional(),
});

function toRequest(record: Awaited<ReturnType<typeof requestRepository.findById>>) {
  if (!record) throw new HttpError(404, 'Request not found.');
  return {
    id: record.RequestApiId,
    name: record.Name,
    title: record.Title ?? record.Name,
    shortTitle: record.ShortTitle,
    spotId: record.SpotId,
    phase: record.Phase,
    problemStatement: record.ProblemStatement,
    businessCase: record.BusinessCase,
    expectedBenefit: record.ExpectedBenefit,
    status: record.Status,
    submittedOn: record.SubmittedOn,
    requesterPersonId: record.RequesterPersonApiId ?? undefined,
    requesterName: record.RequesterName ?? undefined,
    delegatePersonId: record.DelegatePersonApiId ?? undefined,
    delegateName: record.DelegateName ?? undefined,
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
    ProblemStatement: input.problemStatement,
    BusinessCase: input.businessCase,
    ExpectedBenefit: input.expectedBenefit,
    Status: input.status,
    IsActive: input.isActive,
    PriorityScore: input.priorityScore,
    DepartmentId: input.departmentId === undefined ? undefined : await requestRepository.resolveId('Departments', 'DepartmentId', input.departmentId),
    CategoryId: input.categoryId === undefined ? undefined : await requestRepository.resolveId('ScoringCategories', 'CategoryId', input.categoryId),
    DelegatePersonId: input.delegatePersonId === undefined ? undefined : await requestRepository.resolvePersonId(input.delegatePersonId),
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
  res.json(records.map(toRequest));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(toRequest(await requestRepository.findByIdentifier(req.params.id)));
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = captureSchema.parse(req.body);
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
  res.status(201).json({ id: toRequest(created).id });
}));

router.patch('/:id', requireRole('admin', 'demand_moderator', 'availability_moderator'), asyncHandler(async (req, res) => {
  const input = updateSchema.parse(req.body);
  const current = await requestRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Request not found.');
  await requestRepository.update(current.RequestId, await resolveInput(input));
  res.json({ id: req.params.id });
}));

router.post('/:id/promote', requireRole('admin', 'demand_moderator'), asyncHandler(async (req, res) => {
  const current = await requestRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Request not found.');
  const projectId = await projectRepository.create(await projectRepository.resolveInput({
    name: current.Title ?? current.Name,
    problemStatement: current.ProblemStatement,
    description: current.BusinessCase,
    status: 'Planning',
    priorityScore: current.PriorityScore ?? 0,
    requestId: String(current.RequestId),
    departmentId: current.DepartmentApiId ?? undefined,
  }));
  const project = await projectRepository.findById(projectId);
  if (!project) throw new HttpError(500, 'Promoted project could not be retrieved.');
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
