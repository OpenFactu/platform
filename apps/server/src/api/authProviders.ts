/**
 * Proveedores de inicio de sesión (Google, Microsoft, OIDC) de la instancia: Administración →
 * Inicio de sesión. Solo un SUPERUSER de la base: el rol de la sesión puede ser el de una
 * pertenencia, así que se mira `GlobalUser.role`.
 *
 * El secreto del cliente se guarda cifrado (`totpCrypto.ts`) y nunca sale: se manda
 * `hasSecret`. En un `PATCH`, sin `clientSecret` se queda el que había.
 */
import crypto from 'crypto';
import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { encryptSecret } from '../core/auth/totpCrypto';
import { ISSUERS, SSO_KINDS, redirectUriFor, webOrigin } from '../core/auth/sso';
import { internalError } from './auth/ssoRoutes';

const router = Router();
const db = () => ClientFactory.getClient('public');

router.use(async (req: any, res, next) => {
  try {
    const id = req.user?.id || req.user?.userId;
    const [u] = id
      ? await db()
          .select({ role: schema.globalUsers.role })
          .from(schema.globalUsers)
          .where(eq(schema.globalUsers.id, id))
      : [];
    if (u?.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'Solo SUPERUSER', code: 'FORBIDDEN' });
    }
    next();
  } catch (e: any) {
    internalError(res, 'auth-providers gate', e);
  }
});

type Row = typeof schema.authProviders.$inferSelect;

function serialize(row: Row) {
  let allowedDomains: string[] = [];
  try {
    const v = row.allowedDomains ? JSON.parse(row.allowedDomains) : [];
    if (Array.isArray(v)) allowedDomains = v.map(String);
  } catch {
    /* lista vacía */
  }
  const origin = webOrigin();
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    issuer: row.issuer,
    clientId: row.clientId,
    scopes: row.scopes,
    enabled: row.enabled,
    allowedDomains,
    trustProviderMfa: row.trustProviderMfa,
    hasSecret: !!row.clientSecretEnc,
    // Lo que hay que registrar en el proveedor; sin WEB_ORIGIN no hay ninguno.
    redirectUri: origin ? redirectUriFor(row.id, origin) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class InvalidInput extends Error {
  code = 'INVALID_INPUT';
}

/**
 * El issuer de un OIDC genérico va por https. Por http solo en desarrollo o en esta misma
 * máquina (un proveedor de pruebas): el secreto del cliente viaja al endpoint de tokens.
 */
export function issuerAllowed(issuer: string): boolean {
  let u: URL;
  try {
    u = new URL(issuer);
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  if (process.env.NODE_ENV === 'development') return true;
  return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Lo que se puede escribir, validado. En el alta (sin `current`) exige los obligatorios. */
function parseBody(body: any, current: Row | null): Partial<Row> {
  const out: Partial<Row> = {};
  const kind = body.kind !== undefined ? str(body.kind, 20) : (current?.kind ?? '');
  if (!current || body.kind !== undefined) {
    if (!(SSO_KINDS as readonly string[]).includes(kind)) {
      throw new InvalidInput('Tipo de proveedor no válido');
    }
    out.kind = kind;
  }
  if (!current || body.name !== undefined) {
    const name = str(body.name, 100);
    if (!name) throw new InvalidInput('Falta el nombre');
    out.name = name;
  }
  if (!current || body.clientId !== undefined) {
    const clientId = str(body.clientId);
    if (!clientId) throw new InvalidInput('Falta el client ID');
    out.clientId = clientId;
  }
  // Google y Microsoft tienen su issuer fijo; en OIDC lo pone quien lo configura.
  if (kind === 'google' || kind === 'microsoft') {
    out.issuer = ISSUERS[kind];
  } else if (!current || body.issuer !== undefined || body.kind !== undefined) {
    const issuer = str(body.issuer ?? current?.issuer);
    if (!issuerAllowed(issuer)) {
      throw new InvalidInput('El issuer tiene que ser una URL https');
    }
    out.issuer = issuer.replace(/\/$/, '');
  }
  if (typeof body.clientSecret === 'string' && body.clientSecret.trim()) {
    out.clientSecretEnc = encryptSecret(body.clientSecret.trim());
  }
  if (body.scopes !== undefined) {
    const scopes = str(body.scopes).split(/\s+/).filter(Boolean);
    // Sin `openid` el proveedor no devuelve `id_token` y el SSO no puede funcionar.
    if (scopes.length && !scopes.includes('openid')) {
      throw new InvalidInput('Los scopes tienen que incluir openid');
    }
    out.scopes = scopes.length ? scopes.join(' ') : null;
  }
  if (body.enabled !== undefined) out.enabled = !!body.enabled;
  if (body.trustProviderMfa !== undefined) out.trustProviderMfa = !!body.trustProviderMfa;
  if (body.allowedDomains !== undefined) {
    if (!Array.isArray(body.allowedDomains)) {
      throw new InvalidInput('allowedDomains tiene que ser una lista');
    }
    const list = [
      ...new Set(
        body.allowedDomains.map((d: unknown) => str(d, 255).toLowerCase()).filter(Boolean),
      ),
    ];
    out.allowedDomains = list.length ? JSON.stringify(list) : null;
  }
  return out;
}

const invalid = (res: any, e: InvalidInput) =>
  res.status(400).json({ error: e.message, code: e.code });

router.get('/', async (_req, res) => {
  try {
    const rows = await db()
      .select()
      .from(schema.authProviders)
      .orderBy(asc(schema.authProviders.name));
    res.json({ providers: rows.map(serialize) });
  } catch (e: any) {
    internalError(res, 'auth-providers list', e);
  }
});

router.post('/', async (req, res) => {
  try {
    const values = parseBody(req.body || {}, null);
    const now = new Date();
    const [row] = await db()
      .insert(schema.authProviders)
      .values({ ...(values as any), id: crypto.randomUUID(), createdAt: now, updatedAt: now })
      .returning();
    res.status(201).json(serialize(row));
  } catch (e: any) {
    if (e instanceof InvalidInput) return invalid(res, e);
    internalError(res, 'auth-providers create', e);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const [current] = await db()
      .select()
      .from(schema.authProviders)
      .where(eq(schema.authProviders.id, req.params.id));
    if (!current) return res.status(404).json({ error: 'No encontrado', code: 'NOT_FOUND' });
    const values = parseBody(req.body || {}, current);
    // `updatedAt` cambia siempre: es la clave de la caché del cliente OIDC.
    const [row] = await db()
      .update(schema.authProviders)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.authProviders.id, current.id))
      .returning();
    res.json(serialize(row));
  } catch (e: any) {
    if (e instanceof InvalidInput) return invalid(res, e);
    internalError(res, 'auth-providers update', e);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const rows = await db()
      .delete(schema.authProviders)
      .where(eq(schema.authProviders.id, req.params.id))
      .returning({ id: schema.authProviders.id });
    if (!rows.length) return res.status(404).json({ error: 'No encontrado', code: 'NOT_FOUND' });
    res.status(204).end();
  } catch (e: any) {
    internalError(res, 'auth-providers delete', e);
  }
});

export default router;
