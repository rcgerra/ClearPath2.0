import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { query } from '../database/connection';
import { demoDataService } from '../demo/demoDataService';
import { requestRepository } from '../repositories/sql';
import { REQUEST_STAGES, requestStageIndex } from './requestWorkflow';

/** Historic data stores phases as "3. DQ Check"; governance works in canonical stage names. */
function canonicalPhase(phase?: string | null): string | undefined {
  if (!phase) return undefined;
  const index = requestStageIndex(phase);
  return index === -1 ? phase : REQUEST_STAGES[index];
}

/** Intake phases that governance owns. */
export const GOVERNANCE_STAGES = ['DQ Check', 'PIRT Assessment', 'SG1 Review', 'Configuration'] as const;
export type GovernanceStage = (typeof GOVERNANCE_STAGES)[number];

/** Phase that a completed governance item lands in. */
export const GOVERNANCE_COMPLETE_PHASE = 'Processed';

export const SG1_DISPOSITIONS = ['Endorsed', 'Not Endorsed'] as const;

export interface GovernanceRecord {
  programId?: string;
  projectType?: string;
  dqComment?: string;
  pirtComment?: string;
  sg1Comment?: string;
  creationComment?: string;
  fileshareReady?: boolean;
  spotRecordCreated?: boolean;
  cancelled?: boolean;
}

export interface GovernanceItem extends GovernanceRecord {
  id: string;
  title?: string;
  shortTitle?: string;
  spotId?: string;
  phase?: string;
  disposition?: string;
  status?: string;
  submittedOn?: string;
  priorityScore?: number;
  isActive?: boolean;
  projectId?: string;
  departmentId?: string;
  departmentName?: string;
  requesterPersonId?: string;
  requesterName?: string;
  sponsorPersonId?: string;
  sponsorName?: string;
  delegatePersonId?: string;
  currentState?: string;
  desiredFutureState?: string;
  impactToOperations?: string;
  additionalInformation?: string;
  neededBy?: string;
}

const demoFile = path.join(
  process.env.DEMO_CSV_DIR ?? path.resolve(process.cwd(), 'demo-data'),
  'governance.json',
);
const demoRecords = new Map<string, GovernanceRecord>();

if (env.demoMode && fs.existsSync(demoFile)) {
  const parsed = JSON.parse(fs.readFileSync(demoFile, 'utf8')) as Array<GovernanceRecord & { id: string }>;
  for (const row of parsed) demoRecords.set(row.id.toLowerCase(), row);
}

