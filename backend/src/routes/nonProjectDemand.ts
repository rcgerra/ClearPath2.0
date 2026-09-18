import { Router } from 'express';
import { z } from 'zod';
import { query } from '../database/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertAvailabilityEditable, departmentIdForPerson } from '../middleware/recordAccess';
import { decodeArray, encodeArray, setWeekRange, setWeekValue } from '../utils/arrayParser';

const router = Router();

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const subcategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
});

const createDemandSchema = z.object({
  subcategoryId: z.string().uuid(),
  personId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(200),
  startWeek: z.number().int().min(0).max(1332).optional(),
  endWeek: z.number().int().min(0).max(1332).optional(),
  hoursPerWeek: z.number().int().min(0).max(99).optional(),
});

const weekUpdateSchema = z.object({
  week: z.number().int().min(0).max(1332).optional(),
  startWeek: z.number().int().min(0).max(1332).optional(),
  endWeek: z.number().int().min(0).max(1332).optional(),
  hours: z.number().int().min(0).max(99),
});

interface DemandRecord {
  id: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  personId: string;
  departmentId?: string;
  description?: string;
  demandHours: string;
  isActive: boolean;
}

function toDemand(row: DemandRecord) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    subcategoryId: row.subcategoryId,
    subcategoryName: row.subcategoryName,
    personId: row.personId,
    departmentId: row.departmentId,
    description: row.description,
    weeks: decodeArray(row.demandHours),
    isActive: row.isActive,
  };
}

async function getDemand(id: string): Promise<DemandRecord> {
  const rows = await query<DemandRecord>(
        `SELECT d.NonProjectDemandId AS id, d.CategoryId AS categoryId, c.Name AS categoryName,
          d.SubcategoryId AS subcategoryId, s.Name AS subcategoryName,
            d.PersonId AS personId, d.DepartmentId AS departmentId, d.Description AS description, d.DemandHours AS demandHours,
            d.IsActive AS isActive
       FROM dbo.FactNonProjectDemand d
       JOIN dbo.DimNonProjectDemandCategory c ON c.CategoryId = d.CategoryId
           LEFT JOIN dbo.DimNonProjectDemandSubcategory s ON s.SubcategoryId = d.SubcategoryId
      WHERE d.NonProjectDemandId = @id`,
    { id },
  );
  if (!rows[0]) throw new HttpError(404, 'Non-project demand row not found.');
  return rows[0];
}

router.use(authenticate);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await query<{ id: string; name: string; isActive: boolean }>(
      `SELECT CategoryId AS id, Name AS name, IsActive AS isActive
         FROM dbo.DimNonProjectDemandCategory
        ORDER BY Name`,
    );
    res.json(rows);
  }),
);

router.post(
  '/categories',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const existing = await query<{ id: string }>(
      'SELECT CategoryId AS id FROM dbo.DimNonProjectDemandCategory WHERE LOWER(Name) = LOWER(@name)',
      { name: input.name },
    );
    if (existing.length) throw new HttpError(409, 'That non-project demand category already exists.');
    const rows = await query<{ id: string }>(
      `INSERT dbo.DimNonProjectDemandCategory (Name)
       OUTPUT inserted.CategoryId AS id
       VALUES (@name)`,
      { name: input.name },
    );
    res.status(201).json(rows[0]);
  }),
);

router.patch(
  '/categories/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = categorySchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    if (input.name === undefined && input.isActive === undefined) {
      throw new HttpError(400, 'No category changes provided.');
    }
    const updated = await query<{ id: string }>(
      `UPDATE dbo.DimNonProjectDemandCategory
              SET Name = COALESCE(@name, Name), IsActive = COALESCE(@isActive, IsActive), UpdatedOn = SYSUTCDATETIME()
       OUTPUT inserted.CategoryId AS id
        WHERE CategoryId = @id`,
      { id: req.params.id, name: input.name ?? null, isActive: input.isActive ?? null },
    );
    if (!updated.length) throw new HttpError(404, 'Non-project demand category not found.');
    res.json(updated[0]);
  }),
);

