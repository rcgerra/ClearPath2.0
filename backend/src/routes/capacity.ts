import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertAvailabilityEditable, ownerForCapacity } from '../middleware/recordAccess';
import { aggregateArrays, decodeArray, encodeArray, setWeekRange, setWeekValue } from '../utils/arrayParser';

const router = Router();
const C = COLUMNS.capacity;
const D = COLUMNS.demand;
const select = [C.id, C.name, C.personId, C.departmentId, C.hoursArray, C.weeklyBaseline, C.notes, C.isActive];

const upsertSchema = z.object({
  personId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  name: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  weeklyBaseline: z.number().int().min(0).max(99).optional(),
  weeks: z.array(z.number().int().min(0).max(99)).max(1333).optional(),
});

const weekUpdateSchema = z.object({
  week: z.number().int().min(0).max(1332).optional(),
  startWeek: z.number().int().min(0).max(1332).optional(),
  endWeek: z.number().int().min(0).max(1332).optional(),
  hours: z.number().int().min(0).max(99),
});

function toCapacity(record: Record<string, unknown>) {
  return {
    id: record[C.id],
    name: record[C.name],
    personId: record[C.personId],
    personName: formatted(record, C.personId),
    departmentId: record[C.departmentId],
    departmentName: formatted(record, C.departmentId),
    availabilityHours: record[C.hoursArray],
    weeks: decodeArray(record[C.hoursArray] as string | null),
    weeklyBaseline: record[C.weeklyBaseline],
    notes: record[C.notes],
    isActive: record[C.isActive],
  };
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    if (req.query.personId) filters.push(`${C.personId} eq ${dv.encodeGuid(String(req.query.personId))}`);
    if (req.query.departmentId) filters.push(`${C.departmentId} eq ${dv.encodeGuid(String(req.query.departmentId))}`);
    if (req.query.mine === 'true') {
      if (!req.user?.personId) throw new HttpError(400, 'No person record is linked to your account.');
      filters.push(`${C.personId} eq ${dv.encodeGuid(req.user.personId)}`);
    }
    const records = await dv.list('capacity', { select, filter: filters.join(' and ') || undefined, top: 5000 });
    res.json(records.map(toCapacity));
  }),
);

/** Availability minus committed demand, per week, for one person. */
router.get(
  '/person/:personId/net',
  asyncHandler(async (req, res) => {
    const personId = dv.encodeGuid(req.params.personId);
    const [capacity, demand] = await Promise.all([
      dv.list('capacity', { select: [C.id, C.hoursArray], filter: `${C.personId} eq ${personId}`, top: 100 }),
      dv.list('demand', {
        select: [D.id, D.projectId, D.hoursArray],
        filter: `${D.personId} eq ${personId}`,
        top: 1000,
      }),
    ]);

    const availability = aggregateArrays(capacity.map((row) => row[C.hoursArray] as string | null));
    const committed = aggregateArrays(demand.map((row) => row[D.hoursArray] as string | null));
    res.json({
      personId,
      availability,
      demand: committed,
      net: availability.map((value, index) => value - committed[index]),
      overAllocatedWeeks: availability
        .map((value, index) => ({ week: index, over: committed[index] - value }))
        .filter((entry) => entry.over > 0),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = upsertSchema.parse(req.body);
    await assertAvailabilityEditable(req.user, { personId: input.personId, departmentId: input.departmentId });
    const record: Record<string, unknown> = {
      [C.hoursArray]: encodeArray(input.weeks ?? []),
    };
    if (input.name) record[C.name] = input.name;
    if (input.notes !== undefined) record[C.notes] = input.notes;
    if (input.weeklyBaseline !== undefined) record[C.weeklyBaseline] = input.weeklyBaseline;
    Object.assign(record, await dv.lookupBind(C.personBind, 'new_people', input.personId));
    if (input.departmentId) {
      Object.assign(record, await dv.lookupBind(C.departmentBind, 'new_department', input.departmentId));
    }
    res.status(201).json({ id: await dv.create('capacity', record) });
  }),
);

router.patch(
  '/:id/weeks',
  asyncHandler(async (req, res) => {
    const input = weekUpdateSchema.parse(req.body);
    const current = (await dv.retrieve('capacity', req.params.id, {
      select: [C.id, C.personId, C.departmentId, C.hoursArray],
    })) as Record<string, unknown>;

    await assertAvailabilityEditable(req.user, {
      personId: current[C.personId] ? String(current[C.personId]) : undefined,
      departmentId: current[C.departmentId] ? String(current[C.departmentId]) : undefined,
    });

    const existing = (current[C.hoursArray] as string | null) ?? null;
    let encoded: string;
    if (input.week !== undefined) {
      encoded = setWeekValue(existing, input.week, input.hours);
    } else if (input.startWeek !== undefined && input.endWeek !== undefined) {
      if (input.endWeek < input.startWeek) throw new HttpError(400, 'endWeek must be on or after startWeek.');
      encoded = setWeekRange(existing, input.startWeek, input.endWeek, input.hours);
    } else {
      throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
    }

    await dv.update('capacity', req.params.id, { [C.hoursArray]: encoded });
    res.json({ id: req.params.id, weeks: decodeArray(encoded) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertAvailabilityEditable(req.user, await ownerForCapacity(req.params.id));
    const input = upsertSchema.partial().parse(req.body);
    const record: Record<string, unknown> = {};
    if (input.weeks) record[C.hoursArray] = encodeArray(input.weeks);
    if (input.name !== undefined) record[C.name] = input.name;
    if (input.notes !== undefined) record[C.notes] = input.notes;
    if (input.weeklyBaseline !== undefined) record[C.weeklyBaseline] = input.weeklyBaseline;
    if (input.isActive !== undefined) record[C.isActive] = input.isActive;
    if (input.departmentId) {
      Object.assign(record, await dv.lookupBind(C.departmentBind, 'new_department', input.departmentId));
    }
    await dv.update('capacity', req.params.id, record);
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertAvailabilityEditable(req.user, await ownerForCapacity(req.params.id));
    await dv.remove('capacity', req.params.id);
    res.status(204).end();
  }),
);

export default router;
