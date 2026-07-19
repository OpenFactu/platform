import { Router } from 'express';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';
import { requireScope } from './middleware/apiToken';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { validateTaxId } from '@openfactu/common';
import { HookManager } from '../core/plugins/HookManager';
import { validateIban, normalizeIban } from '../utils/ibanValidation';

const router = Router();

/**
 * Valida un NIF contra el regex del país. Si el país no está seed o no tiene
 * countryCode, no valida (permisivo). Devuelve null si es válido o string con error.
 */
async function checkTaxId(
  nif: string | null | undefined,
  countryCode: string | null | undefined,
): Promise<string | null> {
  if (!nif || !countryCode) return null;
  try {
    const publicDb = ClientFactory.getClient('public');
    const [country] = await publicDb
      .select()
      .from(schema.countries)
      .where(eq(schema.countries.code, countryCode.toUpperCase()));
    if (!country) return null;
    if (!validateTaxId(nif, country as any)) {
      return `El ${country.taxIdLabel || 'NIF'} no cumple el formato de ${country.name}. Ejemplo: ${country.taxIdExample}`;
    }
  } catch {
    /* ignorar errores de lookup */
  }
  return null;
}

/**
 * GET /api/partners
 */
router.get('/', requireScope('read:maestros'), async (req: any, res) => {
  try {
    const addresses = await req.tenantClient.select().from(schema.partnerAddresses);
    const partners = await req.tenantClient
      .select()
      .from(schema.businessPartners)
      .orderBy(asc(schema.businessPartners.name));

    const rows = partners.map((p: any) => ({
      ...p,
      addresses: addresses.filter((a: any) => a.partnerId === p.id),
    }));

    // Permitir a plugins inyectar/mutar filas
    const hookCtx = {
      tenantId: req.tenantId,
      entity: 'partners',
      filters: req.query || {},
      rows,
      db: req.tenantClient,
    };
    await HookManager.trigger('partners.list.afterFetch', hookCtx);

    res.json(hookCtx.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/partners
 */
router.post('/', requireScope('write:maestros'), async (req: any, res) => {
  try {
    const { groupId, code, addresses, ...restBody } = req.body;

    // Validación de NIF según país
    const taxErr = await checkTaxId(restBody.nif, restBody.countryCode);
    if (taxErr) return res.status(400).json({ error: taxErr });

    // Validación de IBAN si se informa
    if (restBody.iban) {
      const ibanCheck = validateIban(restBody.iban);
      if (!ibanCheck.ok)
        return res.status(400).json({ error: `IBAN inválido: ${ibanCheck.reason}` });
      restBody.iban = normalizeIban(restBody.iban);
    }

    let finalCode = code;

    if (groupId) {
      const { like } = await import('drizzle-orm');
      const [group] = await req.tenantClient
        .select()
        .from(schema.partnerGroups)
        .where(eq(schema.partnerGroups.id, groupId));
      if (group && group.codePrefix) {
        const prefix = group.codePrefix;
        const existingPartners = await req.tenantClient
          .select({ code: schema.businessPartners.code })
          .from(schema.businessPartners)
          .where(like(schema.businessPartners.code, `${prefix}-%`));
        let maxSeq = 0;
        for (const p of existingPartners) {
          const parts = p.code.split('-');
          if (parts.length > 1) {
            const num = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        }
        finalCode = `${prefix}-${String(maxSeq + 1).padStart(5, '0')}`;
      }
    }

    const id = crypto.randomUUID();
    const sanitizedBody = Object.keys(restBody).reduce((acc: any, key) => {
      acc[key] = restBody[key] === '' ? null : restBody[key];
      return acc;
    }, {});

    const [partner] = await req.tenantClient
      .insert(schema.businessPartners)
      .values({ ...sanitizedBody, code: finalCode, groupId: groupId === '' ? null : groupId, id })
      .returning();

    if (addresses && addresses.length > 0) {
      const inserts = addresses.map((a: any) => ({ ...a, id: crypto.randomUUID(), partnerId: id }));
      await req.tenantClient.insert(schema.partnerAddresses).values(inserts);
      partner.addresses = inserts;
    } else {
      partner.addresses = [];
    }

    res.json(partner);

    // Auditoría
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.headers['x-tenant-id'] || '',
      userId: req.user?.id,
      entityType: 'BusinessPartner',
      entityId: id,
      action: 'CREATE',
      newValue: partner,
    });
  } catch (error: any) {
    // Drizzle envuelve el error de pg en `Failed query: ...` ocultando la
    // causa real. Extraemos `error.cause.message` cuando existe para devolver
    // un mensaje útil ("duplicate key", "null violates not-null", etc.).
    const detail =
      (error?.cause?.detail as string | undefined) ||
      (error?.cause?.message as string | undefined) ||
      error?.message ||
      'Error desconocido';
    console.error('[Partners.create] error:', detail, '\nfull:', error?.stack || error);
    res.status(500).json({ error: detail });
  }
});

/**
 * PATCH /api/partners/:id
 */
router.patch('/:id', requireScope('write:maestros'), async (req: any, res) => {
  const { id } = req.params;
  try {
    // Capturar estado anterior
    const [oldPartner] = await req.tenantClient
      .select()
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, id));

    const { addresses, groupId, ...restBody } = req.body;

    // Validación de NIF según país (si cambian ambos o si se actualiza el nif)
    const effectiveCountry = restBody.countryCode || oldPartner?.countryCode;
    const effectiveNif = restBody.nif !== undefined ? restBody.nif : oldPartner?.nif;
    const taxErr = await checkTaxId(effectiveNif, effectiveCountry);
    if (taxErr) return res.status(400).json({ error: taxErr });

    // Validación de IBAN si se informa
    if (restBody.iban) {
      const ibanCheck = validateIban(restBody.iban);
      if (!ibanCheck.ok)
        return res.status(400).json({ error: `IBAN inválido: ${ibanCheck.reason}` });
      restBody.iban = normalizeIban(restBody.iban);
    }

    const sanitizedBody = Object.keys(restBody).reduce((acc: any, key) => {
      acc[key] = restBody[key] === '' ? null : restBody[key];
      return acc;
    }, {});

    if (groupId !== undefined) sanitizedBody.groupId = groupId === '' ? null : groupId;

    const [partner] = await req.tenantClient
      .update(schema.businessPartners)
      .set(sanitizedBody)
      .where(eq(schema.businessPartners.id, id))
      .returning();

    if (addresses) {
      await req.tenantClient
        .delete(schema.partnerAddresses)
        .where(eq(schema.partnerAddresses.partnerId, id));
      if (addresses.length > 0) {
        const inserts = addresses.map((a: any) => ({
          ...a,
          id: a.id || crypto.randomUUID(),
          partnerId: id,
        }));
        await req.tenantClient.insert(schema.partnerAddresses).values(inserts);
        partner.addresses = inserts;
      } else {
        partner.addresses = [];
      }
    }

    res.json(partner);

    // Auditoría
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.headers['x-tenant-id'] || '',
      userId: req.user?.id,
      entityType: 'BusinessPartner',
      entityId: id,
      action: 'UPDATE',
      oldValue: oldPartner,
      newValue: partner,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/partners/:id
 */
router.delete('/:id', requireScope('write:maestros'), async (req: any, res) => {
  const { id } = req.params;
  try {
    const [oldPartner] = await req.tenantClient
      .select()
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, id));

    await req.tenantClient
      .delete(schema.businessPartners)
      .where(eq(schema.businessPartners.id, id));
    res.json({ success: true });

    if (oldPartner) {
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.headers['x-tenant-id'] || '',
        userId: req.user?.id,
        entityType: 'BusinessPartner',
        entityId: id,
        action: 'DELETE',
        oldValue: oldPartner,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
