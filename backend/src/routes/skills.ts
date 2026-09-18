import { Router } from 'express';
import { z } from 'zod';
import { query } from '../database/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertAvailabilityEditable, departmentIdForPerson } from '../middleware/recordAccess';

const router = Router();

const categorySchema = z.object({ name: z.string().trim().min(1).max(200) });
const skillSchema = z.object({ categoryId: z.string().uuid(), name: z.string().trim().min(1).max(200) });

router.use(authenticate);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await query<{ id: string; name: string; isActive: boolean }>(
      `SELECT CategoryId AS id, Name AS name, IsActive AS isActive FROM dbo.DimSkillCategory ORDER BY Name`,
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
      'SELECT CategoryId AS id FROM dbo.DimSkillCategory WHERE LOWER(Name) = LOWER(@name)',
      { name: input.name },
    );
    if (existing.length) throw new HttpError(409, 'That skill category already exists.');
    const rows = await query<{ id: string }>(
      `INSERT dbo.DimSkillCategory (Name) OUTPUT inserted.CategoryId AS id VALUES (@name)`,
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
    if (input.name === undefined && input.isActive === undefined) throw new HttpError(400, 'No category changes provided.');
    const updated = await query<{ id: string }>(
      `UPDATE dbo.DimSkillCategory
              SET Name = COALESCE(@name, Name), IsActive = COALESCE(@isActive, IsActive), UpdatedOn = SYSUTCDATETIME()
       OUTPUT inserted.CategoryId AS id
        WHERE CategoryId = @id`,
      { id: req.params.id, name: input.name ?? null, isActive: input.isActive ?? null },
    );
    if (!updated.length) throw new HttpError(404, 'Skill category not found.');
    res.json(updated[0]);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categoryId = req.query.categoryId ? z.string().uuid().parse(req.query.categoryId) : undefined;
    const rows = await query<{ id: string; categoryId: string; categoryName: string; name: string; isActive: boolean }>(
      `SELECT s.SkillId AS id, s.CategoryId AS categoryId, c.Name AS categoryName, s.Name AS name, s.IsActive AS isActive
         FROM dbo.DimSkill s
         JOIN dbo.DimSkillCategory c ON c.CategoryId = s.CategoryId
        WHERE (@categoryId IS NULL OR s.CategoryId = @categoryId)
        ORDER BY c.Name, s.Name`,
      { categoryId: categoryId ?? null },
    );
    res.json(rows);
  }),
);

/** Any authenticated user can add a new skill to an existing, active category. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = skillSchema.parse(req.body);
    const category = await query<{ id: string }>(
      'SELECT CategoryId AS id FROM dbo.DimSkillCategory WHERE CategoryId = @categoryId AND IsActive = 1',
      input,
    );
    if (!category.length) throw new HttpError(404, 'Active skill category not found.');
    const duplicate = await query<{ id: string }>(
      `SELECT SkillId AS id FROM dbo.DimSkill WHERE CategoryId = @categoryId AND LOWER(Name) = LOWER(@name)`,
      input,
    );
    if (duplicate.length) throw new HttpError(409, 'That skill already exists in this category.');
    const rows = await query<{ id: string }>(
      `INSERT dbo.DimSkill (CategoryId, Name, CreatedByPersonId)
       OUTPUT inserted.SkillId AS id
       VALUES (@categoryId, @name, @createdByPersonId)`,
      { ...input, createdByPersonId: req.user?.personId ?? null },
    );
    res.status(201).json(rows[0]);
  }),
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(200).optional(), isActive: z.boolean().optional() }).parse(req.body);
    if (input.name === undefined && input.isActive === undefined) throw new HttpError(400, 'No skill changes provided.');
    const rows = await query<{ id: string }>(
      `UPDATE dbo.DimSkill
          SET Name = COALESCE(@name, Name), IsActive = COALESCE(@isActive, IsActive), UpdatedOn = SYSUTCDATETIME()
       OUTPUT inserted.SkillId AS id
        WHERE SkillId = @id`,
      { id: req.params.id, name: input.name ?? null, isActive: input.isActive ?? null },
    );
    if (!rows.length) throw new HttpError(404, 'Skill not found.');
    res.json(rows[0]);
  }),
);

router.get(
  '/people/:personId',
  asyncHandler(async (req, res) => {
    const rows = await query<{ id: string; skillId: string; skillName: string; categoryId: string; categoryName: string }>(
      `SELECT ps.PersonSkillId AS id, s.SkillId AS skillId, s.Name AS skillName, s.CategoryId AS categoryId, c.Name AS categoryName
         FROM dbo.FactPersonSkill ps
         JOIN dbo.DimSkill s ON s.SkillId = ps.SkillId
         JOIN dbo.DimSkillCategory c ON c.CategoryId = s.CategoryId
        WHERE ps.PersonId = @personId
        ORDER BY c.Name, s.Name`,
      { personId: req.params.personId },
    );
    res.json(rows);
  }),
);

router.post(
  '/people/:personId',
  asyncHandler(async (req, res) => {
    const input = z.object({ skillId: z.string().uuid() }).parse(req.body);
    const departmentId = await departmentIdForPerson(req.params.personId);
    await assertAvailabilityEditable(req.user, { personId: req.params.personId, departmentId });
    const skill = await query<{ id: string }>('SELECT SkillId AS id FROM dbo.DimSkill WHERE SkillId = @skillId AND IsActive = 1', input);
    if (!skill.length) throw new HttpError(404, 'Active skill not found.');
    const existing = await query<{ id: string }>(
      'SELECT PersonSkillId AS id FROM dbo.FactPersonSkill WHERE PersonId = @personId AND SkillId = @skillId',
      { personId: req.params.personId, skillId: input.skillId },
    );
    if (existing.length) {
      res.status(200).json(existing[0]);
      return;
    }
    const rows = await query<{ id: string }>(
      `INSERT dbo.FactPersonSkill (PersonId, SkillId) OUTPUT inserted.PersonSkillId AS id VALUES (@personId, @skillId)`,
      { personId: req.params.personId, skillId: input.skillId },
    );
    res.status(201).json(rows[0]);
  }),
);

router.delete(
  '/people/:personId/:skillId',
  asyncHandler(async (req, res) => {
    const departmentId = await departmentIdForPerson(req.params.personId);
    await assertAvailabilityEditable(req.user, { personId: req.params.personId, departmentId });
    await query('DELETE dbo.FactPersonSkill WHERE PersonId = @personId AND SkillId = @skillId', {
      personId: req.params.personId,
      skillId: req.params.skillId,
    });
    res.status(204).end();
  }),
);

export default router;
