import { Router } from 'express';
import {
  activityByOwnerReport,
  forecastReport,
  funnelReport,
  lostReasonsReport,
  parsePeriod,
  sourcesReport,
  surveysReport,
} from '../../core/crm/reports';
import { errorDetail } from './shared';

/** Informes del CRM (/api/crm/reports/:informe?from=&to=). */
const router = Router();

const reports: Record<string, (req: any) => Promise<unknown>> = {
  forecast: (req) => forecastReport(req.tenantClient, parsePeriod(req.query)),
  funnel: (req) => funnelReport(req.tenantClient, parsePeriod(req.query)),
  'lost-reasons': (req) => lostReasonsReport(req.tenantClient, parsePeriod(req.query)),
  sources: (req) => sourcesReport(req.tenantClient, parsePeriod(req.query)),
  activity: (req) => activityByOwnerReport(req.tenantClient, req.tenantId, parsePeriod(req.query)),
  surveys: (req) => surveysReport(req.tenantClient, parsePeriod(req.query)),
};

router.get('/:report', async (req: any, res) => {
  const run = reports[req.params.report];
  if (!run) return res.status(404).json({ error: 'Informe no encontrado' });
  try {
    res.json(await run(req));
  } catch (error: any) {
    res.status(/Periodo/.test(error?.message) ? 400 : 500).json({ error: errorDetail(error) });
  }
});

export default router;
