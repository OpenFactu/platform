/**
 * API genérica de adjuntos. Cualquier entidad del ERP puede tener archivos
 * adjuntos (facturas escaneadas, fotos de productos, contratos firmados...).
 *
 * Endpoints:
 *   GET    /api/attachments?entityType=...&entityId=...
 *   POST   /api/attachments?entityType=...&entityId=...   (multipart "file")
 *   GET    /api/attachments/:id/download
 *   DELETE /api/attachments/:id                            (soft delete)
 *
 * El backend físico se elige con `StorageResolver.forTenant()` — local hoy,
 * Drive/OneDrive cuando se implementen.
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { eq, and, desc, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import { StorageResolver } from '../core/storage/StorageResolver';
import type { StorageProviderId } from '../core/storage/StorageAdapter';
import { logAudit } from '../utils/audit';

const upload = multer({
  dest: '/tmp/openfactu-attachments/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const router = Router();

function getTenantSchema(req: any): string | null {
  return req.tenantSchema || req.tenant?.schemaName || null;
}

/**
 * GET /api/attachments/recent?limit=20 — últimos adjuntos subidos en el
 * tenant, de cualquier entidad. Alimenta el panel "Tareas en segundo plano"
 * (actividad de subidas), no requiere entityType/entityId.
 */
router.get('/recent', async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const rows = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(isNull(schema.attachments.deletedAt))
      .orderBy(desc(schema.attachments.uploadedAt))
      .limit(limit);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar adjuntos recientes' });
  }
});

/**
 * GET /api/attachments?entityType=SalesInvoice&entityId=:id
 */
router.get('/', async (req: any, res) => {
  try {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType y entityId son obligatorios' });
    }
    const rows = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.entityType, entityType),
          eq(schema.attachments.entityId, entityId),
          isNull(schema.attachments.deletedAt),
        ),
      )
      .orderBy(desc(schema.attachments.uploadedAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar adjuntos' });
  }
});

/**
 * POST /api/attachments?entityType=...&entityId=...
 * multipart con campo "file"
 */
router.post('/', upload.single('file'), async (req: any, res) => {
  try {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType y entityId son obligatorios' });
    }
    if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "file")' });

    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const adapter = await StorageResolver.forTenant(req.tenantClient, tenantSchema);
    const content = await fs.promises.readFile(req.file.path);
    const ref = await adapter.upload({
      tenantSchema,
      entityType,
      entityId,
      fileName: req.file.originalname,
      mime: req.file.mimetype,
      content,
    });
    // Limpiamos el temp de multer.
    fs.promises.unlink(req.file.path).catch(() => {});

    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.attachments)
      .values({
        id,
        entityType,
        entityId,
        fileName: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
        provider: adapter.id,
        externalId: ref.externalId,
        uploadedBy: req.user?.id ?? null,
      })
      .returning();

    res.json(row);

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Attachment',
      entityId: id,
      action: 'CREATE',
      newValue: { entityType, entityId, fileName: req.file.originalname, provider: adapter.id },
    });
  } catch (e: any) {
    console.error('[Attachments.upload] error:', e?.stack || e);
    // Best-effort cleanup del temp si quedó.
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: e?.message || 'Error al subir adjunto' });
  }
});

/**
 * GET /api/attachments/:id/download
 */
router.get('/:id/download', async (req: any, res) => {
  try {
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const [row] = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(and(eq(schema.attachments.id, req.params.id), isNull(schema.attachments.deletedAt)));
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    const adapter = await StorageResolver.forProvider(
      row.provider as StorageProviderId,
      req.tenantClient,
      tenantSchema,
    );
    const dl = await adapter.download({ tenantSchema, externalId: row.externalId });
    res.setHeader('Content-Type', row.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(row.fileName)}"`,
    );
    if (row.size) res.setHeader('Content-Length', String(row.size));
    dl.stream.pipe(res);
  } catch (e: any) {
    console.error('[Attachments.download] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al descargar' });
  }
});

/**
 * DELETE /api/attachments/:id — soft delete + borrado físico.
 */
router.delete('/:id', async (req: any, res) => {
  try {
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const [row] = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    if (!row.deletedAt) {
      try {
        const adapter = await StorageResolver.forProvider(
          row.provider as StorageProviderId,
          req.tenantClient,
          tenantSchema,
        );
        await adapter.delete({ tenantSchema, externalId: row.externalId });
      } catch (e: any) {
        // Si falla el borrado físico, marcamos soft delete igualmente — un job
        // periódico (futuro) podrá reintentar la limpieza.
        console.warn(`[Attachments.delete] adapter delete falló: ${e?.message}`);
      }
      await req.tenantClient
        .update(schema.attachments)
        .set({ deletedAt: new Date() })
        .where(eq(schema.attachments.id, req.params.id));
    }

    res.json({ ok: true });

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Attachment',
      entityId: req.params.id,
      action: 'DELETE',
    });
  } catch (e: any) {
    console.error('[Attachments.delete] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al borrar' });
  }
});

export default router;
