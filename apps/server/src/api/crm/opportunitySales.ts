import { Router } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { requirePermission } from '../middleware/requirePermission';
import { pricesForPartner } from '../../core/pricing/effectivePrices';
import {
  createQuoteFromOpportunity,
  listLines,
  opportunityDocuments,
  replaceLines,
} from '../../core/crm/opportunitySales';
import { logAudit } from '../../utils/audit';
import { errorDetail } from './shared';

/**
 * Rutas de ventas de la oportunidad. Se monta dentro del router de
 * oportunidades ANTES de `/:id`, para que `/prices` no se tome por un id.
 */
const router = Router();

async function loadOpportunity(req: any, res: any) {
  const [opp] = await req.tenantClient
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, req.params.id));
  if (!opp) res.status(404).json({ error: 'Oportunidad no encontrada' });
  return opp;
}

/** GET /prices?partnerId=&itemIds=a,b — precio de venta para el cliente (tarifa o base). */
router.get('/prices', async (req: any, res) => {
  try {
    const itemIds = String(req.query.itemIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const prices = await pricesForPartner(
      req.tenantClient,
      req.query.partnerId ? String(req.query.partnerId) : null,
      itemIds,
    );
    res.json(Object.fromEntries(prices));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.get('/:id/lines', async (req: any, res) => {
  try {
    res.json(await listLines(req.tenantClient, req.params.id));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** PUT /:id/lines — sustituye todas las líneas de interés. */
router.put('/:id/lines', async (req: any, res) => {
  try {
    const opp = await loadOpportunity(req, res);
    if (!opp) return;
    // Cerrada (ganada o perdida) ya no se retoca: lo vendido es lo del presupuesto.
    const [stage] = await req.tenantClient
      .select({ kind: schema.opportunityStages.kind })
      .from(schema.opportunityStages)
      .where(eq(schema.opportunityStages.id, opp.stageId));
    if (stage && stage.kind !== 'open')
      return res
        .status(409)
        .json({ error: 'La oportunidad está cerrada: sus productos ya no se pueden cambiar' });
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : null;
    if (!lines) return res.status(400).json({ error: 'Se esperaba una lista de líneas' });
    res.json(await replaceLines(req.tenantClient, opp, lines));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/**
 * POST /:id/quote — crea un presupuesto con las líneas. Además del permiso de
 * oportunidades exige el de presupuestos: es un documento de ventas.
 */
router.post('/:id/quote', requirePermission('/sales/quotes', 'write'), async (req: any, res) => {
  try {
    const opp = await loadOpportunity(req, res);
    if (!opp) return;
    const validDays = Number(req.body?.validDays) || 30;
    const result = await createQuoteFromOpportunity(
      req.tenantClient,
      { tenantId: req.tenantId, user: req.user },
      opp,
      { validDays },
    );
    res.json(result);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesQuote',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, opportunityId: opp.id },
    });
  } catch (error: any) {
    res.status(400).json({ error: errorDetail(error) });
  }
});

router.get('/:id/documents', async (req: any, res) => {
  try {
    res.json(await opportunityDocuments(req.tenantClient, req.params.id));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
