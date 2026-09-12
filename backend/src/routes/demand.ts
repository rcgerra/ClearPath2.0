import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertDemandEditable, projectIdForDemand } from '../middleware/recordAccess';
import { decodeArray, encodeArray, setWeekRange, setWeekValue } from '../utils/arrayParser';

const router = Router();
const D = COLUMNS.demand;
const select = [D.id, D.name, D.projectId, D.personId, D.functionId, D.hoursArray, D.startWeek, D.endWeek, D.status, D.isActive];

const createSchema = z.object({
  projectId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  functionId: z.string().uuid().optional(),
  name: z.string().max(200).optional(),
  status: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  startWeek: z.number().int().min(0).max(1332).optional(),
  endWeek: z.number().int().min(0).max(1332).optional(),
  hoursPerWeek: z.number().int().min(0).max(99).optional(),
  weeks: z.array(z.number().int().min(0).max(99)).max(1333).optional(),
});

const weekUpdateSchema = z.object({
  week: z.number().int().min(0).max(1332).optional(),
  startWeek: z.number().int().min(0).max(1332).optional(),
  endWeek: z.number().int().min(0).max(1332).optional(),
  hours: z.number().int().min(0).max(99),
});

function toDemand(record: Record<string, unknown>) {
  return {
    id: record[D.id],
    name: record[D.name],
    projectId: record[D.projectId],
    projectName: formatted(record, D.projectId),
    personId: record[D.personId],
    personName: formatted(record, D.personId),
    functionId: record[D.functionId],
    functionName: formatted(record, D.functionId),
    demandHours: record[D.hoursArray],
    weeks: decodeArray(record[D.hoursArray] as string | null),
    startWeek: record[D.startWeek],
    endWeek: record[D.endWeek],
    status: formatted(record, D.status) ?? record[D.status],
    isActive: record[D.isActive],
  };
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    if (req.query.projectId) filters.push(`${D.projectId} eq ${dv.encodeGuid(String(req.query.projectId))}`);
    if (req.query.personId) filters.push(`${D.personId} eq ${dv.encodeGuid(String(req.query.personId))}`);
    if (req.query.mine === 'true') {
      if (!req.user?.personId) throw new HttpError(400, 'No person record is linked to your account.');
      filters.push(`${D.personId} eq ${dv.encodeGuid(req.user.personId)}`);
    }
    const records = await dv.list('demand', {
      select,
      filter: filters.join(' and ') || undefined,
      top: 5000,
    });
    res.json(records.map(toDemand));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toDemand(await dv.retrieve('demand', req.params.id, { select })));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    await assertDemandEditable(req.user, input.projectId);

    if (input.personId) {
      const existing = await dv.list('demand', {
        select: [D.id],
        filter: `${D.projectId} eq ${dv.encodeGuid(input.projectId)} and ${D.personId} eq ${dv.encodeGuid(input.personId)}`,
        top: 1,
        includeFormattedValues: false,
      });
      if (existing.length) throw new HttpError(409, 'That person is already on this project team.');
    }
    let encoded: string;
    if (input.weeks) {
      encoded = encodeArray(input.weeks);
    } else if (input.startWeek !== undefined && input.endWeek !== undefined && input.hoursPerWeek !== undefined) {
      if (input.endWeek < input.startWeek) throw new HttpError(400, 'endWeek must be on or after startWeek.');
      encoded = setWeekRange(null, input.startWeek, input.endWeek, input.hoursPerWeek);
    } else {
      encoded = encodeArray([]);
    }

    const record: Record<string, unknown> = {
      [D.hoursArray]: encoded,
      [D.status]: input.status ?? 'Planned',
    };
    if (input.name) record[D.name] = input.name;
    if (input.startWeek !== undefined) record[D.startWeek] = input.startWeek;
    if (input.endWeek !== undefined) record[D.endWeek] = input.endWeek;
    Object.assign(record, await dv.lookupBind(D.projectBind, 'new_projects', input.projectId));
    if (input.personId) Object.assign(record, await dv.lookupBind(D.personBind, 'new_people', input.personId));
    if (input.functionId) Object.assign(record, await dv.lookupBind(D.functionBind, 'new_functions', input.functionId));

    res.status(201).json({ id: await dv.create('demand', record) });
  }),
);

/** Sets hours for a single week or an inclusive week range on an existing demand row. */
router.patch(
  '/:id/weeks',
  asyncHandler(async (req, res) => {
    await assertDemandEditable(req.user, await projectIdForDemand(req.params.id));
    const input = weekUpdateSchema.parse(req.body);
    const current = (await dv.retrieve('demand', req.params.id, { select: [D.id, D.hoursArray] })) as Record<
      string,
      unknown
    >;
    const existing = (current[D.hoursArray] as string | null) ?? null;

    let encoded: string;
    if (input.week !== undefined) {
      encoded = setWeekValue(existing, input.week, input.hours);
    } else if (input.startWeek !== undefined && input.endWeek !== undefined) {
      if (input.endWeek < input.startWeek) throw new HttpError(400, 'endWeek must be on or after startWeek.');
      encoded = setWeekRange(existing, input.startWeek, input.endWeek, input.hours);
    } else {
      throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
    }

    await dv.update('demand', req.params.id, { [D.hoursArray]: encoded });
    res.json({ id: req.params.id, weeks: decodeArray(encoded) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertDemandEditable(req.user, await projectIdForDemand(req.params.id));
    const input = createSchema.partial().parse(req.body);
    const record: Record<string, unknown> = {};
    if (input.weeks) record[D.hoursArray] = encodeArray(input.weeks);
    if (input.name !== undefined) record[D.name] = input.name;
    if (input.status !== undefined) record[D.status] = input.status;
    if (input.isActive !== undefined) record[D.isActive] = input.isActive;
    if (input.startWeek !== undefined) record[D.startWeek] = input.startWeek;
    if (input.endWeek !== undefined) record[D.endWeek] = input.endWeek;
    if (input.personId) Object.assign(record, await dv.lookupBind(D.personBind, 'new_people', input.personId));
    if (input.functionId) Object.assign(record, await dv.lookupBind(D.functionBind, 'new_functions', input.functionId));
    await dv.update('demand', req.params.id, record);
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertDemandEditable(req.user, await projectIdForDemand(req.params.id));
    await dv.remove('demand', req.params.id);
    res.status(204).end();
  }),
);

export default router;
