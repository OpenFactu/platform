/**
 * Flota y ubicaciones: vehículos y plataformas ajenas (cross-docks, naves
 * alquiladas, hubs). Ninguno se borra de verdad: las rutas y los acopios pasados
 * siguen apuntando a ellos.
 */
import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { geocodeAddress } from '../../core/logistics/geocode';
import { nextLogisticsCode } from '../../core/logistics/logisticsCodes';
import { nowIso } from './shared';

const router = Router();

router.get('/vehicles', async (req: any, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const rows = await req.tenantClient
    .select()
    .from(schema.vehicles)
    .orderBy(asc(schema.vehicles.code));
  res.json(includeArchived ? rows : rows.filter((r: any) => !r.archivedAt));
});

router.post('/vehicles', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.plate) return res.status(400).json({ error: 'La matrícula es obligatoria.' });
    const id = crypto.randomUUID();
    const code = body.code || (await nextLogisticsCode(req.tenantClient, 'VH'));
    await req.tenantClient.insert(schema.vehicles).values({
      id,
      code,
      plate: String(body.plate).trim().toUpperCase(),
      brand: body.brand || null,
      model: body.model || null,
      capacityKg: body.capacityKg ?? null,
      capacityM3: body.capacityM3 ?? null,
      status: body.status || 'active',
      defaultDriverEmployeeId: body.defaultDriverEmployeeId || null,
      notes: body.notes || null,
    });
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/vehicles/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'plate',
      'brand',
      'model',
      'capacityKg',
      'capacityM3',
      'status',
      'defaultDriverEmployeeId',
      'notes',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    if (patch.plate) patch.plate = String(patch.plate).trim().toUpperCase();
    await req.tenantClient
      .update(schema.vehicles)
      .set(patch)
      .where(eq(schema.vehicles.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Soft-delete: preserva histórico de rutas pasadas. */
router.delete('/vehicles/:id', async (req: any, res) => {
  await req.tenantClient
    .update(schema.vehicles)
    .set({ archivedAt: nowIso(), status: 'retired' })
    .where(eq(schema.vehicles.id, req.params.id));
  res.json({ ok: true });
});

/** Restaurar un vehículo archivado. */
router.post('/vehicles/:id/restore', async (req: any, res) => {
  await req.tenantClient
    .update(schema.vehicles)
    .set({ archivedAt: null, status: 'active' })
    .where(eq(schema.vehicles.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────

router.get('/platforms', async (req: any, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const rows = await req.tenantClient
      .select()
      .from(schema.externalPlatforms)
      .orderBy(asc(schema.externalPlatforms.code));
    res.json(includeArchived ? rows : rows.filter((r: any) => !r.archivedAt));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/platforms', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const id = crypto.randomUUID();
    const code = body.code || (await nextLogisticsCode(req.tenantClient, 'PL'));

    // Geocodificar si hay dirección y no vienen coords.
    let lat: number | null = body.lat ?? null;
    let lng: number | null = body.lng ?? null;
    if (lat == null && lng == null && body.address) {
      const coords = await geocodeAddress(body.address).catch(() => null);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    await req.tenantClient.insert(schema.externalPlatforms).values({
      id,
      code,
      name: body.name,
      address: body.address || null,
      lat,
      lng,
      openingHours: body.openingHours || null,
      contactName: body.contactName || null,
      contactPhone: body.contactPhone || null,
      contactEmail: body.contactEmail || null,
      notes: body.notes || null,
    });
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/platforms/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'name',
      'address',
      'lat',
      'lng',
      'openingHours',
      'contactName',
      'contactPhone',
      'contactEmail',
      'notes',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    // Re-geocodifica si cambió solo la dirección.
    if ('address' in body && !('lat' in body) && !('lng' in body) && body.address) {
      const coords = await geocodeAddress(body.address).catch(() => null);
      if (coords) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
      }
    }
    await req.tenantClient
      .update(schema.externalPlatforms)
      .set(patch)
      .where(eq(schema.externalPlatforms.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Soft-delete — conservamos histórico de acopios pasados. */
router.delete('/platforms/:id', async (req: any, res) => {
  await req.tenantClient
    .update(schema.externalPlatforms)
    .set({ archivedAt: nowIso() })
    .where(eq(schema.externalPlatforms.id, req.params.id));
  res.json({ ok: true });
});

router.post('/platforms/:id/restore', async (req: any, res) => {
  await req.tenantClient
    .update(schema.externalPlatforms)
    .set({ archivedAt: null })
    .where(eq(schema.externalPlatforms.id, req.params.id));
  res.json({ ok: true });
});

export default router;
