import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { demoDataService } from '../demo/demoDataService';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { projectRepository } from '../repositories/sql';
import {
  GOVERNANCE_COMPLETE_PHASE,
  GOVERNANCE_STAGES,
  SG1_DISPOSITIONS,
  listGovernanceRecords,
  listRequestsForGovernance,
  saveGovernanceRecord,
  updateRequestFields,
  type GovernanceItem,
} from '../services/governance';
import { listProjectTypes } from '../services/projectTypes';

const router = Router();

const writeRoles = requireRole('admin', 'intake_moderator', 'portfolio_manager');

const patchSchema = z.object({
  programId: z.string().max(36).nullable().optional(),
  projectType: z.string().max(200).nullable().optional(),
  disposition: z.enum(SG1_DISPOSITIONS).optional(),
  dqComment: z.string().max(4000).optional(),
  pirtComment: z.string().max(4000).optional(),
  sg1Comment: z.string().max(4000).optional(),
  creationComment: z.string().max(4000).optional(),
  fileshareReady: z.boolean().optional(),
  spotRecordCreated: z.boolean().optional(),
  spotId: z.string().max(50).optional(),
  cancelled: z.boolean().optional(),
});

const staffingPlanSchema = z.object({
  managerPersonId: z.string().min(1).max(36),
  sponsorPersonId: z.string().min(1).max(36),
});

function isGovernanceItem(item: GovernanceItem): boolean {
  const phase = item.phase ?? '';
  return (GOVERNANCE_STAGES as readonly string[]).includes(phase) || phase === GOVERNANCE_COMPLETE_PHASE;
}

async function loadItems(): Promise<GovernanceItem[]> {
  const [requests, records] = await Promise.all([listRequestsForGovernance(), listGovernanceRecords()]);
  return requests.filter(isGovernanceItem).map((item) => {
    const record = records.get(item.id.toLowerCase());
    return { ...item, ...record, cancelled: record?.cancelled ?? item.disposition === 'Cancelled' };
  });
}

async function loadItem(id: string): Promise<GovernanceItem> {
  const item = (await loadItems()).find((row) => row.id.toLowerCase() === id.toLowerCase());
  if (!item) throw new HttpError(404, 'Governance item not found.');
  return item;
}

/** Stage that follows the supplied one, or null when the item is already complete. */
function nextStage(phase?: string): string | null {
  const index = (GOVERNANCE_STAGES as readonly string[]).indexOf(phase ?? '');
  if (index === -1) return null;
  return index === GOVERNANCE_STAGES.length - 1 ? GOVERNANCE_COMPLETE_PHASE : GOVERNANCE_STAGES[index + 1];
}

router.use(authenticate);

router.get('/project-types', asyncHandler(async (_req, res) => {
  res.json(await listProjectTypes());
}));

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await loadItems());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await loadItem(req.params.id));
}));

router.patch('/:id', writeRoles, asyncHandler(async (req, res) => {
  const input = patchSchema.parse(req.body);
  const item = await loadItem(req.params.id);

  const record = {
    ...(input.programId !== undefined ? { programId: input.programId ?? undefined } : {}),
    ...(input.projectType !== undefined ? { projectType: input.projectType ?? undefined } : {}),
    ...(input.dqComment !== undefined ? { dqComment: input.dqComment } : {}),
    ...(input.pirtComment !== undefined ? { pirtComment: input.pirtComment } : {}),
    ...(input.sg1Comment !== undefined ? { sg1Comment: input.sg1Comment } : {}),
    ...(input.creationComment !== undefined ? { creationComment: input.creationComment } : {}),
    ...(input.fileshareReady !== undefined ? { fileshareReady: input.fileshareReady } : {}),
    ...(input.spotRecordCreated !== undefined ? { spotRecordCreated: input.spotRecordCreated } : {}),
    ...(input.cancelled !== undefined ? { cancelled: input.cancelled } : {}),
  };
  if (Object.keys(record).length) await saveGovernanceRecord(item.id, record);

  const requestChanges = {
    ...(input.disposition !== undefined ? { disposition: input.disposition } : {}),
    ...(input.spotId !== undefined ? { spotId: input.spotId } : {}),
    // Cancelling an item mirrors onto the shared intake disposition so other views stay consistent.
    ...(input.cancelled === true ? { disposition: 'Cancelled' } : {}),
    ...(input.cancelled === false && item.disposition === 'Cancelled' ? { disposition: 'Pending' } : {}),
  };
  if (Object.keys(requestChanges).length) await updateRequestFields(item.id, requestChanges);

  res.json(await loadItem(item.id));
}));

router.post('/:id/advance', writeRoles, asyncHandler(async (req, res) => {
  const item = await loadItem(req.params.id);
  if (item.cancelled) throw new HttpError(409, 'Reinstate this item before advancing it.');
  const target = nextStage(item.phase);
  if (!target) throw new HttpError(409, 'This item has already completed governance.');

  if (item.phase === 'PIRT Assessment' && !item.projectType) {
    throw new HttpError(400, 'Assign a project type before advancing to SG1 Review.');
  }
  if (item.phase === 'SG1 Review' && !item.disposition) {
    throw new HttpError(400, 'Record a disposition before advancing to Project Creation.');
  }
  if (item.phase === 'Configuration' && !item.projectId) {
    throw new HttpError(400, 'Create the staffing plan before completing this item.');
  }

  await updateRequestFields(item.id, { phase: target });
  res.json(await loadItem(item.id));
}));

router.post('/:id/staffing-plan', writeRoles, asyncHandler(async (req, res) => {
  const input = staffingPlanSchema.parse(req.body);
  const item = await loadItem(req.params.id);
  if (item.projectId) throw new HttpError(409, 'A staffing plan already exists for this item.');

  const name = item.shortTitle ?? item.title ?? 'Untitled project';
  let projectId: string;

  if (env.demoMode) {
    const manager = demoDataService.find('people', input.managerPersonId);
    const sponsor = demoDataService.find('people', input.sponsorPersonId);
    const record = {
      id: randomUUID(),
      name,
      description: item.desiredFutureState,
      problemStatement: item.currentState,
      status: 'Planning',
      priorityScore: item.priorityScore ?? 0,
      isActive: true,
      managerPersonId: manager?.id,
      managerName: manager?.name,
      sponsorPersonId: sponsor?.id,
      sponsorName: sponsor?.name,
      departmentId: item.departmentId,
      departmentName: item.departmentName,
      spotId: item.spotId,
      requestId: item.id,
    };
    demoDataService.create('projects', record as never);
    projectId = record.id;
  } else {
    const id = await projectRepository.create(await projectRepository.resolveInput({
      name,
      description: item.desiredFutureState,
      problemStatement: item.currentState,
      status: 'Planning',
      priorityScore: item.priorityScore ?? 0,
      managerPersonId: input.managerPersonId,
      sponsorPersonId: input.sponsorPersonId,
      departmentId: item.departmentId,
      spotId: item.spotId,
      requestId: item.id,
    }));
    const created = await projectRepository.findById(id);
    if (!created) throw new HttpError(500, 'Created project could not be retrieved.');
    projectId = created.ProjectApiId;
  }

  await updateRequestFields(item.id, { projectId });
  res.status(201).json({ projectId, item: await loadItem(item.id) });
}));

export default router;
