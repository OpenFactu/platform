/** Reclamación de impagos: lo vencido por cliente, la carta y su historial. */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';
import {
  getLetter,
  listLetters,
  mailProblem,
  prepareLetter,
  sendLetter,
} from '../core/dunning/letters';
import { listOverdue } from '../core/dunning/overdueList';
import { requireScope } from './middleware/apiToken';

const router = Router();

// Un token de API no pasa por los permisos de usuario: lo acotan sus scopes.
router.use(requireScope('write:ventas'));

function fail(res: any, error: any) {
  if (!error.statusCode) console.error('[Dunning]', error);
  res.status(error.statusCode || 500).json({ error: error.message });
}

router.get('/overdue', async (req: any, res) => {
  try {
    res.json(await listOverdue(req.tenantClient));
  } catch (error: any) {
    fail(res, error);
  }
});

router.get('/letters', async (req: any, res) => {
  try {
    res.json(await listLetters(req.tenantClient, { partnerId: req.query.partnerId }));
  } catch (error: any) {
    fail(res, error);
  }
});

router.get('/letters/:id', async (req: any, res) => {
  try {
    res.json(await getLetter(req.tenantClient, req.params.id));
  } catch (error: any) {
    fail(res, error);
  }
});

router.get('/preview/:partnerId', async (req: any, res) => {
  try {
    const { customer, ...letter } = await prepareLetter(req.tenantClient, req.params.partnerId);
    res.json({
      ...letter,
      excluded: customer.excluded,
      lastLetterAt: customer.lastLetterAt,
      daysSinceLetter: customer.daysSinceLetter,
      needsLetter: customer.needsLetter,
      mailProblem: await mailProblem(req.tenantClient),
    });
  } catch (error: any) {
    fail(res, error);
  }
});

router.post('/send/:partnerId', async (req: any, res) => {
  try {
    const result = await sendLetter(
      req.tenantClient,
      { tenantId: req.tenantId, user: req.user },
      req.params.partnerId,
      { to: req.body?.to },
    );
    res.json(result);
  } catch (error: any) {
    fail(res, error);
  }
});

router.patch('/partners/:partnerId', async (req: any, res) => {
  try {
    const excluded = req.body?.excluded === true;
    const [partner] = await req.tenantClient
      .update(schema.businessPartners)
      .set({ dunningExcluded: excluded })
      .where(eq(schema.businessPartners.id, req.params.partnerId))
      .returning({ id: schema.businessPartners.id });
    if (!partner) return res.status(404).json({ error: 'Interlocutor no encontrado' });
    res.json({ partnerId: partner.id, excluded });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'BusinessPartner',
      entityId: partner.id,
      action: 'UPDATE',
      newValue: { dunningExcluded: excluded },
    });
  } catch (error: any) {
    fail(res, error);
  }
});

export default router;
