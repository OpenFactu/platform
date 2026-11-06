import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { StorageResolver } from '../core/storage/StorageResolver';
import type { StorageProviderId } from '../core/storage/StorageAdapter';
import { messagingTicketSecret } from './messaging';

/**
 * Lo que el servicio de mensajería (`apps/messaging`) pide al ERP por su
 * cuenta, sin un usuario detrás: guardar los ficheros que llegan de un canal
 * (una foto que manda un cliente por Telegram) y leer los que el equipo envía
 * a un canal.
 *
 * No hay sesión: va con un token de servicio de un minuto firmado con
 * MESSAGING_TICKET_SECRET (el mismo de los tickets, en sentido contrario:
 * `iss` mensajería, `aud` ERP) y siempre para una empresa (`tid`). La empresa
 * se resuelve por la tabla Tenant, nunca por un nombre de esquema que venga de
 * fuera.
 */
const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'keirost-messaging'),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/** Solo los ficheros de la mensajería: este canal no abre el resto de adjuntos. */
const ENTITY_TYPE = 'ChatConversation';

router.use(async (req: any, res, next) => {
  const secret = messagingTicketSecret();
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: 'keirost-erp',
      issuer: 'keirost-messaging',
    }) as { tid?: string };
    if (!claims.tid) return res.status(401).json({ error: 'No autorizado' });

    const publicDb = ClientFactory.getClient('public');
    const [tenant] = await publicDb
      .select({ id: schema.tenants.id, schemaName: schema.tenants.schemaName })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, claims.tid));
    if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' });

    req.serviceTenant = tenant;
    req.serviceDb = ClientFactory.getClient(tenant.schemaName);
    next();
  } catch {
    res.status(401).json({ error: 'No autorizado' });
  }
});

/** POST /api/internal/messaging/attachments?conversationId=… (multipart "file") */
router.post('/attachments', upload.single('file'), async (req: any, res) => {
  const conversationId = String(req.query.conversationId || '');
  try {
    if (!conversationId) return res.status(400).json({ error: 'Falta conversationId' });
    if (!req.file) return res.status(400).json({ error: 'Falta el fichero (campo "file")' });

    const tenantSchema: string = req.serviceTenant.schemaName;
    const adapter = await StorageResolver.forTenant(req.serviceDb, tenantSchema);
    const content = await fs.promises.readFile(req.file.path);
    const ref = await adapter.upload({
      tenantSchema,
      entityType: ENTITY_TYPE,
      entityId: conversationId,
      fileName: req.file.originalname,
      mime: req.file.mimetype,
      content,
    });

    const [row] = await req.serviceDb
      .insert(schema.attachments)
      .values({
        id: crypto.randomUUID(),
        entityType: ENTITY_TYPE,
        entityId: conversationId,
        fileName: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
        provider: adapter.id,
        externalId: ref.externalId,
        uploadedBy: null,
      })
      .returning();
    res.json({ id: row.id, fileName: row.fileName, mime: row.mime, size: row.size });
  } catch (e: any) {
    console.error('[Mensajes] No se pudo guardar un fichero entrante:', e?.message || e);
    res.status(500).json({ error: 'No se pudo guardar el fichero' });
  } finally {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
  }
});

/** GET /api/internal/messaging/attachments/:id — el fichero, para enviarlo a un canal. */
router.get('/attachments/:id', async (req: any, res) => {
  try {
    const tenantSchema: string = req.serviceTenant.schemaName;
    const [row] = await req.serviceDb
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.id, req.params.id),
          eq(schema.attachments.entityType, ENTITY_TYPE),
          isNull(schema.attachments.deletedAt),
        ),
      );
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    const adapter = await StorageResolver.forProvider(
      row.provider as StorageProviderId,
      req.serviceDb,
      tenantSchema,
    );
    const dl = await adapter.download({ tenantSchema, externalId: row.externalId });
    res.setHeader('Content-Type', row.mime);
    if (row.size) res.setHeader('Content-Length', String(row.size));
    dl.stream.pipe(res);
  } catch (e: any) {
    console.error('[Mensajes] No se pudo leer un fichero:', e?.message || e);
    res.status(500).json({ error: 'No se pudo leer el fichero' });
  }
});

export default router;
