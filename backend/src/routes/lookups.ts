import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { assertWritable, requireTable } from '../dataverse/tables';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertReferenceSite, listReferenceMetadata, referenceMetadataSchema, saveReferenceMetadata } from '../services/referenceMetadata';
import { assertSiteLead, assignPersonSite, personSiteId, viewSiteForRequest } from '../services/siteScope';
import {
  categoryRepository,
  functionRepository,
  locationRepository,
  programRepository,
  siteRepository,
  skillsetRepository,
} from '../repositories/sql';

/**
 * Simple name/id CRUD for the reference tables. Access is enforced by the table
 * registry, so `users` (systemuser) can never be written through this router.
 */
const router = Router();

const SIMPLE_TABLES = ['functions', 'sites', 'skillsets', 'programs', 'locations', 'adm', 'categories'] as const;
type SimpleTable = (typeof SIMPLE_TABLES)[number];
const SQL_TABLES = ['functions', 'sites', 'skillsets', 'locations', 'categories', 'programs'] as const;
type SqlTable = (typeof SQL_TABLES)[number];

const SQL_REPOSITORIES = {
  functions: functionRepository,
  sites: siteRepository,
  skillsets: skillsetRepository,
  locations: locationRepository,
  categories: categoryRepository,
  programs: programRepository,
} as const;

const SQL_ID_COLUMNS = {
  functions: 'FunctionId',
  sites: 'SiteId',
  skillsets: 'SkillsetId',
  locations: 'LocationId',
  categories: 'CategoryId',
  programs: 'ProgramId',
} as const;

const columnsFor = (key: SimpleTable) => COLUMNS[key] as { id: string; name: string };

const bodySchema = z.object({ name: z.string().min(1).max(200) });

function assertSimpleTable(value: string): SimpleTable {
  if (!(SIMPLE_TABLES as readonly string[]).includes(value)) {
    throw Object.assign(new Error(`'${value}' is not a reference table.`), { status: 404 });
  }
  return value as SimpleTable;
}

function isSqlTable(value: SimpleTable): value is SqlTable {
  return (SQL_TABLES as readonly string[]).includes(value);
}

function toLookup(key: SqlTable, record: Record<string, unknown>) {
  return {
    id: String(record.LegacyDataverseId ?? record[SQL_ID_COLUMNS[key]]),
    name: record.Name,
  };
}

router.use(authenticate);

router.get(
  '/:table',
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
    if (isSqlTable(key)) {
      const siteId = key === 'sites' && req.user?.roles.includes('admin') ? undefined : await viewSiteForRequest(req);
      const [records, metadata] = await Promise.all([SQL_REPOSITORIES[key].list(), listReferenceMetadata(key)]);
      res.json(records.map((record) => {
        const raw = record as unknown as Record<string, unknown>;
        const lookup = toLookup(key, raw);
        return { ...lookup, ...(key === 'programs' && raw.Purpose ? { missionStatement: raw.Purpose } : {}),
          ...(key === 'programs' && raw.Subprogram ? { subprogram: raw.Subprogram } : {}),
          ...metadata.get(lookup.id.toLowerCase()) };
      }).filter((record) => key === 'programs' || !siteId || (key === 'sites' ? record.id : record.siteId)?.toLowerCase() === siteId.toLowerCase()));
      return;
    }
    const cols = columnsFor(key);
    const records = await dv.list(key, { select: [cols.id, cols.name], orderBy: `${cols.name} asc`, top: 2000 });
    res.json(records.map((r) => ({ id: r[cols.id], name: r[cols.name] })));
  }),
);

