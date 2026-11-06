/**
 * Entrega de login entre dispositivos: crear el relevo, ver qué se aprueba y sondear.
 * Aprobarlo no es una ruta pública: lo llaman el enlace del correo y el SSO.
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { createHandoff, handoffInfo, pollHandoff } from '../../core/auth/handoff';
import { clientInfo } from '../../core/auth/clientInfo';
import { checkThrottle, recordAttempt, sendThrottled } from '../../core/auth/throttle';
import { startMfaOrComplete } from './mfaRoutes';

const router = Router();

/** POST /api/auth/handoff — un cliente pide que otro dispositivo le deje entrar. */
router.post('/handoff', async (req, res) => {
  try {
    const client = clientInfo(req);
    const gate = await checkThrottle('handoff', { ip: client.ip });
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);
    // Cada relevo creado cuenta contra la IP: crear sin parar también es abuso.
    await recordAttempt('handoff', { ip: client.ip }, false);
    res.json(await createHandoff(client));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/auth/handoff/:id — lo que ve quien aprueba. */
router.get('/handoff/:id', async (req, res) => {
  try {
    const info = await handoffInfo(req.params.id);
    if (!info) return res.status(404).json({ error: 'No encontrado', code: 'HANDOFF_INVALID' });
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/auth/handoff/poll { handoffId, pollSecret } */
router.post('/handoff/poll', async (req, res) => {
  const { handoffId, pollSecret } = req.body || {};
  try {
    // Clave aparte de la de crear: sondear cada pocos segundos no debe bloquearse por crear muchos.
    const ip = clientInfo(req).ip;
    const gate = await checkThrottle('handoff_poll', { ip });
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);
    const r = await pollHandoff(handoffId, pollSecret);
    // Solo cuenta el sondeo que no cuadra (id o secreto ajenos), no el que espera de verdad.
    if (r.status === 'pending' && r.unknown) await recordAttempt('handoff_poll', { ip }, false);
    if (r.status !== 'approved') return res.json({ status: r.status });

    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, r.userId));
    if (!user) return res.json({ status: 'expired' });
    // El reto ya está consumido antes de saber si la sesión llega a abrirse: si algo falla
    // después, el relevo se pierde y hay que pedir otro (falla cerrado, nunca abierto).
    // Entra el cliente que sondea: `clientInfo(req)` es el suyo.
    await startMfaOrComplete(req, res, user, {
      method: 'handoff:' + r.method,
      mfa: r.mfaDone,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
