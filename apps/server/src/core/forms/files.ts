/**
 * Archivos de los formularios sobre el almacenamiento de adjuntos:
 *   - FormAsset: imágenes del propio formulario (cabecera, bloques), públicas.
 *   - FormUploadPending → FormResponse: lo que sube quien responde; pendiente
 *     hasta que envía (ver responses.ts → bindFiles) y se borra si no envía.
 */
import fs from 'fs';
import crypto from 'crypto';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { StorageResolver } from '../storage/StorageResolver';
import type { StorageProviderId } from '../storage/StorageAdapter';

export interface StoredFile {
  id: string;
  fileName: string;
  mime: string;
  size: number;
}

/** Guarda el temporal de multer como adjunto de (entityType, entityId) y lo borra. */
export async function storeUpload(
  db: any,
  tenantSchema: string,
  file: { path: string; originalname: string; mimetype: string; size: number },
  entityType: string,
  entityId: string,
  uploadedBy: string | null,
): Promise<StoredFile> {
  try {
    const adapter = await StorageResolver.forTenant(db, tenantSchema);
    const content = await fs.promises.readFile(file.path);
    const ref = await adapter.upload({
      tenantSchema,
      entityType,
      entityId,
      fileName: file.originalname,
      mime: file.mimetype,
      content,
    });
    const id = crypto.randomUUID();
    await db.insert(schema.attachments).values({
      id,
      entityType,
      entityId,
      fileName: file.originalname.slice(0, 200),
      mime: file.mimetype,
      size: file.size,
      provider: adapter.id,
      externalId: ref.externalId,
      uploadedBy,
    });
    return { id, fileName: file.originalname, mime: file.mimetype, size: file.size };
  } finally {
    fs.promises.unlink(file.path).catch(() => {});
  }
}

/** Envía un adjunto si pertenece a (entityType, entityId); 404 si no. */
export async function streamFile(
  db: any,
  tenantSchema: string,
  res: any,
  id: string,
  entityType: string,
  entityId: string,
  disposition: 'inline' | 'attachment',
): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.id, id),
        eq(schema.attachments.entityType, entityType),
        eq(schema.attachments.entityId, entityId),
        isNull(schema.attachments.deletedAt),
      ),
    );
  if (!row) {
    res.status(404).json({ error: 'No encontrado' });
    return;
  }
  const adapter = await StorageResolver.forProvider(
    row.provider as StorageProviderId,
    db,
    tenantSchema,
  );
  const dl = await adapter.download({ tenantSchema, externalId: row.externalId });
  res.setHeader('Content-Type', row.mime);
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(row.fileName)}"`,
  );
  if (disposition === 'inline') res.setHeader('Cache-Control', 'public, max-age=3600');
  dl.stream.pipe(res);
}

/** Metadatos de los adjuntos de una respuesta (para la vista individual). */
export async function responseFiles(db: any, responseId: string): Promise<StoredFile[]> {
  return db
    .select({
      id: schema.attachments.id,
      fileName: schema.attachments.fileName,
      mime: schema.attachments.mime,
      size: schema.attachments.size,
    })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.entityType, 'FormResponse'),
        eq(schema.attachments.entityId, responseId),
        isNull(schema.attachments.deletedAt),
      ),
    );
}

/** Borra las subidas de hace más de 24 h que nunca se enviaron. */
/** Borra adjuntos (fichero y registro); si el almacenamiento falla, el registro se borra igual. */
async function removeAttachments(db: any, tenantSchema: string, rows: any[]) {
  for (const row of rows) {
    try {
      const adapter = await StorageResolver.forProvider(
        row.provider as StorageProviderId,
        db,
        tenantSchema,
      );
      await adapter.delete({ tenantSchema, externalId: row.externalId });
    } catch {
      /* el registro se borra igual */
    }
    await db.delete(schema.attachments).where(eq(schema.attachments.id, row.id));
  }
}

/**
 * Archivos de un formulario que se borra (o de las respuestas que se borran):
 * imágenes del formulario, subidas pendientes y archivos de las respuestas.
 */
export async function purgeFormFiles(
  db: any,
  tenantSchema: string,
  formId: string | null,
  responseIds: string[],
): Promise<void> {
  const A = schema.attachments;
  const conds = [];
  if (formId)
    conds.push(
      and(inArray(A.entityType, ['FormAsset', 'FormUploadPending']), eq(A.entityId, formId)),
    );
  if (responseIds.length)
    conds.push(and(eq(A.entityType, 'FormResponse'), inArray(A.entityId, responseIds)));
  for (const cond of conds)
    await removeAttachments(db, tenantSchema, await db.select().from(A).where(cond));
}

export async function purgePendingUploads(db: any, tenantSchema: string): Promise<number> {
  const old = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.entityType, 'FormUploadPending'),
        lt(schema.attachments.uploadedAt, new Date(Date.now() - 24 * 3600 * 1000)),
        isNull(schema.attachments.deletedAt),
      ),
    )
    .limit(200);
  await removeAttachments(db, tenantSchema, old);
  return old.length;
}
