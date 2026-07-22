import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';

/**
 * Middleware para tokens de API (integraciones server-to-server).
 *
 * Si el `Authorization: Bearer <token>` empieza por `tk_`, se valida contra
 * la tabla `public.ApiToken`. Si es válido y no está revocado:
 *   - Se fuerza el header `x-tenant-id` con el tenant propietario del token.
 *   - Se inyecta `req.apiToken = { id, scopes: string[] }`.
 *   - Se actualiza `lastUsedAt` (throttled a 1/min).
 *
 * Después cede a `tenantContextMiddleware`, que seguirá leyendo `x-tenant-id`
 * como de costumbre. El JWT de usuario no se toca — un token de API es
 * independiente del usuario.
 */

const lastUsedThrottle = new Map<string, number>();
const THROTTLE_MS = 60_000;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hasScope(req: any, required: string): boolean {
  if (!req.apiToken) return true; // JWT normal → la autorización la hace el JWT
  const scopes: string[] = req.apiToken.scopes || [];
  if (scopes.includes('*')) return true;
  if (scopes.includes(required)) return true;
  // Permitir coincidencia por prefijo: `write:logistics` implica `read:logistics`.
  if (required.startsWith('read:')) {
    const writeEquivalent = required.replace('read:', 'write:');
    if (scopes.includes(writeEquivalent)) return true;
  }
  return false;
}

/**
 * Middleware factory: exige un scope concreto. Una sesión de usuario (JWT)
 * pasa siempre — la autorización la resuelve el JWT/rol. Solo restringe cuando
 * la petición llega con un token de API (`req.apiToken`), de modo que añadirlo
 * a un endpoint que también usa la web es seguro: el front con JWT no se ve
 * afectado.
 */
export function requireScope(scope: string) {
  return (req: any, res: Response, next: NextFunction) => {
    if (hasScope(req, scope)) return next();
    return res.status(403).json({ error: `Falta el scope ${scope}` });
  };
}

export const apiTokenMiddleware = async (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  const raw = authHeader.substring(7).trim();
  if (!raw.startsWith('tk_')) return next();

  try {
    const publicDb = ClientFactory.getClient('public');
    const tokenHash = hashToken(raw);
    const [row] = await publicDb
      .select()
      .from(schema.apiTokens)
      .where(and(eq(schema.apiTokens.tokenHash, tokenHash), isNull(schema.apiTokens.revokedAt)));

    if (!row) return res.status(401).json({ error: 'Token de API inválido o revocado.' });

    req.apiToken = {
      id: row.id,
      scopes: (row.scopes || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      tenantId: row.tenantId,
      name: row.name,
    };
    // Sobrescribimos el header para que el tenantContext resuelva bien.
    req.headers['x-tenant-id'] = row.tenantId;

    // Throttled update de lastUsedAt.
    const last = lastUsedThrottle.get(row.id) || 0;
    if (Date.now() - last > THROTTLE_MS) {
      lastUsedThrottle.set(row.id, Date.now());
      publicDb
        .update(schema.apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.apiTokens.id, row.id))
        .catch(() => {
          /* ignore */
        });
    }

    // Evitar que tenantContextMiddleware intente verificar este token como JWT.
    delete req.headers.authorization;
    return next();
  } catch (e: any) {
    console.error('[apiToken] error:', e?.message);
    return res.status(500).json({ error: 'Error validando token de API.' });
  }
};
