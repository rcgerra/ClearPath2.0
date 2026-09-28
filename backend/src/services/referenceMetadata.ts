import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env';
import { query } from '../database/connection';
import { siteRepository } from '../repositories/sql/SiteRepository';
import { HttpError } from '../middleware/errorHandler';

export interface ReferenceMetadata {
  siteId?: string;
  location?: string;
  leadPersonId?: string;
  sponsorPersonId?: string;
  assistantLeadPersonIds?: string[];
  missionStatement?: string;
}

type MetadataRow = ReferenceMetadata & { table: string; id: string };
const file = path.join(process.env.DEMO_CSV_DIR ?? path.resolve(process.cwd(), 'demo-data'), 'reference-metadata.json');
const keyFor = (table: string, id: string) => `${table}:${id}`.toLowerCase();
const demoRows = new Map<string, MetadataRow>();

if (env.demoMode && fs.existsSync(file)) {
  for (const row of JSON.parse(fs.readFileSync(file, 'utf8')) as MetadataRow[]) {
    demoRows.set(keyFor(row.table, row.id), row);
  }
}

export async function listReferenceMetadata(table: string): Promise<Map<string, ReferenceMetadata>> {
  if (env.demoMode) {
    return new Map([...demoRows.values()]
      .filter((row) => row.table === table)
      .map((row) => [row.id.toLowerCase(), row]));
  }
  const rows = await query<{
    RecordId: string; SiteId: string | null; Location: string | null; LeadPersonId: string | null; SponsorPersonId: string | null;
    AssistantLeadPersonIds: string | null; MissionStatement: string | null;
  }>(`SELECT RecordId, SiteId, Location, LeadPersonId, SponsorPersonId, AssistantLeadPersonIds, MissionStatement
       FROM dbo.ReferenceMetadata WHERE TableName = @table`, { table });
  return new Map(rows.map((row) => [row.RecordId.toLowerCase(), {
    siteId: row.SiteId ?? undefined,
    location: row.Location ?? undefined,
    leadPersonId: row.LeadPersonId ?? undefined,
    sponsorPersonId: row.SponsorPersonId ?? undefined,
    assistantLeadPersonIds: row.AssistantLeadPersonIds ? JSON.parse(row.AssistantLeadPersonIds) as string[] : [],
    missionStatement: row.MissionStatement ?? undefined,
  }]));
}

export async function getReferenceMetadata(table: string, id: string): Promise<ReferenceMetadata> {
  return (await listReferenceMetadata(table)).get(id.toLowerCase()) ?? {};
}

export async function assertReferenceSite(siteId?: string): Promise<void> {
  if (siteId && !await siteRepository.findByIdentifier(siteId)) throw new HttpError(400, 'Select a valid site.');
}

export async function saveReferenceMetadata(table: string, id: string, changes: ReferenceMetadata): Promise<void> {
  if (env.demoMode) {
    const key = keyFor(table, id);
    demoRows.set(key, { ...demoRows.get(key), ...changes, table, id });
    try {
      fs.writeFileSync(file, JSON.stringify([...demoRows.values()], null, 2) + '\n', 'utf8');
    } catch (error) {
      console.warn('Could not persist reference metadata; changes are kept in memory only.', error);
    }
    return;
  }
  const current = await getReferenceMetadata(table, id);
  const merged = { ...current, ...changes };
  await query(
    `MERGE dbo.ReferenceMetadata AS target
     USING (SELECT @table AS TableName, @id AS RecordId) AS source
       ON target.TableName = source.TableName AND target.RecordId = source.RecordId
    WHEN MATCHED THEN UPDATE SET SiteId = @siteId, Location = @location, LeadPersonId = @leadPersonId,
       SponsorPersonId = @sponsorPersonId, AssistantLeadPersonIds = @assistantLeadPersonIds,
       MissionStatement = @missionStatement
     WHEN NOT MATCHED THEN INSERT (TableName, RecordId, SiteId, Location, LeadPersonId, SponsorPersonId, AssistantLeadPersonIds, MissionStatement)
       VALUES (@table, @id, @siteId, @location, @leadPersonId, @sponsorPersonId, @assistantLeadPersonIds, @missionStatement);`,
    { table, id, siteId: merged.siteId ?? null, location: merged.location ?? null, leadPersonId: merged.leadPersonId ?? null,
      sponsorPersonId: merged.sponsorPersonId ?? null,
      assistantLeadPersonIds: JSON.stringify(merged.assistantLeadPersonIds ?? []),
      missionStatement: merged.missionStatement ?? null },
  );
}

export const referenceMetadataSchema = z.object({
  siteId: z.string().max(36).optional(),
  location: z.string().max(200).optional(),
  leadPersonId: z.string().max(36).optional(),
  sponsorPersonId: z.string().max(36).optional(),
  assistantLeadPersonIds: z.array(z.string().min(1).max(36)).max(30).optional(),
  missionStatement: z.string().max(4000).optional(),
});