import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { eq, or } from 'drizzle-orm';
import { resolveSession } from '../core/auth/sessions';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { SchemaManager } from '../core/tenant/SchemaManager';
import { setCompanyConfig } from '../core/config/companyConfig';
import { LocalizationInstaller } from '../core/localization/LocalizationInstaller';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';

const router = Router();

interface AuthPayload {
  userId: string;
  role: string;
  tenantId?: string | null;
}

async function requireAuth(req: any, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });
  const token = authHeader.split(' ')[1];
  const resolved = await resolveSession(token);
  if ('error' in resolved) {
    const code = resolved.error === 'INVALID' ? 'UNAUTHORIZED' : resolved.error;
    return res.status(401).json({ error: 'Token inválido', code });
  }
  req.authPayload = resolved.payload as AuthPayload;
  next();
}

function requireAdmin(req: any, res: Response, next: NextFunction) {
  const role = req.authPayload?.role;
  if (role !== 'SUPERUSER' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Se requiere rol ADMIN o SUPERUSER' });
  }
  next();
}

router.use(requireAuth);

/**
 * GET /api/tenants/mine
 * Devuelve los tenants accesibles al usuario autenticado.
 */
router.get('/mine', async (req: any, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const { userId } = req.authPayload;

    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, userId));
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (user.role === 'SUPERUSER') {
      const all = await db
        .select({ id: schema.tenants.id, name: schema.tenants.name })
        .from(schema.tenants);
      return res.json(all);
    }

    const memberships = await db
      .select({ id: schema.tenants.id, name: schema.tenants.name })
      .from(schema.userTenantMemberships)
      .innerJoin(schema.tenants, eq(schema.userTenantMemberships.tenantId, schema.tenants.id))
      .where(eq(schema.userTenantMemberships.userId, user.id));

    const legacy = user.tenantId
      ? await db
          .select({ id: schema.tenants.id, name: schema.tenants.name })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, user.tenantId))
      : [];

    // Unir sin duplicados
    const seen = new Set<string>();
    const merged: { id: string; name: string }[] = [];
    for (const t of [...memberships, ...legacy]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }

    res.json(merged);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tenants
 * Crea una nueva empresa con seed de defaults y guarda config inicial en
 * SystemConfig. Si el usuario no es SUPERUSER, se inserta membership ADMIN.
 */
router.post('/', requireAdmin, async (req: any, res) => {
  const body = req.body || {};
  const { name, nif } = body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });

  try {
    const publicDb = ClientFactory.getClient('public');

    const slug = String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!slug) return res.status(400).json({ error: 'Nombre inválido' });
    const schemaName = `tenant_${slug}`;

    const [existing] = await publicDb
      .select()
      .from(schema.tenants)
      .where(or(eq(schema.tenants.name, name), eq(schema.tenants.schemaName, schemaName)));
    if (existing) return res.status(409).json({ error: 'Ya existe una empresa con ese nombre' });

    const tenantId = await SchemaManager.createTenantSchema(name, schemaName, { nif: nif || '' });

    // Persistir config inicial en SystemConfig del nuevo tenant
    try {
      const tenantDb = ClientFactory.getClient(schemaName);
      const country = body.country || '';
      const [countryRow] = country
        ? await publicDb.select().from(schema.countries).where(eq(schema.countries.code, country))
        : [];
      const currency = body.currency || countryRow?.currency || 'EUR';
      await setCompanyConfig(tenantDb, {
        name,
        taxId: nif || '',
        address: body.address || '',
        city: body.city || '',
        zipCode: body.zipCode || '',
        country,
        email: body.email || '',
        phone: body.phone || '',
        website: body.website || '',
        currency,
        fiscalYearStart: body.fiscalYearStart || '01-01',
      });
      await LocalizationInstaller.setBaseCurrency(tenantDb, currency);
      // La normativa del país, si hay un plugin instalado que la aporte.
      await LocalizationInstaller.adoptForCountry(tenantId, schemaName, country);
    } catch (err: any) {
      console.warn('[Tenants] No se pudo sembrar datos de empresa en SystemConfig:', err.message);
    }

    // Dar acceso al usuario actual si no es SUPERUSER (membership ADMIN)
    const { userId, role } = req.authPayload;
    if (role !== 'SUPERUSER') {
      try {
        await publicDb.insert(schema.userTenantMemberships).values({
          id: crypto.randomUUID(),
          userId,
          tenantId,
          role: 'ADMIN',
          updatedAt: new Date(),
        });
      } catch (err: any) {
        console.warn('[Tenants] No se pudo crear membership automático:', err.message);
      }
    }

    res.json({ id: tenantId, name });
    logAudit({
      tenantClient: ClientFactory.getClient(schemaName),
      tenantId,
      userId: req.authPayload?.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      action: 'CREATE',
      newValue: { name, nif },
    });
  } catch (error: any) {
    console.error('[Tenants] Error al crear empresa:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
