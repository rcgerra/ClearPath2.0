import { env } from '../config/env';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { listReferenceMetadata } from '../services/referenceMetadata';
import { departmentSiteId } from '../services/siteScope';

async function main(): Promise<void> {
  if (env.demoMode) throw new Error('This backfill is for Dataverse people only; demo people inherit their department site.');
  const apply = process.argv.includes('--apply');
  const P = COLUMNS.people;
  const [people, departments, sites] = await Promise.all([
    dv.list('people', { select: [P.id, P.siteId, P.departmentId], top: 2000 }),
    listReferenceMetadata('departments'),
    listReferenceMetadata('sites'),
  ]);
  const leaders = new Map<string, string>();
  for (const [siteId, metadata] of sites) {
    for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])]) {
      if (personId) leaders.set(personId.toLowerCase(), siteId);
    }
  }

  let assigned = 0;
  let unresolved = 0;
  for (const row of people) {
    if (row[P.siteId]) continue;
    const personId = String(row[P.id]);
    const departmentId = row[P.departmentId] ? String(row[P.departmentId]).toLowerCase() : '';
    const siteId = leaders.get(personId.toLowerCase()) ?? departments.get(departmentId)?.siteId
      ?? (departmentId ? await departmentSiteId(departmentId) : undefined);
    if (!siteId) {
      unresolved += 1;
      continue;
    }
    assigned += 1;
    if (apply) await dv.update('people', personId, await dv.lookupBind(P.siteBind, 'new_sites', siteId));
  }
  console.log(`${apply ? 'Assigned' : 'Would assign'} sites to ${assigned} people; ${unresolved} have no site or department assignment to infer from.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});