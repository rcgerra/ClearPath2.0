import { env } from '../config/env';
import type { Request } from 'express';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { demoDataService } from '../demo/demoDataService';
import type { AuthUser } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { siteRepository } from '../repositories/sql/SiteRepository';
import { departmentRepository } from '../repositories/sql/DepartmentRepository';
import { getReferenceMetadata, listReferenceMetadata, saveReferenceMetadata, type ReferenceMetadata } from './referenceMetadata';

export function siteLeadershipRole(metadata: ReferenceMetadata, personId?: string): 'lead' | 'assistant' | null {
  if (!personId) return null;
  if (metadata.leadPersonId?.toLowerCase() === personId.toLowerCase()) return 'lead';
  return metadata.assistantLeadPersonIds?.some((id) => id.toLowerCase() === personId.toLowerCase()) ? 'assistant' : null;
}

export async function departmentSiteId(departmentId: string): Promise<string | undefined> {
  const metadataSite = (await getReferenceMetadata('departments', departmentId)).siteId;
  if (metadataSite) return metadataSite;
  if (env.demoMode) return demoDataService.find('departments', departmentId)?.siteId;
  const department = await departmentRepository.findByIdentifier(departmentId);
  if (!department?.SiteName) return undefined;
  const site = (await siteRepository.list()).find((row) => row.Name.toLowerCase() === department.SiteName?.toLowerCase());
  return site?.LegacyDataverseId ?? (site ? String(site.SiteId) : undefined);
}

export async function personSiteId(personId?: string): Promise<string | undefined> {
  if (!personId) return undefined;
  const person = env.demoMode
    ? demoDataService.find('people', personId)
    : await dv.retrieve('people', personId, { select: [COLUMNS.people.siteId, COLUMNS.people.departmentId] });
  if (!person) return undefined;
  const record = person as Record<string, unknown>;

  const metadataSite = (await getReferenceMetadata('people', personId)).siteId;
  const directSite = (record.siteId ?? record[COLUMNS.people.siteId]) as string | undefined;
  if (metadataSite || directSite) return metadataSite || directSite;

  const siteLeads = [...(await listReferenceMetadata('sites')).entries()]
    .filter(([, metadata]) => siteLeadershipRole(metadata, personId));
  if (siteLeads.length === 1) return siteLeads[0][0];

  const departmentId = (record.departmentId ?? record[COLUMNS.people.departmentId]) as string | undefined;
  if (!departmentId) return undefined;
  return departmentSiteId(departmentId);
}

export async function assignedPersonSiteId(personId?: string): Promise<string | undefined> {
  if (!personId) return undefined;
  const person = env.demoMode
    ? demoDataService.find('people', personId)
    : await dv.retrieve('people', personId, { select: [COLUMNS.people.siteId] });
  if (!person) return undefined;
  const record = person as Record<string, unknown>;
  return (await getReferenceMetadata('people', personId)).siteId
    ?? (record.siteId ?? record[COLUMNS.people.siteId]) as string | undefined;
}

export async function assignPersonSite(personId: string, siteId: string): Promise<void> {
  if (env.demoMode) {
    await saveReferenceMetadata('people', personId, { siteId });
    return;
  }
  await dv.update('people', personId, await dv.lookupBind(COLUMNS.people.siteBind, 'new_sites', siteId));
}

export async function resolveCreationSite(user: AuthUser | undefined, requestedSiteId?: string): Promise<string> {
  const ownSite = await personSiteId(user?.personId);
  const siteId = user?.roles.includes('admin') && requestedSiteId ? requestedSiteId : ownSite;
  if (!siteId) throw new HttpError(400, 'Assign a site to your person record before creating records.');
  if (requestedSiteId && !user?.roles.includes('admin') && requestedSiteId.toLowerCase() !== siteId.toLowerCase()) {
    throw new HttpError(403, 'Records you create must use your assigned site.');
  }
  const exists = env.demoMode ? demoDataService.find('sites', siteId) : await siteRepository.findByIdentifier(siteId);
  if (!exists) throw new HttpError(400, 'Select a valid site.');
  return siteId;
}

export async function resolvePersonCreationSite(user: AuthUser | undefined, requestedSiteId?: string): Promise<string> {
  const siteId = await assignedPersonSiteId(user?.personId);
  if (!siteId) throw new HttpError(403, 'Your People record needs an assigned site before you can add a person.');
  if (requestedSiteId && requestedSiteId.toLowerCase() !== siteId.toLowerCase()) {
    throw new HttpError(403, 'New people must inherit your assigned site.');
  }
  return resolveCreationSite(user, siteId);
}

export async function viewSiteId(user: AuthUser | undefined, requestedSiteId?: string): Promise<string | undefined> {
  if (user?.roles.includes('admin')) {
    if (!requestedSiteId) return undefined;
    const site = env.demoMode ? demoDataService.find('sites', requestedSiteId) : await siteRepository.findByIdentifier(requestedSiteId);
    if (!site) throw new HttpError(400, 'Select a valid site.');
    return requestedSiteId;
  }
  const siteId = await personSiteId(user?.personId);
  if (!siteId) throw new HttpError(403, 'A site assignment is required to view records.');
  return siteId;
}

export const viewSiteForRequest = (req: Request) =>
  viewSiteId(req.user, typeof req.headers['x-clearpath-site'] === 'string' ? req.headers['x-clearpath-site'] : undefined);

export async function personIdsAtSite(siteId: string): Promise<Set<string>> {
  const P = COLUMNS.people;
  const people = await dv.list('people', { select: [P.id, P.siteId], top: 2000 });
  return new Set(people.filter((person) => String(person[P.siteId] ?? '').toLowerCase() === siteId.toLowerCase())
    .map((person) => String(person[P.id]).toLowerCase()));
}

export async function assertSiteCreator(user: AuthUser | undefined): Promise<void> {
  if (user?.roles.includes('admin')) return;
  const siteId = await personSiteId(user?.personId);
  if (!siteId) throw new HttpError(403, 'A site assignment is required to create records.');
  const metadata = await getReferenceMetadata('sites', siteId);
  if (siteLeadershipRole(metadata, user?.personId)) return;
  throw new HttpError(403, 'Only a site lead, assistant site lead or admin can create this record.');
}

export async function assertSiteLead(user: AuthUser | undefined, siteId: string): Promise<void> {
  if (user?.roles.includes('admin')) return;
  const assignedSite = await personSiteId(user?.personId);
  const metadata = await getReferenceMetadata('sites', siteId);
  if (assignedSite?.toLowerCase() === siteId.toLowerCase() && siteLeadershipRole(metadata, user?.personId) === 'lead') return;
  throw new HttpError(403, 'Only this site lead or an admin can manage its assistants.');
}

export async function assertDepartmentSite(departmentId: string | undefined, siteId: string, user: AuthUser | undefined): Promise<void> {
  if (!departmentId || user?.roles.includes('admin')) return;
  const department = env.demoMode
    ? demoDataService.find('departments', departmentId)
    : await departmentRepository.findByIdentifier(departmentId);
  if (!department) throw new HttpError(400, 'Select an existing department.');
  const assignedSite = await departmentSiteId(departmentId);
  if (assignedSite?.toLowerCase() !== siteId.toLowerCase()) {
    throw new HttpError(403, 'Select a department in your assigned site.');
  }
}