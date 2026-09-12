import { Router } from 'express';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

/** Read-only projection of the Dataverse User (systemuser) table. */
const router = Router();
const U = COLUMNS.users;
const select = [U.id, U.fullName, U.email, U.domainName, U.jobTitle, U.isDisabled];

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = ['isdisabled eq false'];
    if (req.query.search) {
      const term = dv.odataString(String(req.query.search));
      filters.push(`(contains(${U.fullName},${term}) or contains(${U.email},${term}))`);
    }
    const records = await dv.list('users', {
      select,
      filter: filters.join(' and '),
      orderBy: `${U.fullName} asc`,
      top: Number(req.query.top ?? 200),
      includeFormattedValues: false,
    });
    res.json(
      records.map((r) => ({
        id: r[U.id],
        fullName: r[U.fullName],
        email: r[U.email],
        domainName: r[U.domainName],
        jobTitle: r[U.jobTitle],
      })),
    );
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = (await dv.retrieve('users', req.params.id, { select, includeFormattedValues: false })) as Record<
      string,
      unknown
    >;
    res.json({
      id: r[U.id],
      fullName: r[U.fullName],
      email: r[U.email],
      domainName: r[U.domainName],
      jobTitle: r[U.jobTitle],
    });
  }),
);

export default router;
