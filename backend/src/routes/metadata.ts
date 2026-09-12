import { Router } from 'express';
import axios from 'axios';
import { env } from '../config/env';
import * as dv from '../dataverse/client';
import { requireTable, TABLES } from '../dataverse/tables';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.get('/tables', authenticate, (_req, res) => {
  res.json(TABLES);
});

/** Lists the real attributes of a linked table so column maps can be verified. */
router.get(
  '/:table',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const table = requireTable(req.params.table);
    const token = await (await import('../dataverse/auth')).getAccessToken();
    const { data } = await axios.get(
      `${env.dataverse.url}/api/data/v${env.dataverse.apiVersion}/EntityDefinitions(LogicalName='${table.logicalName}')/Attributes?$select=LogicalName,SchemaName,AttributeType,MaxLength,IsValidForCreate,IsValidForUpdate`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    res.json({
      table,
      entitySetName: await dv.getEntitySetName(table.logicalName),
      primaryIdAttribute: await dv.getPrimaryIdAttribute(table.logicalName),
      attributes: data.value,
    });
  }),
);

export default router;
