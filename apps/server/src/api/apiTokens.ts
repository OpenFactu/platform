/**
 * API Tokens — tokens de API por tenant para integraciones server-to-server.
 *
 * - `GET  /api/admin/api-tokens`         → lista (sin el token en claro, solo prefix)
 * - `POST /api/admin/api-tokens`         → crea; el token en claro se devuelve UNA SOLA VEZ
 * - `DELETE /api/admin/api-tokens/:id`   → revoca (soft — conserva auditoría)
 *
 * Requiere rol `ADMIN` (mismo criterio que el resto de `/api/admin/*`).
 */
import { Router } from 'express';
import crypto from 'crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.apiToken) {
    return res.status(403).json({ error: 'La gestión de tokens requiere usuario autenticado.' });
  }
  if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
  const role = String(req.user.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Solo el administrador puede gestionar tokens.' });
  }
  next();
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): { raw: string; prefix: string; hash: string } {
  // 32 bytes aleatorios en base64url → 43 chars. Prefijo tk_ para detección.
  const buf = crypto.randomBytes(32);
  const raw =
    'tk_' + buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { raw, prefix: raw.substring(0, 11), hash: hashToken(raw) };
}

router.get('/', requireAdmin, async (req: any, res) => {
  try {
    const publicDb = ClientFactory.getClient('public');
    const rows = await publicDb
      .select({
        id: schema.apiTokens.id,
        name: schema.apiTokens.name,
        prefix: schema.apiTokens.prefix,
        scopes: schema.apiTokens.scopes,
        createdAt: schema.apiTokens.createdAt,
        lastUsedAt: schema.apiTokens.lastUsedAt,
        revokedAt: schema.apiTokens.revokedAt,
      })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tenantId, req.tenantId))
      .orderBy(desc(schema.apiTokens.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireAdmin, async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const scopes: string[] = Array.isArray(body.scopes)
      ? body.scopes
      : String(body.scopes || '').split(',');
    const cleanScopes = scopes.map((s) => String(s).trim()).filter(Boolean);
    if (cleanScopes.length === 0) cleanScopes.push('read:logistics');

    const { raw, prefix, hash } = generateToken();
    const id = crypto.randomUUID();
    const publicDb = ClientFactory.getClient('public');
    await publicDb.insert(schema.apiTokens).values({
      id,
      tenantId: req.tenantId,
      name: body.name,
      tokenHash: hash,
      prefix,
      scopes: cleanScopes.join(','),
      createdByUserId: req.user?.id || null,
    });

    // El token en claro NO se vuelve a mostrar — el cliente debe guardarlo ahora.
    res.json({
      id,
      name: body.name,
      prefix,
      scopes: cleanScopes,
      token: raw,
      warning:
        'Guarda este token ahora. Por seguridad no podrá volver a mostrarse. Si lo pierdes, revócalo y crea otro.',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAdmin, async (req: any, res) => {
  try {
    const publicDb = ClientFactory.getClient('public');
    const [row] = await publicDb
      .select({ tenantId: schema.apiTokens.tenantId })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Token no encontrado.' });
    if (row.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Token de otro tenant.' });
    }
    await publicDb
      .update(schema.apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiTokens.id, req.params.id), isNull(schema.apiTokens.revokedAt)));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
