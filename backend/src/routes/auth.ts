import { Router } from 'express';
import { z } from 'zod';
import { userService } from '../services/userService';
import { AuthUser, Role, ROLES, signToken, signViewAsToken, authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { env } from '../config/env';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';

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
  const normalized = email.toLowerCase();
  if (env.adminEmails.includes(normalized)) return ['admin', 'user'];
  if (env.portfolioManagerEmails.includes(normalized)) return ['portfolio_manager', 'user'];
  return ['user'];
}

function parsePersonRoles(raw: unknown): Role[] {
  const roles = String(raw ?? '')
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((value): value is Role => (ROLES as readonly string[]).includes(value));
  return roles.includes('user') ? roles : ['user', ...roles];
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

router.post('/view-as', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const personId = z.string().min(1).parse(req.body?.personId);
  const P = COLUMNS.people;
  const record = await dv.retrieve('people', personId, {
    select: [P.id, P.userId, P.name, P.email, P.role, P.departmentId, P.isActive],
    includeFormattedValues: false,
  }) as Record<string, unknown>;
  if (record[P.isActive] === false) throw new HttpError(403, 'Inactive people cannot be viewed as.');

  const user: AuthUser = {
    userId: String(record[P.userId] ?? personId),
    personId: String(record[P.id] ?? personId),
    email: String(record[P.email] ?? ''),
    name: String(record[P.name] ?? 'Selected person'),
    roles: parsePersonRoles(record[P.role]),
    departmentId: record[P.departmentId] ? String(record[P.departmentId]) : undefined,
  };
  res.json({ viewAsToken: signViewAsToken(user), user });
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
