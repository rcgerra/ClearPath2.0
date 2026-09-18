import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { assertWritable, requireTable } from '../dataverse/tables';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
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
      const records = await SQL_REPOSITORIES[key].list(true);
      res.json(records.map((record) => toLookup(key, record as unknown as Record<string, unknown>)));
      return;
    }
    const cols = columnsFor(key);
    const records = await dv.list(key, { select: [cols.id, cols.name], orderBy: `${cols.name} asc`, top: 2000 });
    res.json(records.map((r) => ({ id: r[cols.id], name: r[cols.name] })));
  }),
);

router.post(
  '/:table',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
    if (isSqlTable(key)) {
      const { name } = bodySchema.parse(req.body);
      const input = key === 'categories'
        ? { Name: name, CategoryType: 'General' }
        : { Name: name };
      const id = await SQL_REPOSITORIES[key].create(input as never);
      const record = await SQL_REPOSITORIES[key].findById(id);
      if (!record) throw new HttpError(500, 'Created lookup record could not be retrieved.');
      res.status(201).json({ id: toLookup(key, record as unknown as Record<string, unknown>).id });
      return;
    }
    assertWritable(requireTable(key));
    const cols = columnsFor(key);
    const { name } = bodySchema.parse(req.body);
    res.status(201).json({ id: await dv.create(key, { [cols.name]: name }) });
  }),
);

router.patch(
  '/:table/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
    if (isSqlTable(key)) {
      const { name } = bodySchema.parse(req.body);
      const record = await SQL_REPOSITORIES[key].findByIdentifier(req.params.id);
      if (!record) throw new HttpError(404, 'Lookup record not found.');
      const sqlRecord = record as unknown as Record<string, unknown>;
      await SQL_REPOSITORIES[key].update(sqlRecord[SQL_ID_COLUMNS[key]] as number, { Name: name } as never);
      res.json({ id: req.params.id });
      return;
    }
    assertWritable(requireTable(key));
    const cols = columnsFor(key);
    const { name } = bodySchema.parse(req.body);
    await dv.update(key, req.params.id, { [cols.name]: name });
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
