import { Router } from 'express';
import { env } from '../config/env';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { AuthUser, Role, ROLES, signToken, authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';

const router = Router();

function parseRoles(raw: unknown): Role[] {
  const values = String(raw ?? '')
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((value): value is Role => (ROLES as readonly string[]).includes(value));
  return values.length ? values : ['user'];
}

/**
 * Behind Entra ID (App Service auth / Application Proxy) the signed-in email arrives
 * in a header; locally it falls back to DEV_USER_EMAIL.
 */
function resolveSignedInEmail(headers: Record<string, unknown>): string {
  const header = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : (value as string | undefined);
  };

  const email =
    header('x-ms-client-principal-name') ??
    header('x-forwarded-preferred-username') ??
    header('x-forwarded-email') ??
    (env.authMode === 'dev' ? env.devUserEmail : undefined);

  if (!email) {
    throw new HttpError(401, 'No signed-in identity was supplied by the host.');
  }
  return email.toLowerCase();
}

/** Establishes a session from the host-provided identity; there is no interactive login. */
router.get(
  '/session',
  asyncHandler(async (req, res) => {
    const email = resolveSignedInEmail(req.headers as Record<string, unknown>);

    const users = await dv.list('users', {
      select: [COLUMNS.users.id, COLUMNS.users.fullName, COLUMNS.users.email, COLUMNS.users.isDisabled],
      filter: `${COLUMNS.users.email} eq ${dv.odataString(email)}`,
      top: 1,
      includeFormattedValues: false,
    });
    const user = users[0] as Record<string, unknown> | undefined;
    if (!user || user[COLUMNS.users.isDisabled] === true) {
      throw new HttpError(403, `No active directory user found for ${email}.`);
    }

    const userId = String(user[COLUMNS.users.id]);
    const people = await dv.list('people', {
      select: [
        COLUMNS.people.id,
        COLUMNS.people.name,
        COLUMNS.people.email,
        COLUMNS.people.role,
        COLUMNS.people.departmentId,
      ],
      filter: `${COLUMNS.people.userId} eq ${userId}`,
      top: 1,
      includeFormattedValues: false,
    });
    const person = people[0] as Record<string, unknown> | undefined;

    const roles = parseRoles(person?.[COLUMNS.people.role]);
    if (env.adminEmails.includes(email) && !roles.includes('admin')) {
      roles.push('admin');
    }

    const authUser: AuthUser = {
      userId,
      personId: person ? String(person[COLUMNS.people.id]) : undefined,
      email,
      name: String(user[COLUMNS.users.fullName] ?? email),
      roles,
      departmentId: person?.[COLUMNS.people.departmentId]
        ? String(person[COLUMNS.people.departmentId])
        : undefined,
    };

    res.json({ token: signToken(authUser), user: authUser });
  }),
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
