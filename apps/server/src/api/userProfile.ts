/**
 * Perfil del usuario autenticado. Gestiona:
 *   - PATCH  /api/users/me           → nombre del firmante y cargo
 *   - POST   /api/users/me/signature → sube imagen PNG/JPG (multipart "file")
 *   - GET    /api/users/me/signature → stream de la imagen (requiere sesión)
 *   - DELETE /api/users/me/signature → borra firma
 *   - POST   /api/profile/me/avatar  → sube la foto de perfil (multipart "file")
 *   - DELETE /api/profile/me/avatar  → borra la foto de perfil
 *   - GET    /api/profile/avatar/:userId → sirve la foto (SIN sesión, ver comentario en la ruta)
 *
 * Storage: reusa `StorageResolver` del tenant ACTIVO del usuario — la imagen
 * vive en el storage del tenant en el que la subió. La URL se guarda en
 * `globalUsers.signatureImageUrl`/`avatarImageUrl` (apuntando al endpoint GET
 * correspondiente de este router).
 */
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { and, eq, isNull, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { StorageResolver } from '../core/storage/StorageResolver';
import type { StorageProviderId } from '../core/storage/StorageAdapter';

const router = Router();
const upload = multer({
  dest: '/tmp/openfactu-user-signature/',
  limits: { fileSize: 5 * 1024 * 1024 },
});
const uploadAvatar = multer({
  dest: '/tmp/openfactu-user-avatar/',
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ENTITY_TYPE = 'UserSignature';
const AVATAR_ENTITY_TYPE = 'UserAvatar';

function getTenantSchema(req: any): string | null {
  return req.tenantSchema || req.tenant?.schemaName || null;
}

async function findCurrent(tenantClient: any, userId: string, entityType = ENTITY_TYPE) {
  const rows = await tenantClient
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.entityType, entityType),
        eq(schema.attachments.entityId, userId),
        isNull(schema.attachments.deletedAt),
      ),
    )
    .orderBy(desc(schema.attachments.uploadedAt))
    .limit(1);
  return rows[0] || null;
}

/**
 * PATCH /api/users/me — edita datos del perfil (nombre/cargo de firma).
 */
router.patch('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const publicDb = ClientFactory.getClient('public');

    const payload: any = {};
    if ('signatureName' in req.body) payload.signatureName = req.body.signatureName?.trim() || null;
    if ('signatureRole' in req.body) payload.signatureRole = req.body.signatureRole?.trim() || null;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    payload.updatedAt = new Date();

    const [row] = await publicDb
      .update(schema.globalUsers)
      .set(payload)
      .where(eq(schema.globalUsers.id, userId))
      .returning({
        id: schema.globalUsers.id,
        email: schema.globalUsers.email,
        username: schema.globalUsers.username,
        signatureName: schema.globalUsers.signatureName,
        signatureRole: schema.globalUsers.signatureRole,
        signatureImageUrl: schema.globalUsers.signatureImageUrl,
      });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * GET /api/users/me — devuelve datos de perfil incluyendo firma.
 */
router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const publicDb = ClientFactory.getClient('public');
    const [row] = await publicDb
      .select({
        id: schema.globalUsers.id,
        email: schema.globalUsers.email,
        username: schema.globalUsers.username,
        role: schema.globalUsers.role,
        signatureName: schema.globalUsers.signatureName,
        signatureRole: schema.globalUsers.signatureRole,
        signatureImageUrl: schema.globalUsers.signatureImageUrl,
        avatarImageUrl: schema.globalUsers.avatarImageUrl,
      })
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, userId));
    res.json(row || null);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * POST /api/users/me/signature — sube la firma (reemplaza la anterior).
 */
