import { Router } from 'express';
import { grantsRead, permissionsForRequest } from '../middleware/requirePermission';
import { partnerSummary, partnerTimeline } from '../../core/crm/partner360';
import { errorDetail } from './shared';

/** Vista 360 de un cliente: cifras y línea de tiempo, recortadas a lo que el usuario puede ver. */
const router = Router();

async function readChecker(req: any) {
  const permissions = await permissionsForRequest(req);
  return (path: string) => grantsRead(permissions, path);
}

router.get('/:id/summary', async (req: any, res) => {
  try {
    res.json(await partnerSummary(req.tenantClient, req.params.id, await readChecker(req)));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** GET /:id/timeline?limit=&before=ISO */
router.get('/:id/timeline', async (req: any, res) => {
  try {
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;
    res.json(
      await partnerTimeline(req.tenantClient, req.params.id, await readChecker(req), {
        limit: Number(req.query.limit) || 30,
        before: before && !Number.isNaN(before.getTime()) ? before : undefined,
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
