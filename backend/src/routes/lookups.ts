import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { assertWritable, requireTable } from '../dataverse/tables';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Simple name/id CRUD for the reference tables. Access is enforced by the table
 * registry, so `users` (systemuser) can never be written through this router.
 */
const router = Router();

const SIMPLE_TABLES = ['functions', 'sites', 'skillsets', 'programs', 'locations', 'adm', 'categories'] as const;
type SimpleTable = (typeof SIMPLE_TABLES)[number];

const columnsFor = (key: SimpleTable) => COLUMNS[key] as { id: string; name: string };

const bodySchema = z.object({ name: z.string().min(1).max(200) });

function assertSimpleTable(value: string): SimpleTable {
  if (!(SIMPLE_TABLES as readonly string[]).includes(value)) {
    throw Object.assign(new Error(`'${value}' is not a reference table.`), { status: 404 });
  }
  return value as SimpleTable;
}

router.use(authenticate);

router.get(
  '/:table',
  asyncHandler(async (req, res) => {
    const key = assertSimpleTable(req.params.table);
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
    assertWritable(requireTable(key));
    await dv.remove(key, req.params.id);
    res.status(204).end();
  }),
);

export default router;