router.get(
  '/subcategories',
  asyncHandler(async (req, res) => {
    const categoryId = req.query.categoryId ? z.string().uuid().parse(req.query.categoryId) : undefined;
    const rows = await query<{ id: string; categoryId: string; name: string; isActive: boolean }>(
      `SELECT SubcategoryId AS id, CategoryId AS categoryId, Name AS name, IsActive AS isActive
         FROM dbo.DimNonProjectDemandSubcategory
        WHERE (@categoryId IS NULL OR CategoryId = @categoryId)
        ORDER BY Name`,
      { categoryId: categoryId ?? null },
    );
    res.json(rows);
  }),
);

router.post(
  '/subcategories',
  asyncHandler(async (req, res) => {
    const input = subcategorySchema.parse(req.body);
    const category = await query<{ id: string }>(
      'SELECT CategoryId AS id FROM dbo.DimNonProjectDemandCategory WHERE CategoryId = @categoryId AND IsActive = 1',
      input,
    );
    if (!category.length) throw new HttpError(404, 'Active non-project demand category not found.');
    const duplicate = await query<{ id: string }>(
      `SELECT SubcategoryId AS id FROM dbo.DimNonProjectDemandSubcategory
        WHERE CategoryId = @categoryId AND LOWER(Name) = LOWER(@name)`,
      input,
    );
    if (duplicate.length) throw new HttpError(409, 'That subcategory already exists in this category.');
    const rows = await query<{ id: string }>(
      `INSERT dbo.DimNonProjectDemandSubcategory (CategoryId, Name, CreatedByPersonId)
       OUTPUT inserted.SubcategoryId AS id
       VALUES (@categoryId, @name, @createdByPersonId)`,
      { ...input, createdByPersonId: req.user?.personId ?? null },
    );
    res.status(201).json(rows[0]);
  }),
);

router.patch(
  '/subcategories/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(200).optional(), isActive: z.boolean().optional() }).parse(req.body);
    if (input.name === undefined && input.isActive === undefined) throw new HttpError(400, 'No subcategory changes provided.');
    const rows = await query<{ id: string }>(
      `UPDATE dbo.DimNonProjectDemandSubcategory
          SET Name = COALESCE(@name, Name), IsActive = COALESCE(@isActive, IsActive), UpdatedOn = SYSUTCDATETIME()
       OUTPUT inserted.SubcategoryId AS id
        WHERE SubcategoryId = @id`,
      { id: req.params.id, name: input.name ?? null, isActive: input.isActive ?? null },
    );
    if (!rows.length) throw new HttpError(404, 'Non-project demand subcategory not found.');
    res.json(rows[0]);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const personId = req.query.personId ? z.string().uuid().parse(req.query.personId) : undefined;
    const departmentId = req.query.departmentId ? z.string().uuid().parse(req.query.departmentId) : undefined;
    const rows = await query<DemandRecord>(
            `SELECT d.NonProjectDemandId AS id, d.CategoryId AS categoryId, c.Name AS categoryName,
              d.SubcategoryId AS subcategoryId, s.Name AS subcategoryName,
              d.PersonId AS personId, d.DepartmentId AS departmentId, d.Description AS description, d.DemandHours AS demandHours,
              d.IsActive AS isActive
         FROM dbo.FactNonProjectDemand d
         JOIN dbo.DimNonProjectDemandCategory c ON c.CategoryId = d.CategoryId
         LEFT JOIN dbo.DimNonProjectDemandSubcategory s ON s.SubcategoryId = d.SubcategoryId
        WHERE (@personId IS NULL OR d.PersonId = @personId)
          AND (@departmentId IS NULL OR d.DepartmentId = @departmentId)
        ORDER BY c.Name, s.Name, d.Description`,
      { personId: personId ?? null, departmentId: departmentId ?? null },
    );
    res.json(rows.map(toDemand));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createDemandSchema.parse(req.body);
    const departmentId = await departmentIdForPerson(input.personId);
    await assertAvailabilityEditable(req.user, { personId: input.personId, departmentId });
    const subcategories = await query<{ categoryId: string }>(
      `SELECT s.CategoryId AS categoryId
         FROM dbo.DimNonProjectDemandSubcategory s
         JOIN dbo.DimNonProjectDemandCategory c ON c.CategoryId = s.CategoryId
        WHERE s.SubcategoryId = @subcategoryId AND s.IsActive = 1 AND c.IsActive = 1`,
      input,
    );
    if (!subcategories[0]) throw new HttpError(404, 'Active non-project demand subcategory not found.');
    const categoryId = subcategories[0].categoryId;

    let demandHours = encodeArray([]);
    if (input.startWeek !== undefined && input.endWeek !== undefined && input.hoursPerWeek !== undefined) {
      if (input.endWeek < input.startWeek) throw new HttpError(400, 'endWeek must be on or after startWeek.');
      demandHours = setWeekRange(demandHours, input.startWeek, input.endWeek, input.hoursPerWeek);
    }
    const created = await query<{ id: string }>(
      `INSERT dbo.FactNonProjectDemand (CategoryId, SubcategoryId, PersonId, DepartmentId, Description, DemandHours)
       OUTPUT inserted.NonProjectDemandId AS id
       VALUES (@categoryId, @subcategoryId, @personId, @departmentId, @description, @demandHours)`,
      { ...input, categoryId, departmentId: departmentId ?? null, demandHours },
    );
    res.status(201).json(created[0]);
  }),
);

