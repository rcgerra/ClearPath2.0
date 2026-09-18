import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { userService } from '../services/userService';

const router = Router();
const userIdSchema = z.string().min(1);
const writeSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.string().email().max(320).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  department: z.string().max(200).nullable().optional(),
  manager: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
});

// Temporary SQL user API. Future migration: identity should come from Microsoft Entra ID.
function toResponse(user: Awaited<ReturnType<typeof userService.get>>) {
  if (!user) throw new HttpError(404, 'User not found.');
  return {
    id: String(user.UserId),
    userId: String(user.UserId),
    personId: user.LegacyDataverseId ?? undefined,
    displayName: user.DisplayName,
    fullName: user.DisplayName,
    email: user.Email,
    title: user.Title,
    jobTitle: user.Title,
    department: user.Department,
    manager: user.Manager,
    location: user.Location,
    isActive: user.IsActive,
  };
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await userService.list(
      req.query.search ? String(req.query.search) : undefined,
      req.query.active === 'false',
      Number(req.query.top ?? 200),
    );
    res.json(users.map((user) => toResponse(user)));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toResponse(await userService.get(userIdSchema.parse(req.params.id))));
  }),
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = writeSchema.parse(req.body);
    const id = await userService.create({
      DisplayName: input.displayName,
      Email: input.email,
      Title: input.title,
      Department: input.department,
      Manager: input.manager,
      Location: input.location,
    });
    res.status(201).json({ id: String(id) });
  }),
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = writeSchema.partial().parse(req.body);
    const identifier = userIdSchema.parse(req.params.id);
    const user = await userService.get(identifier);
    if (!user) throw new HttpError(404, 'User not found.');
    const updated = await userService.update(user.UserId, {
      DisplayName: input.displayName,
      Email: input.email,
      Title: input.title,
      Department: input.department,
      Manager: input.manager,
      Location: input.location,
    });
    if (!updated) throw new HttpError(404, 'User not found.');
    res.json({ id: req.params.id });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const identifier = userIdSchema.parse(req.params.id);
    const user = await userService.get(identifier);
    if (!user) throw new HttpError(404, 'User not found.');
    const deleted = await userService.deactivate(user.UserId);
    if (!deleted) throw new HttpError(404, 'User not found.');
    res.status(204).end();
  }),
);

export default router;
