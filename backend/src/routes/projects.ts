import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertProjectEditable } from '../middleware/recordAccess';
import { projectRepository } from '../repositories/sql';
import type { ProjectView } from '../repositories/sql/ProjectRepository';
import { decodeArray } from '../utils/arrayParser';

const router = Router();

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
  managerPersonId: z.string().min(1).optional(),
  sponsorPersonId: z.string().min(1).optional(),
  delegatePersonId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  lastCheckIn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  programId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
});

function toProject(record: ProjectView) {
  return {
    id: record.ProjectApiId,
    name: record.Name,
    code: record.Code,
    spotId: record.SpotId,
    description: record.Description,
    problemStatement: record.ProblemStatement,
    status: record.StatusCode,
    started: record.Started,
    priorityScore: record.PriorityScore,
    startDate: record.StartDate,
    endDate: record.EndDate,
    managerPersonId: record.ManagerPersonApiId ?? undefined,
    managerName: record.ManagerName ?? undefined,
    sponsorPersonId: record.SponsorPersonApiId ?? undefined,
    sponsorName: record.SponsorName ?? undefined,
    delegatePersonId: record.DelegatePersonApiId ?? undefined,
    delegateName: record.DelegateName ?? undefined,
    isActive: record.IsActive,
    lastCheckIn: record.LastCheckIn,
    programId: record.ProgramApiId ?? undefined,
    programName: record.ProgramName ?? undefined,
    departmentId: record.DepartmentApiId ?? undefined,
    departmentName: record.DepartmentName ?? undefined,
    requestId: record.RequestApiId ?? undefined,
  };
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const records = await projectRepository.listFiltered({
      includeInactive: true,
      managerPersonId: req.query.managerPersonId ? String(req.query.managerPersonId) : undefined,
      departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
    });
    res.json(records.map(toProject));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const record = await projectRepository.findByIdentifier(req.params.id);
    if (!record) throw new HttpError(404, 'Project not found.');
    res.json(toProject(record));
  }),
);

/** Project team with each member's demand array. */
router.get(
  '/:id/team',
  asyncHandler(async (req, res) => {
    const project = await projectRepository.findByIdentifier(req.params.id);
    if (!project?.LegacyDataverseId) throw new HttpError(404, 'Project is not linked to a Dataverse record.');
    const projectId = dv.encodeGuid(project.LegacyDataverseId);
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
    const name = input.name;
    if (!name) throw new HttpError(400, 'Project name is required.');
    const id = await projectRepository.create(await projectRepository.resolveInput({ ...input, name }));
    const created = await projectRepository.findById(id);
    if (!created) throw new HttpError(500, 'Created project could not be retrieved.');
    res.status(201).json({ id: created.ProjectApiId });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertProjectEditable(req.user, req.params.id);
    const input = schema.parse(req.body);
    const current = await projectRepository.findByIdentifier(req.params.id);
    if (!current) throw new HttpError(404, 'Project not found.');
    await projectRepository.update(current.ProjectId, await projectRepository.resolvePartialInput(input));
    if (input.isActive === false) await projectRepository.deactivate(current.ProjectId);
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const project = await projectRepository.findByIdentifier(req.params.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    await projectRepository.deactivate(project.ProjectId);
    res.status(204).end();
  }),
);

export default router;
