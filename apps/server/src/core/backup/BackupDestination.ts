/**
 * Destinos donde guardar los zips de backup de un tenant.
 *
 *  - local:    disco del servidor, `storage/backups/<schemaName>/` — carpeta
 *              hermana de `uploads`, así los backups NO acaban dentro de los
 *              propios zips (TenantBackup solo empaqueta `storage/uploads`).
 *  - gdrive /
 *    onedrive: carpeta `Keirost Backups/<schemaName>` bajo el rootFolderId
 *              configurado, usando la conexión OAuth del tenant.
 *
 * El `externalId` que se persiste en `BackupRun.externalId` es el nombre de
 * archivo (local) o el fileId/itemId (cloud).
 */

import fs from 'fs';
import path from 'path';
import type { BackupConfig } from './backupConfig';
import { getStorageConfig } from '../config/storageConfig';
import { GoogleDriveClient, type CloudFileInfo } from '../storage/cloud/GoogleDriveClient';
import { OneDriveClient } from '../storage/cloud/OneDriveClient';
import { getAccessToken, invalidateToken } from '../storage/cloud/TokenManager';
import { parseFolderPath } from '../storage/cloud/folderPath';

export interface BackupFileInfo {
  externalId: string;
  fileName: string;
  size: number;
  createdAt?: string;
}

export interface BackupDestination {
  readonly id: BackupConfig['destination'];
  put(fileName: string, data: Buffer): Promise<{ externalId: string; size: number }>;
  getStream(externalId: string): Promise<{ stream: NodeJS.ReadableStream; size?: number }>;
  remove(externalId: string): Promise<void>;
  list(): Promise<BackupFileInfo[]>;
}

const CLOUD_BACKUP_ROOT = 'Keirost Backups';

export function defaultBackupsBasePath(): string {
  if (process.env.OPENFACTU_BACKUPS_DIR) return process.env.OPENFACTU_BACKUPS_DIR;
  // __dirname suele ser .../apps/server/{src|dist}/core/backup → repo root
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'storage', 'backups');
}

class LocalBackupDestination implements BackupDestination {
  readonly id = 'local' as const;
  private dir: string;

  constructor(schemaName: string) {
    // basename() como defensa anti-traversal: el schemaName viene de la DB,
    // pero nunca debe poder salir de la carpeta de backups.
    this.dir = path.join(defaultBackupsBasePath(), path.basename(schemaName));
  }

  private resolveSafePath(externalId: string): string {
    const abs = path.resolve(this.dir, externalId);
    if (!abs.startsWith(path.resolve(this.dir) + path.sep)) {
      throw new Error('Ruta fuera de la carpeta de backups');
    }
    return abs;
  }

  async put(fileName: string, data: Buffer): Promise<{ externalId: string; size: number }> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    const abs = this.resolveSafePath(fileName);
    await fs.promises.writeFile(abs, data);
    return { externalId: fileName, size: data.length };
  }

  async getStream(externalId: string): Promise<{ stream: NodeJS.ReadableStream; size?: number }> {
    const abs = this.resolveSafePath(externalId);
    const stat = await fs.promises.stat(abs);
    return { stream: fs.createReadStream(abs), size: stat.size };
  }

  async remove(externalId: string): Promise<void> {
    const abs = this.resolveSafePath(externalId);
    try {
      await fs.promises.unlink(abs);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }

  async list(): Promise<BackupFileInfo[]> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(this.dir);
    } catch (e: any) {
      if (e?.code === 'ENOENT') return [];
      throw e;
    }
    const out: BackupFileInfo[] = [];
    for (const name of entries) {
      if (!name.endsWith('.zip')) continue;
      try {
        const stat = await fs.promises.stat(path.join(this.dir, name));
        out.push({
          externalId: name,
          fileName: name,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        });
      } catch {
        /* archivo borrado en paralelo */
      }
    }
    return out;
  }
}

type CloudClient = Pick<
  GoogleDriveClient,
  'ensureFolderPath' | 'upload' | 'downloadStream' | 'deleteFile' | 'listChildren'
>;

class CloudBackupDestination implements BackupDestination {
  private rootSegments: string[];

  constructor(
    readonly id: 'gdrive' | 'onedrive',
    private client: CloudClient,
    private schemaName: string,
    rootFolderId?: string,
  ) {
    this.rootSegments = parseFolderPath(rootFolderId);
  }

  private folderId?: string;

  private async folder(): Promise<string> {
    if (!this.folderId) {
      this.folderId = await this.client.ensureFolderPath([
        ...this.rootSegments,
        CLOUD_BACKUP_ROOT,
        this.schemaName,
      ]);
    }
    return this.folderId;
  }

  async put(fileName: string, data: Buffer): Promise<{ externalId: string; size: number }> {
    const folderId = await this.folder();
    const uploaded = await this.client.upload(fileName, 'application/zip', data, folderId);
    return { externalId: uploaded.id, size: uploaded.size };
  }

  async getStream(externalId: string): Promise<{ stream: NodeJS.ReadableStream; size?: number }> {
    const r = await this.client.downloadStream(externalId);
    return { stream: r.stream, size: r.size };
  }

  async remove(externalId: string): Promise<void> {
    await this.client.deleteFile(externalId);
  }

  async list(): Promise<BackupFileInfo[]> {
    const folderId = await this.folder();
    const files: CloudFileInfo[] = await this.client.listChildren(folderId);
    return files
      .filter((f) => f.name.endsWith('.zip'))
      .map((f) => ({
        externalId: f.id,
        fileName: f.name,
        size: f.size,
        createdAt: f.createdTime,
      }));
  }
}

/**
 * Construye el destino pedido para un tenant. Para destinos cloud exige que
 * el proveedor esté conectado (refresh token presente y no revocado).
 */
export async function resolveBackupDestination(
  tenantClient: any,
  schemaName: string,
  dest: BackupConfig['destination'],
): Promise<BackupDestination> {
  if (dest === 'local') return new LocalBackupDestination(schemaName);

  const cfg = await getStorageConfig(tenantClient);
  const section = cfg[dest];
  if (!section?.refreshToken || section.status === 'revoked') {
    const label = dest === 'gdrive' ? 'Google Drive' : 'OneDrive';
    throw new Error(
      `${label} no está conectado — conecta la cuenta en Ajustes → Almacenamiento o cambia el destino del backup`,
    );
  }

  const tokenOpts = { tenantClient, schemaName, provider: dest } as const;
  const clientOpts = {
    getToken: () => getAccessToken(tokenOpts),
    invalidateToken: () => invalidateToken(schemaName, dest),
  };
  const client: CloudClient =
    dest === 'gdrive' ? new GoogleDriveClient(clientOpts) : new OneDriveClient(clientOpts);
  return new CloudBackupDestination(dest, client, schemaName, section.rootFolderId || undefined);
}
