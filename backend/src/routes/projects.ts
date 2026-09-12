import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { assertProjectEditable } from '../middleware/recordAccess';
import { decodeArray } from '../utils/arrayParser';

const router = Router();
const PR = COLUMNS.projects;
const select = [
  PR.id,
  PR.name,
  PR.code,
  PR.spotId,
  PR.description,
  PR.problemStatement,
  PR.status,
  PR.started,
  PR.priorityScore,
  PR.startDate,
  PR.endDate,
  PR.managerPersonId,
  PR.sponsorPersonId,
  PR.delegatePersonId,
  PR.isActive,
  PR.lastCheckIn,
  PR.programId,
  PR.departmentId,
  PR.requestId,
];

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  spotId: z.string().max(50).optional(),
  description: z.string().max(4000).optional(),
  problemStatement: z.string().max(4000).optional(),
  status: z.string().max(100).optional(),
  started: z.boolean().optional(),
  priorityScore: z.number().min(0).max(1000).optional(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  managerPersonId: z.string().uuid().optional(),
  sponsorPersonId: z.string().uuid().optional(),
  delegatePersonId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  lastCheckIn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  programId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
});

function toProject(record: Record<string, unknown>) {
  return {
    id: record[PR.id],
    name: record[PR.name],
    code: record[PR.code],
    spotId: record[PR.spotId],
    description: record[PR.description],
    problemStatement: record[PR.problemStatement],
    status: formatted(record, PR.status) ?? record[PR.status],
    started: record[PR.started],
    priorityScore: record[PR.priorityScore],
    startDate: record[PR.startDate],
    endDate: record[PR.endDate],
    managerPersonId: record[PR.managerPersonId],
    managerName: formatted(record, PR.managerPersonId),
    sponsorPersonId: record[PR.sponsorPersonId],
    sponsorName: formatted(record, PR.sponsorPersonId),
    delegatePersonId: record[PR.delegatePersonId],
    delegateName: formatted(record, PR.delegatePersonId),
    isActive: record[PR.isActive],
    lastCheckIn: record[PR.lastCheckIn],
    programId: record[PR.programId],
    programName: formatted(record, PR.programId),
    departmentId: record[PR.departmentId],
    departmentName: formatted(record, PR.departmentId),
    requestId: record[PR.requestId],
  };
}

async function toRecord(input: z.infer<typeof schema>) {
  const record: Record<string, unknown> = {};
  if (input.name !== undefined) record[PR.name] = input.name;
  if (input.code !== undefined) record[PR.code] = input.code;
  if (input.spotId !== undefined) record[PR.spotId] = input.spotId;
  if (input.description !== undefined) record[PR.description] = input.description;
  if (input.problemStatement !== undefined) record[PR.problemStatement] = input.problemStatement;
  if (input.status !== undefined) record[PR.status] = input.status;
  if (input.started !== undefined) record[PR.started] = input.started;
  if (input.priorityScore !== undefined) record[PR.priorityScore] = input.priorityScore;
  if (input.startDate !== undefined) record[PR.startDate] = input.startDate;
  if (input.endDate !== undefined) record[PR.endDate] = input.endDate;
  if (input.lastCheckIn !== undefined) record[PR.lastCheckIn] = input.lastCheckIn;
  if (input.isActive !== undefined) record[PR.isActive] = input.isActive;
  if (input.managerPersonId) Object.assign(record, await dv.lookupBind(PR.managerBind, 'new_people', input.managerPersonId));
  if (input.sponsorPersonId) Object.assign(record, await dv.lookupBind(PR.sponsorBind, 'new_people', input.sponsorPersonId));
  if (input.delegatePersonId) Object.assign(record, await dv.lookupBind(PR.delegateBind, 'new_people', input.delegatePersonId));
  if (input.programId) Object.assign(record, await dv.lookupBind(PR.programBind, 'cr714_programs', input.programId));
  if (input.departmentId) Object.assign(record, await dv.lookupBind(PR.departmentBind, 'new_department', input.departmentId));
  if (input.requestId) Object.assign(record, await dv.lookupBind(PR.requestBind, 'cr714_requests', input.requestId));
  return record;
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    if (req.query.managerPersonId) {
      filters.push(`${PR.managerPersonId} eq ${dv.encodeGuid(String(req.query.managerPersonId))}`);
    }
    if (req.query.departmentId) {
      filters.push(`${PR.departmentId} eq ${dv.encodeGuid(String(req.query.departmentId))}`);
    }
    if (req.query.search) filters.push(`contains(${PR.name},${dv.odataString(String(req.query.search))})`);
    const records = await dv.list('projects', {
      select,
      filter: filters.join(' and ') || undefined,
      orderBy: `${PR.priorityScore} desc,${PR.name} asc`,
      top: 2000,
    });
    res.json(records.map(toProject));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toProject(await dv.retrieve('projects', req.params.id, { select })));
  }),
);

/** Project team with each member's demand array. */
router.get(
  '/:id/team',
  asyncHandler(async (req, res) => {
    const projectId = dv.encodeGuid(req.params.id);
    const DM = COLUMNS.demand;
    const rows = await dv.list('demand', {
      select: [DM.id, DM.personId, DM.functionId, DM.hoursArray, DM.startWeek, DM.endWeek, DM.status],
      filter: `${DM.projectId} eq ${projectId}`,
      top: 5000,
    });
    res.json(
      rows.map((row) => ({
        id: row[DM.id],
        projectId,
        personId: row[DM.personId],
        personName: formatted(row as Record<string, unknown>, DM.personId),
        functionId: row[DM.functionId],
        functionName: formatted(row as Record<string, unknown>, DM.functionId),
        demandHours: row[DM.hoursArray],
        weeks: decodeArray(row[DM.hoursArray] as string | null),
        startWeek: row[DM.startWeek],
        endWeek: row[DM.endWeek],
        status: formatted(row as Record<string, unknown>, DM.status) ?? row[DM.status],
      })),
    );
  }),
);

router.post(
  '/',
  requireRole('admin', 'demand_moderator'),
  asyncHandler(async (req, res) => {
    const input = schema.parse(req.body);
    res.status(201).json({ id: await dv.create('projects', await toRecord(input)) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertProjectEditable(req.user, req.params.id);
    const input = schema.parse(req.body);
    await dv.update('projects', req.params.id, await toRecord(input));
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await dv.remove('projects', req.params.id);
    res.status(204).end();
  }),
);

export default router;
