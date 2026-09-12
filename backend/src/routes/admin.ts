import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { TABLES } from '../dataverse/tables';
import { syncUsersToPeople } from '../jobs/syncUsers';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { aggregateArrays } from '../utils/arrayParser';

const router = Router();

router.use(authenticate, requireRole('admin'));

router.post(
  '/sync/users',
  asyncHandler(async (req, res) => {
    const { dryRun } = z.object({ dryRun: z.boolean().optional() }).parse(req.body ?? {});
    res.json(await syncUsersToPeople({ dryRun }));
  }),
);

router.get(
  '/connection',
  asyncHandler(async (_req, res) => {
    const identity = await dv.whoAmI();
    res.json({ connected: true, identity, tables: TABLES });
  }),
);

/** Portfolio-level supply vs. demand roll-up. */
router.get(
  '/portfolio-summary',
  asyncHandler(async (_req, res) => {
    const C = COLUMNS.capacity;
    const D = COLUMNS.demand;
    const [capacity, demand, projects, requests] = await Promise.all([
      dv.list('capacity', { select: [C.id, C.hoursArray], top: 5000, includeFormattedValues: false }),
      dv.list('demand', { select: [D.id, D.hoursArray], top: 5000, includeFormattedValues: false }),
      dv.list('projects', { select: [COLUMNS.projects.id], top: 5000, includeFormattedValues: false }),
      dv.list('requests', { select: [COLUMNS.requests.id], top: 5000, includeFormattedValues: false }),
    ]);

    const availability = aggregateArrays(capacity.map((r) => r[C.hoursArray] as string | null));
    const committed = aggregateArrays(demand.map((r) => r[D.hoursArray] as string | null));

    res.json({
      projectCount: projects.length,
      requestCount: requests.length,
      peopleWithCapacity: capacity.length,
      demandRows: demand.length,
      availability,
      demand: committed,
      net: availability.map((value, index) => value - committed[index]),
    });
  }),
);

export default router;
