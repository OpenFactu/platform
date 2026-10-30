import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
import { getConfigSection } from '../core/config/systemConfigSection';
import { permissionsForRequest } from './middleware/requirePermission';

/**
 * Puerta de entrada a la mensajería (`apps/messaging`, servicio aparte en Rust).
 *
 * Ese servicio no sabe de contraseñas, permisos ni flags: confía en un ticket
 * corto que emite este endpoint después de comprobarlo todo aquí. Va firmado
 * con un secreto propio (MESSAGING_TICKET_SECRET), así el servicio nunca tiene
 * el JWT_SECRET de las sesiones.
 */
const router = Router();

const AUDIENCE = 'keirost-messaging';
const ISSUER = 'keirost-erp';
const TTL_SECONDS = 15 * 60;
/** Mismo valor que DEV_TICKET_SECRET en apps/messaging/src/config.rs. */
const DEV_TICKET_SECRET = 'keirost-messaging-dev-secret';

function ticketSecret(): string | null {
  const secret = process.env.MESSAGING_TICKET_SECRET?.trim();
  if (secret) return secret;
  return process.env.NODE_ENV === 'production' ? null : DEV_TICKET_SECRET;
}

router.post('/ticket', async (req: any, res) => {
  const userId: string | undefined = req.user?.id;
  const tenantId: string | undefined = req.tenantId;
  if (!userId || !tenantId) return res.status(401).json({ error: 'No autorizado' });

  const secret = ticketSecret();
  if (!secret) {
    console.error('[Mensajes] Falta MESSAGING_TICKET_SECRET en producción');
    return res.status(503).json({ error: 'La mensajería no está configurada' });
  }

  try {
    // El flag se mira aquí, en el servidor: ocultar el menú no basta.
    const flags = await getConfigSection(req.tenantClient, 'flags', FLAGS_DEFAULTS);
    if (!flags.messagingEnabled) {
      return res.status(403).json({ error: 'Los mensajes no están activados en esta empresa' });
    }

    // La empresa sale de la cabecera x-tenant-id, que manda sobre la del JWT:
    // sin esta comprobación, un usuario de otra empresa podría pedir un ticket
    // para esta y leer sus conversaciones.
    if (req.user?.role !== 'SUPERUSER') {
      const publicDb = ClientFactory.getClient('public');
      const [membership] = await publicDb
        .select({ id: schema.userTenantMemberships.id })
        .from(schema.userTenantMemberships)
        .where(
          and(
            eq(schema.userTenantMemberships.userId, userId),
            eq(schema.userTenantMemberships.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!membership) return res.status(403).json({ error: 'No perteneces a esta empresa' });
    }

    const permissions = await permissionsForRequest(req);
    const canWrite = permissions === null || !!permissions['/messaging']?.write;

    const ticket = jwt.sign(
      {
        sub: userId,
        tid: tenantId,
        name: req.user?.username ?? '',
        perms: { read: true, write: canWrite },
      },
      secret,
      { algorithm: 'HS256', audience: AUDIENCE, issuer: ISSUER, expiresIn: TTL_SECONDS },
    );
    res.set('Cache-Control', 'no-store');
    res.json({ ticket, expiresIn: TTL_SECONDS, canWrite });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