router.patch(
  '/:id/weeks',
  asyncHandler(async (req, res) => {
    const input = weekUpdateSchema.parse(req.body);
    const current = await getDemand(req.params.id);
    await assertAvailabilityEditable(req.user, { personId: current.personId, departmentId: current.departmentId });
    let demandHours: string;
    if (input.week !== undefined) {
      demandHours = setWeekValue(current.demandHours, input.week, input.hours);
    } else if (input.startWeek !== undefined && input.endWeek !== undefined) {
      if (input.endWeek < input.startWeek) throw new HttpError(400, 'endWeek must be on or after startWeek.');
      demandHours = setWeekRange(current.demandHours, input.startWeek, input.endWeek, input.hours);
    } else {
      throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
    }
    await query(
      `UPDATE dbo.FactNonProjectDemand SET DemandHours = @demandHours, UpdatedOn = SYSUTCDATETIME()
        WHERE NonProjectDemandId = @id`,
      { id: req.params.id, demandHours },
    );
    res.json({ id: req.params.id, weeks: decodeArray(demandHours) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = z.object({ isActive: z.boolean().optional(), description: z.string().trim().min(1).max(200).optional() }).parse(req.body);
    if (input.isActive === undefined && input.description === undefined) {
      throw new HttpError(400, 'No changes provided.');
    }
    const current = await getDemand(req.params.id);
    await assertAvailabilityEditable(req.user, { personId: current.personId, departmentId: current.departmentId });
    await query(
      `UPDATE dbo.FactNonProjectDemand
          SET IsActive = COALESCE(@isActive, IsActive), Description = COALESCE(@description, Description), UpdatedOn = SYSUTCDATETIME()
        WHERE NonProjectDemandId = @id`,
      { id: req.params.id, isActive: input.isActive ?? null, description: input.description ?? null },
    );
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = await getDemand(req.params.id);
    await assertAvailabilityEditable(req.user, { personId: current.personId, departmentId: current.departmentId });
    await query('DELETE dbo.FactNonProjectDemand WHERE NonProjectDemandId = @id', { id: req.params.id });
    res.status(204).end();
  }),
);

export default router;