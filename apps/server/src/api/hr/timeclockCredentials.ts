import { Router } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { issueCredential, employeeQr } from '../../core/hr/timeclockCredentials';
import { fail } from '../../core/hr/timeclockTypes';
import { sendTimeclockError } from '../../core/hr/timeclockTerminals';

const router = Router();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/', async (req: any, res) => {
  try {
    if (typeof req.query.employeeId !== 'string')
      fail(400, 'INVALID_INPUT', 'Empleado obligatorio.');
    res.json(
      await req.tenantClient
        .select({
          id: schema.timeclockCredentials.id,
          kind: schema.timeclockCredentials.kind,
          label: schema.timeclockCredentials.label,
          createdAt: schema.timeclockCredentials.createdAt,
          revokedAt: schema.timeclockCredentials.revokedAt,
        })
        .from(schema.timeclockCredentials)
        .where(eq(schema.timeclockCredentials.employeeId, req.query.employeeId)),
    );
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.post('/', async (req: any, res) => {
  try {
    if (
      typeof req.body.employeeId !== 'string' ||
      typeof req.body.label !== 'string' ||
      req.body.label.length > 100
    )
      fail(400, 'INVALID_INPUT', 'Empleado y etiqueta válidos requeridos.');
    res.json(
      await issueCredential(
        req.tenantClient,
        req.body.employeeId,
        req.body.kind,
        req.body.uid,
        req.body.label,
      ),
    );
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.get('/:employeeId/qr', async (req: any, res) => {
  try {
    res.json(await employeeQr(req.tenantClient, req.params.employeeId));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.post('/:id/revoke', async (req: any, res) => {
  try {
    const row = await req.tenantClient.transaction(async (tx: any) => {
      const [row] = await tx
        .update(schema.timeclockCredentials)
        .set({ revokedAt: new Date() })
        .where(eq(schema.timeclockCredentials.id, req.params.id))
        .returning({ id: schema.timeclockCredentials.id });
      if (row)
        await tx
          .update(schema.timeclockIdentifications)
          .set({ cancelledAt: new Date() })
          .where(eq(schema.timeclockIdentifications.credentialId, row.id));
      return row;
    });
    if (!row) fail(404, 'NOT_FOUND', 'Credencial no encontrada.');
    res.json({ success: true });
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
export default router;
