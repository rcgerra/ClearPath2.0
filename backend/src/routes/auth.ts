import { Router } from 'express';
import { z } from 'zod';
import { userService } from '../services/userService';
import { AuthUser, Role, signToken, authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';

const router = Router();

router.get('/users', asyncHandler(async (req, res) => {
  // TODO(Entra): replace this public temporary directory with the signed-in Entra profile.
  const users = await userService.list(req.query.search ? String(req.query.search) : undefined, false, 200);
  res.json(users.map((user) => ({
    id: String(user.UserId),
    personId: user.LegacyDataverseId ?? undefined,
    fullName: user.DisplayName,
    email: user.Email,
    jobTitle: user.Title,
  })));
}));

function parseRoles(email: string): Role[] {
  // TODO(Entra): derive roles from Microsoft Entra ID groups/app roles after identity migration.
  return process.env.ADMIN_EMAILS?.toLowerCase().split(',').map((value) => value.trim()).includes(email.toLowerCase())
    ? ['admin', 'user']
    : ['user'];
}

/** Temporary passwordless session. TODO(Entra): validate an Entra access token instead. */
router.get('/session', asyncHandler(async (req, res) => {
  const userId = z.string().min(1).parse(req.query.userId);
  const selected = await userService.get(userId);
  if (!selected || !selected.IsActive) throw new HttpError(403, 'Select an active user.');

  const authUser: AuthUser = {
    userId: String(selected.UserId),
    personId: selected.LegacyDataverseId ?? undefined,
    email: selected.Email ?? '',
    name: selected.DisplayName,
    roles: parseRoles(selected.Email ?? ''),
    departmentId: selected.Department ?? undefined,
  };
  res.json({ token: signToken(authUser), user: authUser });
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
