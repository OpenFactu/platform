/**
 * Adapter de almacenamiento que escribe a disco local del servidor.
 *
 * Estructura de carpetas:
 *   <basePath>/<tenantSchema>/<entityType>/<entityId>/<uuid>_<fileName>
 *
 * El `externalId` que se persiste en `Attachment.externalId` es la ruta
 * relativa a `basePath`, así una migración del basePath (mover storage a otro
 * disco) basta con copiar la carpeta y actualizar la config.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  StorageAdapter,
  UploadInput,
  DownloadInput,
  DeleteInput,
  StoredObjectRef,
  DownloadResult,
  HealthCheckResult,
} from '../StorageAdapter';

export interface LocalStorageOptions {
  /**
   * Ruta absoluta donde colgar todos los uploads. Por defecto: <repo>/storage/uploads.
   * En docker el volumen `./storage` ya se monta a `/app/storage`.
   */
  basePath: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly id = 'local' as const;
  private basePath: string;

  constructor(opts: LocalStorageOptions) {
    this.basePath = opts.basePath;
  }

  async upload(input: UploadInput): Promise<StoredObjectRef> {
    // Sanitizamos el filename para evitar path traversal — solo usamos su
    // basename y prefijamos con un UUID para evitar colisiones entre uploads.
    const safeName = path.basename(input.fileName).replace(/[^\w.\-]/g, '_');
    const uuid = crypto.randomUUID();
    const relativeDir = path.join(
      input.tenantSchema,
      input.entityType,
      input.entityId,
      ...(input.subPath ?? []),
    );
    const fileKey = path.join(relativeDir, `${uuid}_${safeName}`);
    const absDir = path.join(this.basePath, relativeDir);
    const absPath = path.join(this.basePath, fileKey);

    await fs.promises.mkdir(absDir, { recursive: true });
    await fs.promises.writeFile(absPath, input.content);

    return {
      externalId: fileKey,
      size: input.content.length,
      mime: input.mime,
      fileName: input.fileName,
    };
  }

  async download(input: DownloadInput): Promise<DownloadResult> {
    const absPath = this.resolveSafePath(input.externalId);
    const stat = await fs.promises.stat(absPath);
    return {
      stream: fs.createReadStream(absPath),
      size: stat.size,
      // El mime real lo guardamos en la fila Attachment, no en el archivo.
      // El caller puede sobreescribir; aquí devolvemos un default seguro.
      mime: 'application/octet-stream',
      fileName: path.basename(absPath).replace(/^[a-f0-9-]{36}_/, ''),
    };
  }

  async delete(input: DeleteInput): Promise<void> {
    const absPath = this.resolveSafePath(input.externalId);
    try {
      await fs.promises.unlink(absPath);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await fs.promises.mkdir(this.basePath, { recursive: true });
      // Probamos una escritura/lectura efímera para validar permisos.
      const probe = path.join(this.basePath, '.openfactu-healthcheck');
      await fs.promises.writeFile(probe, 'ok');
      await fs.promises.unlink(probe);
      return { ok: true, detail: `basePath: ${this.basePath}` };
    } catch (e: any) {
      return { ok: false, detail: e?.message || 'No escribible' };
    }
  }

  /**
   * Une `basePath + externalId` validando que el resultado sigue dentro de
   * `basePath` — defensa contra `externalId` malicioso (path traversal).
   */
  private resolveSafePath(externalId: string): string {
    const abs = path.resolve(this.basePath, externalId);
    const baseAbs = path.resolve(this.basePath);
    if (!abs.startsWith(baseAbs + path.sep) && abs !== baseAbs) {
      throw new Error('Ruta fuera del basePath del adapter local');
    }
    return abs;
  }
}
