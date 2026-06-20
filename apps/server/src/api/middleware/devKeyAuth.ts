import { Request, Response, NextFunction } from 'express';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema';

/**
 * Middleware que acepta autenticacion por:
 * 1. JWT de admin (Authorization: Bearer <jwt>) — como antes
 * 2. Dev API Key (X-Client-Id + X-Client-Secret) — para desarrolladores de plugins
 *
 * Verifica que la key sea valida, activa y tenga el permiso requerido.
 */
export function devKeyOrAdmin(requiredPermission: string) {
  return async (req: any, res: Response, next: NextFunction) => {
    const clientId = req.headers['x-client-id'];
    const clientSecret = req.headers['x-client-secret'];

    // Si tiene headers de dev key, autenticar por API key
    if (clientId && clientSecret) {
      try {
        const db = ClientFactory.getClient('public');
        const [key] = await db
          .select()
          .from(schema.devApiKeys)
          .where(
            and(
              eq(schema.devApiKeys.clientId, clientId as string),
              eq(schema.devApiKeys.isActive, true),
            ),
          );

        if (!key) {
          return res.status(401).json({ error: 'Client ID no valido o desactivado' });
        }

        if (key.clientSecret !== clientSecret) {
          return res.status(401).json({ error: 'Client Secret incorrecto' });
        }

        // Verificar permiso
        const permissions = (key.permissions || '').split(',');
        if (!permissions.includes(requiredPermission)) {
          return res
            .status(403)
            .json({ error: `Permiso "${requiredPermission}" no autorizado para esta key` });
        }

        // Actualizar ultimo uso
        await db
          .update(schema.devApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(schema.devApiKeys.id, key.id));

        req.user = { id: key.createdBy, role: 'DEV_KEY', devKeyId: key.id };
        return next();
      } catch (err: any) {
        return res.status(500).json({ error: 'Error verificando API key: ' + err.message });
      }
    }

    // Fallback a JWT admin
    const { adminMiddleware } = require('./adminAuth');
    return adminMiddleware(req, res, next);
  };
}
