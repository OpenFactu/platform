/**
 * Adapter de almacenamiento sobre OneDrive (Microsoft Graph).
 *
 * Estructura de carpetas en el OneDrive del tenant:
 *   [rootFolderId]/Keirost/<tenantSchema>/<entityType>/<entityId>/<uuid>_<fileName>
 *
 * El `externalId` que se persiste en `Attachment.externalId` es el driveItem
 * id, como documenta `StorageAdapter.ts`. Requiere que el tenant haya
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
import { OneDriveClient } from '../cloud/OneDriveClient';
import { getAccessToken, invalidateToken } from '../cloud/TokenManager';
import { parseFolderPath } from '../cloud/folderPath';

export interface OneDriveAdapterOptions {
  tenantClient: any;
  schemaName: string;
  cfg: StorageConfig;
}

export class OneDriveAdapter implements StorageAdapter {
  readonly id = 'onedrive' as const;
  private client: OneDriveClient;
  private rootSegments: string[];
  private schemaName: string;
  private connected: boolean;

  constructor(opts: OneDriveAdapterOptions) {
    this.schemaName = opts.schemaName;
    this.rootSegments = parseFolderPath(opts.cfg.onedrive?.rootFolderId);
    this.connected =
      Boolean(opts.cfg.onedrive?.refreshToken) && opts.cfg.onedrive?.status !== 'revoked';
    this.client = new OneDriveClient({
      getToken: () =>
        getAccessToken({
          tenantClient: opts.tenantClient,
          schemaName: opts.schemaName,
          provider: 'onedrive',
        }),
      invalidateToken: () => invalidateToken(opts.schemaName, 'onedrive'),
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
      return { ok: false, detail: 'OneDrive no conectado — usa "Conectar" en Ajustes' };
    }
    try {
      const me = await this.client.me();
      return { ok: true, detail: `Conectado como ${me.email || '(cuenta desconocida)'}` };
    } catch (e: any) {
      return { ok: false, detail: e?.message || 'Error al contactar con OneDrive' };
    }
  }
}
