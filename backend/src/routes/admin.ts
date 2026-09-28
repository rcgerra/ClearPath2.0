import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { TABLES } from '../dataverse/tables';
import { syncUsersToPeople } from '../jobs/syncUsers';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { aggregateArrays } from '../utils/arrayParser';
import { personIdsAtSite, viewSiteForRequest } from '../services/siteScope';
import { listReferenceMetadata } from '../services/referenceMetadata';
import { projectRepository, requestRepository } from '../repositories/sql';

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
  asyncHandler(async (req, res) => {
    const C = COLUMNS.capacity;
    const D = COLUMNS.demand;
    const siteId = await viewSiteForRequest(req);
    const [capacity, demand, projects, requests] = await Promise.all([
      dv.list('capacity', { select: [C.id, C.personId, C.hoursArray], top: 5000, includeFormattedValues: false }),
      dv.list('demand', { select: [D.id, D.personId, D.hoursArray], top: 5000, includeFormattedValues: false }),
      dv.list('projects', { select: [COLUMNS.projects.id], top: 5000, includeFormattedValues: false }),
      dv.list('requests', { select: [COLUMNS.requests.id], top: 5000, includeFormattedValues: false }),
    ]);

    const personIds = siteId ? await personIdsAtSite(siteId) : null;
    const filteredCapacity = capacity.filter((row) => !personIds || personIds.has(String(row[C.personId] ?? '').toLowerCase()));
    const filteredDemand = demand.filter((row) => !personIds || personIds.has(String(row[D.personId] ?? '').toLowerCase()));
    const availability = aggregateArrays(filteredCapacity.map((r) => r[C.hoursArray] as string | null));
    const committed = aggregateArrays(filteredDemand.map((r) => r[D.hoursArray] as string | null));
    const [projectMetadata, requestMetadata] = siteId ? await Promise.all([listReferenceMetadata('projects'), listReferenceMetadata('requests')]) : [new Map(), new Map()];
    const scopedProjects = siteId ? (await projectRepository.listFiltered({ includeInactive: true })).filter((row) => projectMetadata.get(row.ProjectApiId.toLowerCase())?.siteId?.toLowerCase() === siteId.toLowerCase() || row.SiteApiId?.toLowerCase() === siteId.toLowerCase()).length : projects.length;
    const scopedRequests = siteId ? (await requestRepository.listFiltered({ includeInactive: true })).filter((row) => requestMetadata.get(row.RequestApiId.toLowerCase())?.siteId?.toLowerCase() === siteId.toLowerCase() || personIds?.has(String(row.RequesterPersonApiId ?? '').toLowerCase())).length : requests.length;

    res.json({
      projectCount: scopedProjects,
      requestCount: scopedRequests,
      peopleWithCapacity: filteredCapacity.length,
      demandRows: filteredDemand.length,
      availability,
      demand: committed,
      net: availability.map((value, index) => value - committed[index]),
    });
  }),
);

export default router;
