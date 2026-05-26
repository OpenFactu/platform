import { Router } from 'express';
import { eq, and, ilike, asc, sql } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { seedGeo } from '../core/geo/seedGeo';

const router = Router();

// Las tablas geográficas viven en el schema `public`. Usamos el cliente público
// directamente para todas las lecturas, independientemente del tenant activo.
const publicDb = () => ClientFactory.getClient('public');

/**
 * POST /api/geo/seed — fuerza la ejecución del seed geográfico (países,
 * regiones, subregiones, localidades). Útil cuando la primera vez falló
 * porque faltaba `geo.json` en `dist/seed-data/` o si se actualiza la fuente
 * sin reiniciar el server. Idempotente: hace upsert de países y salta
 * regiones si ya hay datos.
 */
router.post('/seed', async (_req, res) => {
  try {
    await seedGeo(publicDb());
    const result: any = await publicDb().execute(
      sql.raw(`SELECT COUNT(*)::int AS count FROM "Country"`),
    );
    const count = result?.rows?.[0]?.count ?? 0;
    res.json({ ok: true, countries: count });
  } catch (e: any) {
    console.error('[Geo] seed manual falló:', e?.stack || e?.message || e);
    res.status(500).json({ error: e?.message || 'Error al sembrar geografía' });
  }
});

router.get('/countries', async (_req, res) => {
  try {
    const rows = await publicDb()
      .select()
      .from(schema.countries)
      .orderBy(asc(schema.countries.name));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/countries/:code', async (req, res) => {
  try {
    const [row] = await publicDb()
      .select()
      .from(schema.countries)
      .where(eq(schema.countries.code, req.params.code.toUpperCase()));
    if (!row) return res.status(404).json({ error: 'País no encontrado' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/countries/:code/regions', async (req, res) => {
  try {
    const rows = await publicDb()
      .select()
      .from(schema.regions)
      .where(eq(schema.regions.countryCode, req.params.code.toUpperCase()))
      .orderBy(asc(schema.regions.name));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/countries/:code/subregions', async (req, res) => {
  try {
    const rows = await publicDb()
      .select()
      .from(schema.subRegions)
      .where(eq(schema.subRegions.countryCode, req.params.code.toUpperCase()))
      .orderBy(asc(schema.subRegions.name));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/regions/:id/subregions', async (req, res) => {
  try {
    const rows = await publicDb()
      .select()
      .from(schema.subRegions)
      .where(eq(schema.subRegions.regionId, req.params.id))
      .orderBy(asc(schema.subRegions.name));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/subregions/:id/localities', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const whereClause = q
      ? and(
          eq(schema.localities.subRegionId, req.params.id),
          ilike(schema.localities.name, `%${q}%`),
        )
      : eq(schema.localities.subRegionId, req.params.id);

    const rows = await publicDb()
      .select()
      .from(schema.localities)
      .where(whereClause)
      .orderBy(asc(schema.localities.name))
      .limit(limit);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/localities/:id', async (req, res) => {
  try {
    const [row] = await publicDb()
      .select()
      .from(schema.localities)
      .where(eq(schema.localities.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Municipio no encontrado' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
