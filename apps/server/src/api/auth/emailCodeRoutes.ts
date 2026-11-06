/**
 * Código y enlace por correo. Sin sesión: `/api/auth` se monta antes del contexto de empresa.
 * Aprobar un handoff con el enlace pasa por aquí porque el enlace es la prueba de identidad.
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { clientInfo } from '../../core/auth/clientInfo';
import { checkThrottle, recordAttempt, sendThrottled } from '../../core/auth/throttle';
import { HandoffError, approveHandoff, handoffInfo } from '../../core/auth/handoff';
import {
  peekEmailLink,
  redeemEmailLink,
  requestEmailCode,
  verifyEmailCode,
} from '../../core/auth/emailCode';
import { startMfaOrComplete } from './mfaRoutes';
import { internalError } from './internalError';

const router = Router();

const codeInvalid = (res: any) =>
  res.status(401).json({ error: 'Código no válido', code: 'CODE_INVALID' });
const linkInvalid = (res: any) =>
  res.status(401).json({ error: 'El enlace no es válido o ha caducado', code: 'LINK_INVALID' });

async function userById(id: string) {
  const [user] = await ClientFactory.getClient('public')
    .select()
    .from(schema.globalUsers)
    .where(eq(schema.globalUsers.id, id));
  return user ?? null;
}

/** POST /api/auth/email-code { email, handoffId? } — siempre 202, exista la cuenta o no. */
router.post('/email-code', (req, res) => {
  const { email, handoffId } = req.body || {};
  const client = clientInfo(req);
  // Se responde antes de trabajar: con o sin cuenta, con o sin SMTP, la respuesta tarda lo mismo.
  res.status(202).json({ sent: true });
  requestEmailCode(
    String(email ?? ''),
    client,
    typeof handoffId === 'string' ? handoffId : undefined,
  ).catch((e: any) => console.error('[auth] No se pudo enviar el código por correo:', e?.message));
});

/** POST /api/auth/email-code/verify { email, code, tenantId? } */
router.post('/email-code/verify', async (req, res) => {
  const { email, code, tenantId } = req.body || {};
  try {
    const found = await verifyEmailCode(String(email ?? ''), String(code ?? ''), clientInfo(req));
    if (!found) return codeInvalid(res);
    const user = await userById(found.userId);
    if (!user) return codeInvalid(res);
    // El correo no es un segundo factor: si el usuario tiene uno, se le pide.
    return await startMfaOrComplete(req, res, user, {
      method: 'email_code',
      mfa: null,
      tenantId: typeof tenantId === 'string' ? tenantId : null,
    });
  } catch (error: any) {
    internalError(res, 'POST /email-code/verify', error);
  }
});

/** El enlace es un secreto de 256 bits: adivinarlo no es viable, pero se frena por IP igualmente. */
async function linkGate(req: any, res: any): Promise<boolean> {
  const gate = await checkThrottle('email_code', { ip: clientInfo(req).ip });
  if (gate.blocked) {
    sendThrottled(res, gate.retryAfter);
    return false;
  }
  return true;
}

/**
 * POST /api/auth/email-link { token }
 * Sin handoff, entra en este navegador. Con handoff, no: enseña qué se aprueba.
 */
router.post('/email-link', async (req, res) => {
  const token = String(req.body?.token ?? '');
  try {
    if (!(await linkGate(req, res))) return;
    const peek = await peekEmailLink(token);
    if (!peek) {
      void recordAttempt('email_code', { ip: clientInfo(req).ip }, false).catch(() => {});
      return linkInvalid(res);
    }
    if (peek.handoffId) {
      const info = await handoffInfo(peek.handoffId);
      if (!info) return linkInvalid(res);
      return res.json({ handoff: info });
    }
    const used = await redeemEmailLink(token);
    const user = used ? await userById(used.userId) : null;
    if (!user) return linkInvalid(res);
    return await startMfaOrComplete(req, res, user, { method: 'email_code', mfa: null });
  } catch (error: any) {
    internalError(res, 'POST /email-link', error);
  }
});

/** POST /api/auth/email-link/approve { token } — el enlace aprueba el handoff de otro dispositivo. */
router.post('/email-link/approve', async (req, res) => {
  const token = String(req.body?.token ?? '');
  try {
    if (!(await linkGate(req, res))) return;
    const peek = await peekEmailLink(token);
    if (!peek?.handoffId || !(await handoffInfo(peek.handoffId))) return linkInvalid(res);
    const used = await redeemEmailLink(token);
    if (!used?.handoffId) return linkInvalid(res);
    // `mfaDone` null: el correo no es segundo factor, el otro dispositivo pedirá el del usuario.
    await approveHandoff(used.handoffId, used.userId, 'email_code', null);
    res.json({ approved: true });
  } catch (error: any) {
    if (error instanceof HandoffError) return linkInvalid(res);
    internalError(res, 'POST /email-link/approve', error);
  }
});

export default router;
