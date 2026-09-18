import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertAvailabilityEditable } from '../middleware/recordAccess';
import { capacityRepository } from '../repositories/sql';

const router = Router();

const upsertSchema = z.object({
  personId: z.string().min(1),
  departmentId: z.string().min(1).optional(),
  name: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  weeklyBaseline: z.number().int().min(0).max(99).optional(),
  weeks: z.array(z.number().int().min(0).max(99)).max(1333).optional(),
});

const weekUpdateSchema = z.object({
  week: z.number().int().min(0).max(1332).optional(),
  startWeek: z.number().int().min(0).max(1332).optional(),
  endWeek: z.number().int().min(0).max(1332).optional(),
  hours: z.number().int().min(0).max(99),
});

function toCapacity(record: Awaited<ReturnType<typeof capacityRepository.findByIdentifier>>) {
  if (!record) throw new HttpError(404, 'Capacity record not found.');
  return {
    id: record.CapacityApiId,
    name: record.PersonName,
    personId: record.PersonApiId,
    personName: record.PersonName,
    departmentId: record.DepartmentApiId,
    departmentName: record.DepartmentName,
    availabilityHours: record.AvailabilityHours,
    weeks: record.Weeks,
    weeklyBaseline: record.WeeklyBaseline,
    notes: record.Notes,
    isActive: record.IsActive,
  };
}

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.mine === 'true' && !req.user?.personId) throw new HttpError(400, 'No person record is linked to your account.');
  const records = await capacityRepository.list({
    includeInactive: true,
    personId: req.query.mine === 'true' ? req.user?.personId : req.query.personId ? String(req.query.personId) : undefined,
    departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
  });
  res.json(records.map((record) => toCapacity(record)));
}));

router.get('/person/:personId/net', asyncHandler(async (req, res) => {
  res.json(await capacityRepository.net(req.params.personId));
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = upsertSchema.parse(req.body);
  await assertAvailabilityEditable(req.user, { personId: input.personId, departmentId: input.departmentId });
  const personId = await capacityRepository.resolvePersonId(input.personId);
  if (!personId) throw new HttpError(404, 'Person not found.');
  const id = await capacityRepository.create({ PersonId: personId, WeeklyBaseline: input.weeklyBaseline, Notes: input.notes }, input.weeks ?? []);
  const created = await capacityRepository.findByIdentifier(String(id));
  res.status(201).json({ id: toCapacity(created).id });
}));

router.patch('/:id/weeks', asyncHandler(async (req, res) => {
  const input = weekUpdateSchema.parse(req.body);
  const current = await capacityRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Capacity record not found.');
  await assertAvailabilityEditable(req.user, { personId: current.PersonApiId, departmentId: current.DepartmentApiId ?? undefined });
  if (input.week !== undefined) {
    const updated = await capacityRepository.setWeek(current.CapacityId, input.week, input.hours);
    if (!updated) throw new HttpError(404, 'Capacity record not found.');
    res.json({ id: req.params.id, weeks: updated.Weeks });
    return;
  }
  if (input.startWeek === undefined || input.endWeek === undefined) throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  if (input.endWeek < input.startWeek) throw new HttpError(400, 'endWeek must be on or after startWeek.');
  const updated = await capacityRepository.setRange(current.CapacityId, input.startWeek, input.endWeek, input.hours);
  if (!updated) throw new HttpError(404, 'Capacity record not found.');
  res.json({ id: req.params.id, weeks: updated.Weeks });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const current = await capacityRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Capacity record not found.');
  await assertAvailabilityEditable(req.user, { personId: current.PersonApiId, departmentId: current.DepartmentApiId ?? undefined });
  const input = upsertSchema.partial().parse(req.body);
  const personId = input.personId ? await capacityRepository.resolvePersonId(input.personId) : undefined;
  const updated = await capacityRepository.update(current.CapacityId, { PersonId: personId ?? undefined, WeeklyBaseline: input.weeklyBaseline, Notes: input.notes }, input.weeks);
  if (input.isActive === false) await capacityRepository.deactivate(current.CapacityId);
  if (!updated) throw new HttpError(404, 'Capacity record not found.');
  res.json({ id: req.params.id });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const current = await capacityRepository.findByIdentifier(req.params.id);
  if (!current) throw new HttpError(404, 'Capacity record not found.');
  await assertAvailabilityEditable(req.user, { personId: current.PersonApiId, departmentId: current.DepartmentApiId ?? undefined });
  await capacityRepository.deactivate(current.CapacityId);
  res.status(204).end();
}));

export default router;
