import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { assertDepartmentEditable } from '../middleware/recordAccess';
import { asyncHandler, HttpError } from '../middleware/errorHandler';

const router = Router();
const P = COLUMNS.people;

const select = [
  P.id,
  P.name,
  P.email,
  P.role,
  P.title,
  P.employmentType,
  P.ftePercent,
  P.weeklyHours,
  P.isActive,
  P.userId,
  P.departmentId,
  P.functionId,
  P.siteId,
  P.skillsetId,
];

function toPerson(record: Record<string, unknown>) {
  return {
    id: record[P.id],
    name: record[P.name],
    email: record[P.email],
    role: record[P.role],
    title: record[P.title],
    employmentType: formatted(record, P.employmentType) ?? record[P.employmentType],
    ftePercent: record[P.ftePercent],
    weeklyHours: record[P.weeklyHours],
    isActive: record[P.isActive],
    userId: record[P.userId],
    departmentId: record[P.departmentId],
    departmentName: formatted(record, P.departmentId),
    functionId: record[P.functionId],
    functionName: formatted(record, P.functionId),
    siteId: record[P.siteId],
    siteName: formatted(record, P.siteId),
    skillsetId: record[P.skillsetId],
    skillsetName: formatted(record, P.skillsetId),
  };
}

const upsertSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional(),
  role: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  employmentType: z.string().max(50).optional(),
  ftePercent: z.number().min(0).max(100).optional(),
  weeklyHours: z.number().min(0).max(99).optional(),
  isActive: z.boolean().optional(),
  departmentId: z.string().uuid().optional(),
  functionId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  skillsetId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

async function toRecord(input: z.infer<typeof upsertSchema>) {
  const record: Record<string, unknown> = {};
  if (input.name !== undefined) record[P.name] = input.name;
  if (input.email !== undefined) record[P.email] = input.email;
  if (input.role !== undefined) record[P.role] = input.role;
  if (input.title !== undefined) record[P.title] = input.title;
  if (input.employmentType !== undefined) record[P.employmentType] = input.employmentType;
  if (input.ftePercent !== undefined) record[P.ftePercent] = input.ftePercent;
  if (input.weeklyHours !== undefined) record[P.weeklyHours] = input.weeklyHours;
  if (input.isActive !== undefined) record[P.isActive] = input.isActive;
  if (input.departmentId) Object.assign(record, await dv.lookupBind(P.departmentBind, 'new_department', input.departmentId));
  if (input.functionId) Object.assign(record, await dv.lookupBind(P.functionBind, 'new_functions', input.functionId));
  if (input.siteId) Object.assign(record, await dv.lookupBind(P.siteBind, 'new_sites', input.siteId));
  if (input.skillsetId) Object.assign(record, await dv.lookupBind(P.skillsetBind, 'new_skillsets', input.skillsetId));
  if (input.userId) Object.assign(record, await dv.lookupBind(P.userBind, 'systemuser', input.userId));
  return record;
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    if (req.query.departmentId) {
      filters.push(`${P.departmentId} eq ${dv.encodeGuid(String(req.query.departmentId))}`);
    }
    if (req.query.functionId) {
      filters.push(`${P.functionId} eq ${dv.encodeGuid(String(req.query.functionId))}`);
    }
    if (req.query.active === 'true') filters.push(`${P.isActive} eq true`);
    if (req.query.search) {
      filters.push(`contains(${P.name},${dv.odataString(String(req.query.search))})`);
    }
    const records = await dv.list('people', {
      select,
      filter: filters.join(' and ') || undefined,
      orderBy: `${P.name} asc`,
      top: 2000,
    });
    res.json(records.map(toPerson));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const record = await dv.retrieve('people', req.params.id, { select });
    res.json(toPerson(record));
  }),
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = upsertSchema.parse(req.body);
    const id = await dv.create('people', await toRecord(input));
    res.status(201).json({ id });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = upsertSchema.parse(req.body);
    const isAdmin = Boolean(req.user?.roles.includes('admin'));
    const isSelf = Boolean(req.user?.personId && req.user.personId.toLowerCase() === req.params.id.toLowerCase());
    if (!isAdmin && !isSelf) {
      const current = await dv.retrieve('people', req.params.id, { select: [P.id, P.departmentId] }) as Record<string, unknown>;
      const currentDepartmentId = current[P.departmentId] ? String(current[P.departmentId]) : undefined;
      if (!currentDepartmentId) throw new HttpError(403, 'The person is not assigned to a department you manage.');
      await assertDepartmentEditable(req.user, currentDepartmentId);
      const disallowed = Object.entries(input).some(([key, value]) => key !== 'departmentId' && value !== undefined);
      if (disallowed) throw new HttpError(403, 'Department leads and delegates may only transfer team members.');
    }
    await dv.update('people', req.params.id, await toRecord(input));
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await dv.remove('people', req.params.id);
    res.status(204).end();
  }),
);

export default router;
