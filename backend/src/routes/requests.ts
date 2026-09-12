import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const R = COLUMNS.requests;
const select = [
  R.id,
  R.name,
  R.title,
  R.shortTitle,
  R.spotId,
  R.phase,
  R.problemStatement,
  R.businessCase,
  R.expectedBenefit,
  R.status,
  R.submittedOn,
  R.requesterPersonId,
  R.delegatePersonId,
  R.isActive,
  R.departmentId,
  R.categoryId,
  R.priorityScore,
  R.projectId,
];

/** Project capture form payload. */
const captureSchema = z.object({
  title: z.string().min(3).max(200),
  shortTitle: z.string().max(100).optional(),
  spotId: z.string().max(50).optional(),
  phase: z.string().max(100).optional(),
  problemStatement: z.string().min(10).max(4000),
  businessCase: z.string().max(4000).optional(),
  expectedBenefit: z.string().max(4000).optional(),
  departmentId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  delegatePersonId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  status: z.string().max(100).optional(),
});

const updateSchema = captureSchema.partial().extend({
  priorityScore: z.number().min(0).max(1000).optional(),
  projectId: z.string().uuid().optional(),
});

function toRequest(record: Record<string, unknown>) {
  return {
    id: record[R.id],
    name: record[R.name],
    title: record[R.title],
    shortTitle: record[R.shortTitle],
    spotId: record[R.spotId],
    phase: formatted(record, R.phase) ?? record[R.phase],
    problemStatement: record[R.problemStatement],
    businessCase: record[R.businessCase],
    expectedBenefit: record[R.expectedBenefit],
    status: formatted(record, R.status) ?? record[R.status],
    submittedOn: record[R.submittedOn],
    requesterPersonId: record[R.requesterPersonId],
    requesterName: formatted(record, R.requesterPersonId),
    delegatePersonId: record[R.delegatePersonId],
    delegateName: formatted(record, R.delegatePersonId),
    isActive: record[R.isActive],
    departmentId: record[R.departmentId],
    departmentName: formatted(record, R.departmentId),
    categoryId: record[R.categoryId],
    categoryName: formatted(record, R.categoryId),
    priorityScore: record[R.priorityScore],
    projectId: record[R.projectId],
  };
}

async function toRecord(input: z.infer<typeof updateSchema>) {
  const record: Record<string, unknown> = {};
  if (input.title !== undefined) {
    record[R.title] = input.title;
    record[R.name] = input.title;
  }
  if (input.problemStatement !== undefined) record[R.problemStatement] = input.problemStatement;
  if (input.shortTitle !== undefined) record[R.shortTitle] = input.shortTitle;
  if (input.spotId !== undefined) record[R.spotId] = input.spotId;
  if (input.phase !== undefined) record[R.phase] = input.phase;
  if (input.isActive !== undefined) record[R.isActive] = input.isActive;
  if (input.businessCase !== undefined) record[R.businessCase] = input.businessCase;
  if (input.expectedBenefit !== undefined) record[R.expectedBenefit] = input.expectedBenefit;
  if (input.status !== undefined) record[R.status] = input.status;
  if (input.priorityScore !== undefined) record[R.priorityScore] = input.priorityScore;
  if (input.departmentId) Object.assign(record, await dv.lookupBind(R.departmentBind, 'new_department', input.departmentId));
  if (input.categoryId) Object.assign(record, await dv.lookupBind(R.categoryBind, 'cr714_categories', input.categoryId));
  if (input.delegatePersonId) Object.assign(record, await dv.lookupBind(R.delegateBind, 'new_people', input.delegatePersonId));
  if (input.projectId) Object.assign(record, await dv.lookupBind(R.projectBind, 'new_projects', input.projectId));
  return record;
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    if (req.query.mine === 'true' && req.user?.personId) {
      filters.push(`${R.requesterPersonId} eq ${dv.encodeGuid(req.user.personId)}`);
    }
    if (req.query.departmentId) {
      filters.push(`${R.departmentId} eq ${dv.encodeGuid(String(req.query.departmentId))}`);
    }
    if (req.query.status) filters.push(`${R.status} eq ${dv.odataString(String(req.query.status))}`);
    const records = await dv.list('requests', {
      select,
      filter: filters.join(' and ') || undefined,
      orderBy: `${R.priorityScore} desc,${R.submittedOn} desc`,
      top: 2000,
    });
    res.json(records.map(toRequest));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toRequest(await dv.retrieve('requests', req.params.id, { select })));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = captureSchema.parse(req.body);
    const record = await toRecord(input);
    record[R.submittedOn] = new Date().toISOString();
    record[R.status] = input.status ?? 'Submitted';
    record[R.phase] = input.phase ?? 'Draft';
    record[R.isActive] = true;
    if (req.user?.personId) {
      Object.assign(record, await dv.lookupBind(R.requesterBind, 'new_people', req.user.personId));
    }
    res.status(201).json({ id: await dv.create('requests', record) });
  }),
);

router.patch(
  '/:id',
  requireRole('admin', 'demand_moderator', 'availability_moderator'),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    await dv.update('requests', req.params.id, await toRecord(input));
    res.json({ id: req.params.id });
  }),
);

/** Promotes an approved request into a project. */
router.post(
  '/:id/promote',
  requireRole('admin', 'demand_moderator'),
  asyncHandler(async (req, res) => {
    const request = (await dv.retrieve('requests', req.params.id, { select })) as Record<string, unknown>;
    const PR = COLUMNS.projects;
    const project: Record<string, unknown> = {
      [PR.name]: request[R.title] ?? request[R.name],
      [PR.problemStatement]: request[R.problemStatement],
      [PR.description]: request[R.businessCase],
      [PR.status]: 'Planning',
      [PR.priorityScore]: request[R.priorityScore] ?? 0,
    };
    if (request[R.departmentId]) {
      Object.assign(project, await dv.lookupBind(PR.departmentBind, 'new_department', String(request[R.departmentId])));
    }
    Object.assign(project, await dv.lookupBind(PR.requestBind, 'cr714_requests', req.params.id));
    const projectId = await dv.create('projects', project);
    await dv.update('requests', req.params.id, {
      [R.status]: 'Approved',
      ...(await dv.lookupBind(R.projectBind, 'new_projects', projectId)),
    });
    res.status(201).json({ projectId });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await dv.remove('requests', req.params.id);
    res.status(204).end();
  }),
);

export default router;