router.patch('/sites/:id/assistants', asyncHandler(async (req, res) => {
  const site = await siteRepository.findByIdentifier(req.params.id);
  if (!site) throw new HttpError(404, 'Site not found.');
  await assertSiteLead(req.user, req.params.id);
  const assistants = referenceMetadataSchema.pick({ assistantLeadPersonIds: true }).required().parse(req.body).assistantLeadPersonIds;
  for (const personId of assistants) {
    await dv.retrieve('people', personId, { select: [COLUMNS.people.id] });
    const assignedSite = await personSiteId(personId);
    if (!req.user?.roles.includes('admin') && assignedSite?.toLowerCase() !== req.params.id.toLowerCase()) {
      throw new HttpError(403, 'Assistant site leads must already belong to your site.');
    }
  }
  for (const personId of assistants) await assignPersonSite(personId, req.params.id);
  await saveReferenceMetadata('sites', req.params.id, { assistantLeadPersonIds: assistants });
  res.json({ id: req.params.id });
}));

router.post(
  '/:table',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
    const metadata = referenceMetadataSchema.parse(req.body);
    await assertReferenceSite(metadata.siteId);
    if (key === 'sites') {
      for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((id): id is string => Boolean(id))) {
        await dv.retrieve('people', personId, { select: [COLUMNS.people.id] });
      }
    }
    if (isSqlTable(key)) {
      const { name } = bodySchema.parse(req.body);
      const input = key === 'categories'
        ? { Name: name, CategoryType: 'General' }
        : { Name: name };
      const id = await SQL_REPOSITORIES[key].create(input as never);
      const record = await SQL_REPOSITORIES[key].findById(id);
      if (!record) throw new HttpError(500, 'Created lookup record could not be retrieved.');
      const lookupId = toLookup(key, record as unknown as Record<string, unknown>).id;
      if (Object.keys(metadata).length) await saveReferenceMetadata(key, lookupId, metadata);
      if (key === 'sites') {
        for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((id): id is string => Boolean(id))) {
          await assignPersonSite(personId, lookupId);
        }
      }
      res.status(201).json({ id: lookupId });
      return;
    }
    assertWritable(requireTable(key));
    const cols = columnsFor(key);
    const { name } = bodySchema.parse(req.body);
    const id = await dv.create(key, { [cols.name]: name });
    if (Object.keys(metadata).length) await saveReferenceMetadata(key, id, metadata);
    res.status(201).json({ id });
  }),
);

router.patch(
  '/:table/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
    const metadata = referenceMetadataSchema.parse(req.body);
    await assertReferenceSite(metadata.siteId);
    if (key === 'sites') {
      for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((id): id is string => Boolean(id))) {
        await dv.retrieve('people', personId, { select: [COLUMNS.people.id] });
      }
    }
    if (isSqlTable(key)) {
      const { name } = bodySchema.parse(req.body);
      const record = await SQL_REPOSITORIES[key].findByIdentifier(req.params.id);
      if (!record) throw new HttpError(404, 'Lookup record not found.');
      const sqlRecord = record as unknown as Record<string, unknown>;
      await SQL_REPOSITORIES[key].update(sqlRecord[SQL_ID_COLUMNS[key]] as number, { Name: name } as never);
      if (Object.keys(metadata).length) await saveReferenceMetadata(key, req.params.id, metadata);
      if (key === 'sites') {
        for (const personId of [metadata.leadPersonId, ...(metadata.assistantLeadPersonIds ?? [])].filter((id): id is string => Boolean(id))) {
          await assignPersonSite(personId, req.params.id);
        }
      }
      res.json({ id: req.params.id });
      return;
    }
    assertWritable(requireTable(key));
    const cols = columnsFor(key);
    const { name } = bodySchema.parse(req.body);
    await dv.update(key, req.params.id, { [cols.name]: name });
    if (Object.keys(metadata).length) await saveReferenceMetadata(key, req.params.id, metadata);
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:table/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
    if (isSqlTable(key)) {
      const record = await SQL_REPOSITORIES[key].findByIdentifier(req.params.id);
      if (!record) throw new HttpError(404, 'Lookup record not found.');
      const sqlRecord = record as unknown as Record<string, unknown>;
      await SQL_REPOSITORIES[key].deactivate(sqlRecord[SQL_ID_COLUMNS[key]] as number);
      res.status(204).end();
      return;
    }
    assertWritable(requireTable(key));
    await dv.remove(key, req.params.id);
    res.status(204).end();
  }),
);

export default router;