router.post('/me/signature', upload.single('file'), async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "file")' });
    const mime = req.file.mimetype;
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ error: 'solo se admiten imágenes' });
    }
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    // Elimina la firma previa del mismo usuario en este tenant.
    const prev = await findCurrent(req.tenantClient, userId);
    if (prev) {
      try {
        const prevAdapter = await StorageResolver.forProvider(
          prev.provider as StorageProviderId,
          req.tenantClient,
          tenantSchema,
        );
        await prevAdapter.delete({ tenantSchema, externalId: prev.externalId });
      } catch {
        /* best-effort */
      }
      await req.tenantClient
        .update(schema.attachments)
        .set({ deletedAt: new Date() })
        .where(eq(schema.attachments.id, prev.id));
    }

    const adapter = await StorageResolver.forTenant(req.tenantClient, tenantSchema);
    const content = await fs.promises.readFile(req.file.path);
    const ref = await adapter.upload({
      tenantSchema,
      entityType: ENTITY_TYPE,
      entityId: userId,
      fileName: req.file.originalname,
      mime,
      content,
    });
    fs.promises.unlink(req.file.path).catch(() => {});

    const attId = crypto.randomUUID();
    await req.tenantClient.insert(schema.attachments).values({
      id: attId,
      entityType: ENTITY_TYPE,
      entityId: userId,
      fileName: req.file.originalname,
      mime,
      size: req.file.size,
      provider: adapter.id,
      externalId: ref.externalId,
      uploadedBy: userId,
    });

    // Guardamos la URL en el perfil del usuario (tabla pública).
    const url = `/api/profile/me/signature?v=${Date.now()}`;
    const publicDb = ClientFactory.getClient('public');
    await publicDb
      .update(schema.globalUsers)
      .set({ signatureImageUrl: url, updatedAt: new Date() })
      .where(eq(schema.globalUsers.id, userId));

    res.json({ url, fileName: req.file.originalname, mime, size: req.file.size });
  } catch (e: any) {
    console.error('[UserSignature.upload] error:', e?.stack || e);
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: e?.message || 'Error al subir firma' });
  }
});

/**
 * GET /api/users/me/signature — stream de la firma.
 * También admite `?userId=<id>` para leer la firma de otro usuario (útil
 * para que el backend construya el PDF del creador del documento).
 */
router.get('/me/signature', async (req: any, res) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ error: 'No autenticado' });
    const targetUserId = (req.query.userId as string) || requesterId;
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const row = await findCurrent(req.tenantClient, targetUserId);
    if (!row) return res.status(404).json({ error: 'Sin firma' });

    const adapter = await StorageResolver.forProvider(
      row.provider as StorageProviderId,
      req.tenantClient,
      tenantSchema,
    );
    const dl = await adapter.download({ tenantSchema, externalId: row.externalId });
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    dl.stream.pipe(res);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * DELETE /api/users/me/signature — elimina la firma.
 */
router.delete('/me/signature', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const row = await findCurrent(req.tenantClient, userId);
    if (row) {
      try {
        const adapter = await StorageResolver.forProvider(
          row.provider as StorageProviderId,
          req.tenantClient,
          tenantSchema,
        );
        await adapter.delete({ tenantSchema, externalId: row.externalId });
      } catch {
        /* best-effort */
      }
      await req.tenantClient
        .update(schema.attachments)
        .set({ deletedAt: new Date() })
        .where(eq(schema.attachments.id, row.id));
    }
    const publicDb = ClientFactory.getClient('public');
    await publicDb
      .update(schema.globalUsers)
      .set({ signatureImageUrl: null, updatedAt: new Date() })
      .where(eq(schema.globalUsers.id, userId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * POST /api/profile/me/avatar — sube la foto de perfil (reemplaza la
 * anterior). Requiere sesión — cada usuario solo puede tocar la suya propia.
 */
router.post('/me/avatar', uploadAvatar.single('file'), async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "file")' });
    const mime = req.file.mimetype;
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ error: 'solo se admiten imágenes' });
    }
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const prev = await findCurrent(req.tenantClient, userId, AVATAR_ENTITY_TYPE);
    if (prev) {
      try {
        const prevAdapter = await StorageResolver.forProvider(
          prev.provider as StorageProviderId,
          req.tenantClient,
          tenantSchema,
        );
        await prevAdapter.delete({ tenantSchema, externalId: prev.externalId });
      } catch {
        /* best-effort */
      }
      await req.tenantClient
        .update(schema.attachments)
        .set({ deletedAt: new Date() })
        .where(eq(schema.attachments.id, prev.id));
    }

    const adapter = await StorageResolver.forTenant(req.tenantClient, tenantSchema);
    const content = await fs.promises.readFile(req.file.path);
    const ref = await adapter.upload({
      tenantSchema,
      entityType: AVATAR_ENTITY_TYPE,
      entityId: userId,
      fileName: req.file.originalname,
      mime,
      content,
    });
    fs.promises.unlink(req.file.path).catch(() => {});

    const attId = crypto.randomUUID();
    await req.tenantClient.insert(schema.attachments).values({
      id: attId,
      entityType: AVATAR_ENTITY_TYPE,
      entityId: userId,
      fileName: req.file.originalname,
      mime,
      size: req.file.size,
      provider: adapter.id,
      externalId: ref.externalId,
      uploadedBy: userId,
    });

    // Sin ?v= la miniatura del navegador podría quedar cacheada tras cambiar la foto.
    const url = `/api/profile/avatar/${userId}?tenantId=${req.tenantId}&v=${Date.now()}`;
    const publicDb = ClientFactory.getClient('public');
    await publicDb
      .update(schema.globalUsers)
      .set({ avatarImageUrl: url, updatedAt: new Date() })
      .where(eq(schema.globalUsers.id, userId));

    res.json({ url, fileName: req.file.originalname, mime, size: req.file.size });
  } catch (e: any) {
    console.error('[UserAvatar.upload] error:', e?.stack || e);
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: e?.message || 'Error al subir la foto' });
  }
});

