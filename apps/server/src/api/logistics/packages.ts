/** Paquetes: las cajas físicas de un envío y lo que llevan dentro. */
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { nextLogisticsCode } from '../../core/logistics/logisticsCodes';
import { renderPackageLabel } from '../../core/logistics/logisticsPdf';
import { packagesWithShipment } from '../../core/logistics/shipmentViews';
import { getCompanyHeader } from '../../core/reports/ReportRenderer';
import { getRequestLocale } from '../../i18n';
import { action, nowIso, sendPdf } from './shared';

const router = Router();

router.get('/packages', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.packages)
    .orderBy(desc(schema.packages.createdAt))
    .limit(500);
  res.json(await packagesWithShipment(req.tenantClient, rows));
});

router.post('/packages', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  const code = body.code || (await nextLogisticsCode(req.tenantClient, 'PK'));
  await req.tenantClient.insert(schema.packages).values({
    id,
    code,
    deliveryNoteId: body.deliveryNoteId || null,
    shipmentId: body.shipmentId || null,
    boxItemId: body.boxItemId || null,
    stagingAreaId: body.stagingAreaId || null,
    status: body.status || 'open',
    weightKg: body.weightKg ?? null,
    notes: body.notes || null,
  });
  // Crear líneas si vienen
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) {
      await req.tenantClient.insert(schema.packageLines).values({
        id: crypto.randomUUID(),
        packageId: id,
        itemId: l.itemId,
        quantity: Number(l.quantity) || 0,
        sourceLineId: l.sourceLineId || null,
      });
    }
  }
  res.json({ id, code });
});

router.patch('/packages/:id', async (req: any, res) => {
  const body = req.body || {};
  const patch: any = {};
  for (const k of ['shipmentId', 'boxItemId', 'stagingAreaId', 'status', 'weightKg', 'notes']) {
    if (k in body) patch[k] = body[k];
  }
  if (patch.status === 'sealed') patch.sealedAt = nowIso();
  await req.tenantClient
    .update(schema.packages)
    .set(patch)
    .where(eq(schema.packages.id, req.params.id));
  res.json({ ok: true });
});

router.delete('/packages/:id', async (req: any, res) => {
  await req.tenantClient.delete(schema.packages).where(eq(schema.packages.id, req.params.id));
  res.json({ ok: true });
});

router.get('/packages/:id/lines', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.packageLines)
    .where(eq(schema.packageLines.packageId, req.params.id));
  res.json(rows);
});

router.post('/packages/:id/lines', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  await req.tenantClient.insert(schema.packageLines).values({
    id,
    packageId: req.params.id,
    itemId: body.itemId,
    quantity: Number(body.quantity) || 0,
    sourceLineId: body.sourceLineId || null,
  });
  res.json({ id });
});

router.delete('/packages/:pid/lines/:lid', async (req: any, res) => {
  await req.tenantClient
    .delete(schema.packageLines)
    .where(
      and(
        eq(schema.packageLines.id, req.params.lid),
        eq(schema.packageLines.packageId, req.params.pid),
      ),
    );
  res.json({ ok: true });
});


router.get(
  '/packages/:id/label.pdf',
  action(async (req, res) => {
    const company = await getCompanyHeader(req.tenantClient, req.tenantId);
    const pdf = await renderPackageLabel(req.tenantClient, req.params.id, company, getRequestLocale(req));
    sendPdf(res, pdf, 'etiqueta.pdf');
  }),
);

export default router;
