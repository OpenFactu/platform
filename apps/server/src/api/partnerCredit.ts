/**
 * Lo usado y lo disponible de un cliente. Va aparte de `/partners` porque también lo pide
 * quien vende sin poder entrar en la ficha del interlocutor.
 */
import { Router } from 'express';
import { partnerCreditStatus } from '../core/partners/creditLimit';

const router = Router();

router.get('/:partnerId', async (req: any, res) => {
  try {
    const status = await partnerCreditStatus(req.tenantClient, req.params.partnerId, {
      amount: Number(req.query.amount) || 0,
      user: req.user,
      tenantId: req.tenantId,
    });
    if (!status) return res.status(404).json({ error: 'Interlocutor no encontrado' });
    res.json(status);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
