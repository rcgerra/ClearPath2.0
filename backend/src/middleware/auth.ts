import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const ROLES = ['admin', 'availability_moderator', 'demand_moderator', 'user'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  userId: string;
  personId?: string;
  email: string;
  name: string;
  roles: Role[];
  departmentId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as AuthUser & jwt.JwtPayload;
    req.user = {
      userId: payload.userId,
      personId: payload.personId,
      email: payload.email,
      name: payload.name,
      roles: payload.roles ?? [],
      departmentId: payload.departmentId,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!req.user.roles.some((role) => allowed.includes(role))) {
      res.status(403).json({ error: 'You do not have access to this resource.' });
      return;
    }
    next();
  };
}

/** Non-admins may only act on their own person record. */
export function requireSelfOrRole(paramName: string, ...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const target = req.params[paramName];
    if (req.user.personId === target || req.user.roles.some((role) => allowed.includes(role))) {
      next();
      return;
    }
    res.status(403).json({ error: 'You do not have access to this resource.' });
  };
}
