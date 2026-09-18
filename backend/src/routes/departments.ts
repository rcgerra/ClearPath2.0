import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { assertDepartmentEditable } from '../middleware/recordAccess';
import { departmentRepository } from '../repositories/sql/DepartmentRepository';
import type { DepartmentInput } from '../repositories/interfaces';

const router = Router();
const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  leadPersonId: z.string().uuid().optional(),
  delegatePersonId: z.string().uuid().optional(),
  functionId: z.string().uuid().optional(),
  lastCheckIn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  isActive: z.boolean().optional(),
});

function toDepartment(record: Awaited<ReturnType<typeof departmentRepository.findById>>) {
  if (!record) throw new HttpError(404, 'Department not found.');
  return {
    id: record.DepartmentApiId,
    name: record.Name,
    code: record.Code ?? undefined,
    leadPersonId: record.LeadPersonApiId ?? undefined,
    leadName: record.LeadName ?? undefined,
    delegatePersonId: record.DelegatePersonApiId ?? undefined,
    delegateName: record.DelegateName ?? undefined,
    functionId: record.FunctionApiId ?? undefined,
    functionName: record.FunctionName ?? undefined,
    lastCheckIn: undefined,
    isActive: record.IsActive,
  };
}

async function toSqlInput(input: z.infer<typeof schema>): Promise<Partial<DepartmentInput>> {
  const record: Partial<DepartmentInput> = {};
  if (input.name !== undefined) record.Name = input.name;
  if (input.code !== undefined) record.Code = input.code;
  if (input.functionId) record.FunctionId = await departmentRepository.resolveFunctionId(input.functionId);
  if (input.leadPersonId) record.DepartmentLeadUserId = await departmentRepository.resolveLeadUserId(input.leadPersonId);
  return record;
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const records = await departmentRepository.list(true);
    res.json(records.map(toDepartment));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toDepartment(await departmentRepository.findByIdentifier(req.params.id)));
  }),
);

/** Department roster with encoded availability for each member. */
router.get(
  '/:id/team',
  asyncHandler(async (req, res) => {
    res.json(await departmentRepository.listTeam(req.params.id));
  }),
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = schema.parse(req.body);
    if (!input.name) throw new HttpError(400, 'Department name is required.');
    const id = await departmentRepository.create({ ...(await toSqlInput(input)), Name: input.name });
    const created = await departmentRepository.findById(id);
    res.status(201).json({ id: toDepartment(created).id });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertDepartmentEditable(req.user, req.params.id);
    const input = schema.parse(req.body);
    const department = await departmentRepository.findByIdentifier(req.params.id);
    if (!department) throw new HttpError(404, 'Department not found.');
    await departmentRepository.update(department.DepartmentId, await toSqlInput(input));
    if (input.isActive === false) await departmentRepository.deactivate(department.DepartmentId);
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const department = await departmentRepository.findByIdentifier(req.params.id);
    if (!department) throw new HttpError(404, 'Department not found.');
    await departmentRepository.deactivate(department.DepartmentId);
    res.status(204).end();
  }),
);

export default router;
