/**
 * Adapter de almacenamiento sobre Google Drive.
 *
 * Estructura de carpetas en el Drive del tenant:
 *   [rootFolderId]/Keirost/<tenantSchema>/<entityType>/<entityId>/<uuid>_<fileName>
 *
 * El `externalId` que se persiste en `Attachment.externalId` es el fileId de
 * Drive, como documenta `StorageAdapter.ts`. Requiere que el tenant haya
 * conectado su cuenta (refresh token vía OAuth) — el StorageResolver solo
 * construye este adapter cuando eso se cumple.
 */

import crypto from 'crypto';
import path from 'path';
import type {
  StorageAdapter,
  UploadInput,
  DownloadInput,
  DeleteInput,
  StoredObjectRef,
  DownloadResult,
  HealthCheckResult,
} from '../StorageAdapter';
import type { StorageConfig } from '../../config/storageConfig';
import { GoogleDriveClient } from '../cloud/GoogleDriveClient';
import { getAccessToken, invalidateToken } from '../cloud/TokenManager';
import { parseFolderPath } from '../cloud/folderPath';

export interface GoogleDriveAdapterOptions {
  tenantClient: any;
  schemaName: string;
  cfg: StorageConfig;
}

export class GoogleDriveAdapter implements StorageAdapter {
  readonly id = 'gdrive' as const;
  private client: GoogleDriveClient;
  private rootSegments: string[];
  private schemaName: string;
  private connected: boolean;

  constructor(opts: GoogleDriveAdapterOptions) {
    this.schemaName = opts.schemaName;
    this.rootSegments = parseFolderPath(opts.cfg.gdrive?.rootFolderId);
    this.connected = Boolean(opts.cfg.gdrive?.refreshToken) && opts.cfg.gdrive?.status !== 'revoked';
    this.client = new GoogleDriveClient({
      getToken: () =>
        getAccessToken({
          tenantClient: opts.tenantClient,
          schemaName: opts.schemaName,
          provider: 'gdrive',
        }),
      invalidateToken: () => invalidateToken(opts.schemaName, 'gdrive'),
    });
  }

  async upload(input: UploadInput): Promise<StoredObjectRef> {
    const safeName = path.basename(input.fileName).replace(/[^\w.\-]/g, '_');
    const folderId = await this.client.ensureFolderPath([
      ...this.rootSegments,
      'Keirost',
      input.tenantSchema,
      input.entityType,
      input.entityId,
      ...(input.subPath ?? []),
    ]);
    const uploaded = await this.client.upload(
      `${crypto.randomUUID()}_${safeName}`,
      input.mime,
      input.content,
      folderId,
    );
    return {
      externalId: uploaded.id,
      size: uploaded.size,
      mime: input.mime,
      fileName: input.fileName,
    };
  }

  async download(input: DownloadInput): Promise<DownloadResult> {
    const r = await this.client.downloadStream(input.externalId);
    return {
      stream: r.stream,
      size: r.size,
      // El mime/nombre reales los guarda la fila Attachment; esto es fallback.
      mime: r.mime,
      fileName: r.name.replace(/^[a-f0-9-]{36}_/, ''),
    };
  }

  async delete(input: DeleteInput): Promise<void> {
    await this.client.deleteFile(input.externalId);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.connected) {
      return { ok: false, detail: 'Google Drive no conectado — usa "Conectar" en Ajustes' };
    }
    try {
      const about = await this.client.about();
      return { ok: true, detail: `Conectado como ${about.email || '(cuenta desconocida)'}` };
    } catch (e: any) {
      return { ok: false, detail: e?.message || 'Error al contactar con Google Drive' };
    }
  }
}
