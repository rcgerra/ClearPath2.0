import { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import { env } from '../config/env';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const asyncHandler =
  <T extends Request>(handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as T, res, next)).catch(next);
  };

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Resource not found.' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 502;
    const dataverseMessage =
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
    // Upstream messages can leak schema details; only surface them outside production.
    res.status(status).json({
      error: 'Dataverse request failed.',
      detail: env.nodeEnv === 'production' ? undefined : dataverseMessage,
    });
    return;
  }

  const status = (err as { status?: number })?.status ?? 500;
  const message = status < 500 ? (err as Error).message : 'Internal server error.';
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
}
