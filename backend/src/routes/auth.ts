import { Router } from 'express';
import { z } from 'zod';
import { userService } from '../services/userService';
import { AuthUser, Role, ROLES, signToken, signViewAsToken, authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { env } from '../config/env';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { verifyEntraIdToken } from '../services/entraIdentity';

const router = Router();

router.get('/config', (_req, res) => {
  res.json({
    authMode: env.authMode,
    ...(env.authMode === 'entra' ? { tenantId: env.entraTenantId, clientId: env.entraClientId } : {}),
  });
});

router.post('/entra', asyncHandler(async (req, res) => {
  if (env.authMode !== 'entra') throw new HttpError(404, 'Entra sign-in is not enabled.');
  const { idToken } = z.object({ idToken: z.string().min(1).max(20000) }).parse(req.body);
  let identity: Awaited<ReturnType<typeof verifyEntraIdToken>>;
  try {
    identity = await verifyEntraIdToken(idToken);
  } catch {
    throw new HttpError(401, 'The Entra ID token is invalid or expired.');
  }
  const selected = await userService.findActiveByEmail(identity.email);
  if (!selected) throw new HttpError(403, 'Your Entra account is not linked to an active ClearPath user.');

  const roles = new Set(parseRoles(identity.email));
  if (selected.LegacyDataverseId) {
    const P = COLUMNS.people;
    const person = await dv.retrieve('people', selected.LegacyDataverseId, { select: [P.role] }) as Record<string, unknown>;
    for (const role of parsePersonRoles(person[P.role])) roles.add(role);
  }
  const authUser: AuthUser = {
    userId: String(selected.UserId),
    personId: selected.LegacyDataverseId ?? undefined,
    email: identity.email,
    name: selected.DisplayName || identity.name,
    roles: [...roles],
    departmentId: selected.Department ?? undefined,
    authProvider: 'entra',
  };
  res.json({ token: signToken(authUser), user: authUser });
}));

router.get('/users', asyncHandler(async (req, res) => {
  if (env.authMode === 'entra') throw new HttpError(404, 'The temporary user directory is disabled.');
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
  // App-level roles remain mapped from ClearPath's configured admin lists and People records.
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

/** Temporary passwordless session for local development only. */
router.get('/session', asyncHandler(async (req, res) => {
  if (env.authMode === 'entra') throw new HttpError(404, 'Temporary user sign-in is disabled.');
  const userId = z.string().min(1).parse(req.query.userId);
  const selected = await userService.get(userId);
  if (!selected || !selected.IsActive) throw new HttpError(403, 'Select an active user.');

  const roles = new Set(parseRoles(selected.Email ?? ''));
  if (selected.LegacyDataverseId) {
    const P = COLUMNS.people;
    const person = await dv.retrieve('people', selected.LegacyDataverseId, { select: [P.role] }) as Record<string, unknown>;
    for (const role of parsePersonRoles(person[P.role])) roles.add(role);
  }

  const authUser: AuthUser = {
    userId: String(selected.UserId),
    personId: selected.LegacyDataverseId ?? undefined,
    email: selected.Email ?? '',
    name: selected.DisplayName,
    roles: [...roles],
    departmentId: selected.Department ?? undefined,
    authProvider: 'dev',
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
    authProvider: req.user?.authProvider,
  };
  res.json({ viewAsToken: signViewAsToken(user), user });
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
