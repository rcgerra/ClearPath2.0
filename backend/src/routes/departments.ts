import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { assertDepartmentEditable } from '../middleware/recordAccess';

const router = Router();
const D = COLUMNS.departments;
const select = [D.id, D.name, D.code, D.leadPersonId, D.delegatePersonId, D.functionId, D.lastCheckIn, D.isActive];

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  leadPersonId: z.string().uuid().optional(),
  delegatePersonId: z.string().uuid().optional(),
  functionId: z.string().uuid().optional(),
  lastCheckIn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  isActive: z.boolean().optional(),
});

function toDepartment(record: Record<string, unknown>) {
  return {
    id: record[D.id],
    name: record[D.name],
    code: record[D.code],
    leadPersonId: record[D.leadPersonId],
    leadName: formatted(record, D.leadPersonId),
    delegatePersonId: record[D.delegatePersonId],
    delegateName: formatted(record, D.delegatePersonId),
    functionId: record[D.functionId],
    functionName: formatted(record, D.functionId),
    lastCheckIn: record[D.lastCheckIn],
    isActive: record[D.isActive],
  };
}

async function toRecord(input: z.infer<typeof schema>) {
  const record: Record<string, unknown> = {};
  if (input.name !== undefined) record[D.name] = input.name;
  if (input.code !== undefined) record[D.code] = input.code;
  if (input.isActive !== undefined) record[D.isActive] = input.isActive;
  if (input.lastCheckIn !== undefined) record[D.lastCheckIn] = input.lastCheckIn;
  if (input.leadPersonId) Object.assign(record, await dv.lookupBind(D.leadBind, 'new_people', input.leadPersonId));
  if (input.delegatePersonId) Object.assign(record, await dv.lookupBind(D.delegateBind, 'new_people', input.delegatePersonId));
  if (input.functionId) Object.assign(record, await dv.lookupBind(D.functionBind, 'new_functions', input.functionId));
  return record;
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const records = await dv.list('departments', { select, orderBy: `${D.name} asc`, top: 1000 });
    res.json(records.map(toDepartment));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toDepartment(await dv.retrieve('departments', req.params.id, { select })));
  }),
);

/** Department roster with encoded availability for each member. */
router.get(
  '/:id/team',
  asyncHandler(async (req, res) => {
    const departmentId = dv.encodeGuid(req.params.id);
    const P = COLUMNS.people;
    const C = COLUMNS.capacity;
    const people = await dv.list('people', {
      select: [P.id, P.name, P.email, P.role, P.title, P.weeklyHours, P.functionId, P.isActive],
      filter: `${P.departmentId} eq ${departmentId}`,
      orderBy: `${P.name} asc`,
      top: 2000,
    });
    const capacity = await dv.list('capacity', {
      select: [C.id, C.personId, C.hoursArray, C.weeklyBaseline],
      filter: `${C.departmentId} eq ${departmentId}`,
      top: 5000,
    });
    const capacityByPerson = new Map(capacity.map((row) => [String(row[C.personId]), row]));
    res.json(
      people.map((person) => {
        const row = capacityByPerson.get(String(person[P.id]));
        return {
          id: person[P.id],
          name: person[P.name],
          email: person[P.email],
          role: person[P.role],
          title: person[P.title],
          weeklyHours: person[P.weeklyHours],
          functionId: person[P.functionId],
          functionName: formatted(person as Record<string, unknown>, P.functionId),
          isActive: person[P.isActive],
          capacityId: row?.[C.id] ?? null,
          availabilityHours: row?.[C.hoursArray] ?? null,
          weeklyBaseline: row?.[C.weeklyBaseline] ?? null,
        };
      }),
    );
  }),
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = schema.parse(req.body);
    res.status(201).json({ id: await dv.create('departments', await toRecord(input)) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertDepartmentEditable(req.user, req.params.id);
    const input = schema.parse(req.body);
    await dv.update('departments', req.params.id, await toRecord(input));
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await dv.remove('departments', req.params.id);
    res.status(204).end();
  }),
);

export default router;
