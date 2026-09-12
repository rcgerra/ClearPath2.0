import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { assertProductionSecrets, env, isDataverseConfigured } from './config/env';
import demoRoutes from './demo/demoRoutes';
import { errorHandler, notFound } from './middleware/errorHandler';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import capacityRoutes from './routes/capacity';
import demandRoutes from './routes/demand';
import departmentRoutes from './routes/departments';
import lookupRoutes from './routes/lookups';
import metadataRoutes from './routes/metadata';
import peopleRoutes from './routes/people';
import prioritizationRoutes from './routes/prioritization';
import projectRoutes from './routes/projects';
import requestRoutes from './routes/requests';
import userRoutes from './routes/users';

assertProductionSecrets();

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(',').map((value) => value.trim()), credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 20 }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    environment: env.nodeEnv,
    demoMode: env.demoMode,
    dataverseConfigured: isDataverseConfigured(),
    sqlMirrorEnabled: env.sql.enabled,
  });
});

// Demo data short-circuits the Dataverse routers, so it must be mounted first.
if (env.demoMode) {
  app.use('/api', demoRoutes);
}

app.use('/api/auth', authRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/demand', demandRoutes);
app.use('/api/capacity', capacityRoutes);
app.use('/api/prioritization', prioritizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/admin', adminRoutes);

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed.', issues: err.issues });
    return;
  }
  next(err);
});
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`ClearPath API listening on http://localhost:${env.port}`);
  if (env.demoMode) {
    console.warn('DEMO_MODE is on: serving in-memory sample data instead of Dataverse.');
  } else if (!isDataverseConfigured()) {
    console.warn('Dataverse is not configured. Copy .env.example to .env and fill in the DATAVERSE_* values.');
  }
});

export default app;
