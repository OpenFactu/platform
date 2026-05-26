/**
 * CRUD de transportistas (Carrier) y cuentas (CarrierAccount).
 *
 *   GET   /adapters                   — lista de adapters disponibles en el core
 *   GET   /                           — todos los carriers del tenant
 *   POST  /                           — crea un carrier (adapterId opcional)
 *   PATCH /:id
 *   DELETE /:id
 *
 *   GET   /:carrierId/accounts        — cuentas de un carrier
 *   POST  /:carrierId/accounts        — crea una cuenta con credenciales JSON
 *   PATCH /accounts/:id
 *   DELETE /accounts/:id
 *   POST  /accounts/:id/test          — invoca adapter.createShipment con payload dummy
 */

import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../db/schema';
import { CarrierRegistry } from '../core/carriers/CarrierRegistry';

const router = Router();

function nowIso() {
  return new Date();
}

// ── Adapters disponibles (global) ────────────────────────────────────────
router.get('/adapters', (_req, res) => {
  res.json(CarrierRegistry.list());
});

// ── Carriers (por tenant) ────────────────────────────────────────────────
router.get('/', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.carriers)
    .orderBy(desc(schema.carriers.createdAt));
  res.json(rows);
});

router.post('/', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'Nombre obligatorio' });
    const id = crypto.randomUUID();
    await req.tenantClient.insert(schema.carriers).values({
      id,
      name: body.name,
      code: body.code || null,
      logoUrl: body.logoUrl || null,
      isActive: body.isActive !== false,
      adapterId: body.adapterId || null,
      notes: body.notes || null,
    });
    res.json({ id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of ['name', 'code', 'logoUrl', 'isActive', 'adapterId', 'notes']) {
      if (k in body) patch[k] = body[k];
    }
    patch.updatedAt = nowIso();
    await req.tenantClient
      .update(schema.carriers)
      .set(patch)
      .where(eq(schema.carriers.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient.delete(schema.carriers).where(eq(schema.carriers.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cuentas (CarrierAccount) ─────────────────────────────────────────────
router.get('/:carrierId/accounts', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.carrierAccounts)
    .where(eq(schema.carrierAccounts.carrierId, req.params.carrierId))
    .orderBy(desc(schema.carrierAccounts.createdAt));
  res.json(rows);
});

router.post('/:carrierId/accounts', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'Nombre obligatorio' });
    const id = crypto.randomUUID();
    await req.tenantClient.insert(schema.carrierAccounts).values({
      id,
      carrierId: req.params.carrierId,
      name: body.name,
      sandbox: !!body.sandbox,
      isDefault: !!body.isDefault,
      credentials: body.credentials || {},
    });
    res.json({ id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/accounts/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of ['name', 'sandbox', 'isDefault', 'credentials']) {
      if (k in body) patch[k] = body[k];
    }
    patch.updatedAt = nowIso();
    await req.tenantClient
      .update(schema.carrierAccounts)
      .set(patch)
      .where(eq(schema.carrierAccounts.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/accounts/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.carrierAccounts)
      .where(eq(schema.carrierAccounts.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Prueba la cuenta llamando a `adapter.createShipment` con un payload dummy.
 * No guarda nada — solo verifica que las credenciales son válidas.
 */
router.post('/accounts/:id/test', async (req: any, res) => {
  try {
    const [acc] = await req.tenantClient
      .select()
      .from(schema.carrierAccounts)
      .where(eq(schema.carrierAccounts.id, req.params.id));
    if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const [c] = await req.tenantClient
      .select()
      .from(schema.carriers)
      .where(eq(schema.carriers.id, acc.carrierId));
    if (!c) return res.status(404).json({ error: 'Carrier no encontrado' });

    const adapter = CarrierRegistry.get(c.adapterId);
    if (!adapter) {
      return res.json({
        ok: false,
        manual: true,
        message: 'Este carrier es manual — no hay adapter para probar.',
      });
    }

    const result = await adapter.createShipment(acc.credentials as any, {
      shipmentId: 'TEST',
      destinationAddress: 'Dirección de prueba, 28013 Madrid',
      destinationZip: '28013',
      destinationCity: 'Madrid',
      destinationCountryCode: 'ES',
      weightKg: 1,
    });
    res.json({ ok: true, trackingNumber: result.trackingNumber });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

export default router;