function persistDemoRecords(): void {
  try {
    const rows = [...demoRecords.entries()].map(([id, record]) => ({ id, ...record }));
    fs.writeFileSync(demoFile, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('Could not persist governance records; changes are kept in memory only.', error);
  }
}

export async function listGovernanceRecords(): Promise<Map<string, GovernanceRecord>> {
  if (env.demoMode) return new Map(demoRecords);
  const rows = await query<{
    RequestId: string; ProgramId: string | null; ProjectType: string | null; DqComment: string | null;
    PirtComment: string | null; Sg1Comment: string | null; CreationComment: string | null;
    FileshareReady: boolean; SpotRecordCreated: boolean; Cancelled: boolean;
  }>('SELECT * FROM dbo.RequestGovernance');
  return new Map(rows.map((row) => [row.RequestId.toLowerCase(), {
    programId: row.ProgramId ?? undefined,
    projectType: row.ProjectType ?? undefined,
    dqComment: row.DqComment ?? undefined,
    pirtComment: row.PirtComment ?? undefined,
    sg1Comment: row.Sg1Comment ?? undefined,
    creationComment: row.CreationComment ?? undefined,
    fileshareReady: Boolean(row.FileshareReady),
    spotRecordCreated: Boolean(row.SpotRecordCreated),
    cancelled: Boolean(row.Cancelled),
  }]));
}

export async function saveGovernanceRecord(id: string, changes: GovernanceRecord): Promise<void> {
  const key = id.toLowerCase();
  if (env.demoMode) {
    demoRecords.set(key, { ...demoRecords.get(key), ...changes });
    persistDemoRecords();
    return;
  }
  const merged = { ...(await listGovernanceRecords()).get(key), ...changes };
  await query(
    `MERGE dbo.RequestGovernance AS target
     USING (SELECT @id AS RequestId) AS source ON target.RequestId = source.RequestId
     WHEN MATCHED THEN UPDATE SET ProgramId = @programId, ProjectType = @projectType, DqComment = @dqComment,
       PirtComment = @pirtComment, Sg1Comment = @sg1Comment, CreationComment = @creationComment,
       FileshareReady = @fileshareReady, SpotRecordCreated = @spotRecordCreated, Cancelled = @cancelled,
       ModifiedDate = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (RequestId, ProgramId, ProjectType, DqComment, PirtComment, Sg1Comment,
       CreationComment, FileshareReady, SpotRecordCreated, Cancelled)
       VALUES (@id, @programId, @projectType, @dqComment, @pirtComment, @sg1Comment, @creationComment,
       @fileshareReady, @spotRecordCreated, @cancelled);`,
    {
      id: key,
      programId: merged.programId ?? null,
      projectType: merged.projectType ?? null,
      dqComment: merged.dqComment ?? null,
      pirtComment: merged.pirtComment ?? null,
      sg1Comment: merged.sg1Comment ?? null,
      creationComment: merged.creationComment ?? null,
      fileshareReady: merged.fileshareReady ?? false,
      spotRecordCreated: merged.spotRecordCreated ?? false,
      cancelled: merged.cancelled ?? false,
    },
  );
}

type DemoRequest = Record<string, unknown> & { id: string };

function fromDemoRequest(row: DemoRequest): GovernanceItem {
  const value = (key: string) => (row[key] === undefined || row[key] === null ? undefined : String(row[key]));
  return {
    id: row.id,
    title: value('title'),
    shortTitle: value('shortTitle'),
    spotId: value('spotId'),
    phase: canonicalPhase(value('phase')),
    disposition: value('disposition'),
    status: value('status'),
    submittedOn: value('submittedOn'),
    priorityScore: row.priorityScore === undefined ? undefined : Number(row.priorityScore),
    isActive: row.isActive !== false,
    projectId: value('projectId'),
    departmentId: value('departmentId'),
    departmentName: value('departmentName'),
    requesterPersonId: value('requesterPersonId'),
    requesterName: value('requesterName'),
    sponsorPersonId: value('sponsorPersonId'),
    sponsorName: value('sponsorName'),
    delegatePersonId: value('delegatePersonId'),
    currentState: value('currentState'),
    desiredFutureState: value('desiredFutureState'),
    impactToOperations: value('impactToOperations'),
    additionalInformation: value('additionalInformation'),
    neededBy: value('neededBy'),
  };
}

/** Reads intake requests from whichever backing store this deployment uses. */
export async function listRequestsForGovernance(): Promise<GovernanceItem[]> {
  if (env.demoMode) {
    return (demoDataService.list('requests') as unknown as DemoRequest[]).map(fromDemoRequest);
  }
  const records = await requestRepository.listFiltered({ includeInactive: true });
  return records.map((record) => ({
    id: record.RequestApiId,
    title: record.Title ?? record.Name,
    shortTitle: record.ShortTitle ?? undefined,
    spotId: record.SpotId ?? undefined,
    phase: canonicalPhase(record.Phase),
    disposition: record.Disposition ?? undefined,
    status: record.Status ?? undefined,
    submittedOn: record.SubmittedOn ? new Date(record.SubmittedOn).toISOString() : undefined,
    priorityScore: record.PriorityScore ?? undefined,
    isActive: record.IsActive !== false,
    projectId: record.ProjectApiId ?? undefined,
    departmentId: record.DepartmentApiId ?? undefined,
    departmentName: record.DepartmentName ?? undefined,
    requesterPersonId: record.RequesterPersonApiId ?? undefined,
    requesterName: record.RequesterName ?? undefined,
    sponsorPersonId: record.SponsorPersonApiId ?? undefined,
    sponsorName: record.SponsorPersonName ?? record.SponsorNameFlat ?? undefined,
    delegatePersonId: record.DelegatePersonApiId ?? undefined,
    currentState: record.CurrentState ?? undefined,
    desiredFutureState: record.DesiredFutureState ?? undefined,
    impactToOperations: record.Impact ?? undefined,
    additionalInformation: record.AdditionalInformation ?? undefined,
    neededBy: record.WhenNeeded ?? undefined,
  }));
}

export interface RequestFieldChanges {
  phase?: string;
  disposition?: string;
  spotId?: string;
  projectId?: string;
}

export async function updateRequestFields(id: string, changes: RequestFieldChanges): Promise<void> {
  if (env.demoMode) {
    demoDataService.update('requests', id, { ...changes });
    return;
  }
  const record = await requestRepository.findByIdentifier(id);
  if (!record) throw Object.assign(new Error('Opportunity not found.'), { status: 404 });
  await requestRepository.update(record.RequestId, {
    Phase: changes.phase,
    Disposition: changes.disposition,
    SpotId: changes.spotId,
    ProjectId: changes.projectId === undefined
      ? undefined
      : await requestRepository.resolveId('Projects', 'ProjectId', changes.projectId),
  } as never);
}