/**
 * DELETE /api/profile/me/avatar — elimina la foto de perfil.
 */
router.delete('/me/avatar', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const tenantSchema = getTenantSchema(req);
    if (!tenantSchema) return res.status(400).json({ error: 'tenant requerido' });

    const row = await findCurrent(req.tenantClient, userId, AVATAR_ENTITY_TYPE);
    if (row) {
      try {
        const adapter = await StorageResolver.forProvider(
          row.provider as StorageProviderId,
          req.tenantClient,
          tenantSchema,
        );
        await adapter.delete({ tenantSchema, externalId: row.externalId });
      } catch {
        /* best-effort */
      }
      await req.tenantClient
        .update(schema.attachments)
        .set({ deletedAt: new Date() })
        .where(eq(schema.attachments.id, row.id));
    }
    const publicDb = ClientFactory.getClient('public');
    await publicDb
      .update(schema.globalUsers)
      .set({ avatarImageUrl: null, updatedAt: new Date() })
      .where(eq(schema.globalUsers.id, userId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * GET /api/profile/avatar/:userId — sirve la foto de perfil. A propósito SIN
 * exigir sesión (mismo criterio que el loader de componentes de plugins /
 * widgets de dashboard): un `<img src>` plano no puede mandar el header
 * Authorization, así que esta ruta acepta el tenant también como query param
 * `?tenantId=`. El id de usuario es un UUID no adivinable y la foto de perfil
 * no es un dato sensible como la firma — por eso aquí sí se relaja el auth
 * que sí exige `/me/signature`. 404 si el usuario no tiene foto.
 */
router.get('/avatar/:userId', async (req: any, res) => {
  try {
    const { userId } = req.params;
    const tenantId = req.tenantId || (req.query.tenantId as string | undefined);
    if (!tenantId) return res.status(400).json({ error: 'tenantId requerido' });

    let tenantClient = req.tenantClient;
    let tenantSchema = getTenantSchema(req);
    if (!tenantSchema) {
      const publicDb = ClientFactory.getClient('public');
      const [t] = await publicDb
        .select({ schemaName: schema.tenants.schemaName })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId));
      if (!t) return res.status(404).json({ error: 'Tenant no encontrado' });
      tenantSchema = t.schemaName;
      tenantClient = await ClientFactory.getTenantClient(tenantId);
    }

    const row = await findCurrent(tenantClient, userId, AVATAR_ENTITY_TYPE);
    if (!row) return res.status(404).json({ error: 'Sin foto de perfil' });

    const adapter = await StorageResolver.forProvider(
      row.provider as StorageProviderId,
      tenantClient,
      tenantSchema,
    );
    const dl = await adapter.download({ tenantSchema, externalId: row.externalId });
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    dl.stream.pipe(res);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
