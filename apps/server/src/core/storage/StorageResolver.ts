/**
 * Resuelve el adapter de almacenamiento adecuado para un tenant.
 *
 *   StorageResolver.forTenant(tenantClient, schemaName)         → activo
 *   StorageResolver.forProvider(provider, tenantClient, schema) → forzado
 *
 * Si la config del tenant indica un provider cloud sin credenciales válidas,
 * caemos al adapter local (es siempre seguro escribir local). Esto evita
 * que un mal config de OAuth tire impresiones u otros flujos.
 */

import path from 'path';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { GoogleDriveAdapter } from './adapters/GoogleDriveAdapter';
import { OneDriveAdapter } from './adapters/OneDriveAdapter';
import type { StorageAdapter, StorageProviderId } from './StorageAdapter';
import { getStorageConfig, type StorageConfig } from '../config/storageConfig';

/**
 * basePath por defecto. En docker el contenedor server tiene `/app/storage`
 * montado como volumen → escribimos en `/app/storage/uploads/`.
 * En dev local desde `apps/server`, el `__dirname` apunta dentro de src/
 * o dist/, así que vamos varios niveles arriba hasta el root del repo y
 * añadimos `storage/uploads`.
 */
function defaultLocalBasePath(): string {
  if (process.env.OPENFACTU_UPLOADS_DIR) return process.env.OPENFACTU_UPLOADS_DIR;
  // __dirname suele ser .../apps/server/{src|dist}/core/storage
  // Subimos 4 niveles → repo root, luego ./storage/uploads
  const guess = path.resolve(__dirname, '..', '..', '..', '..', '..', 'storage', 'uploads');
  return guess;
}

export class StorageResolver {
  /**
   * Devuelve el adapter activo para un tenant (lo que diga `storage.provider`
   * en su `systemConfigs`). Para FREE/recién creados, `local` por defecto.
   */
  static async forTenant(tenantClient: any, schemaName: string): Promise<StorageAdapter> {
    const cfg = await getStorageConfig(tenantClient);
    return this.buildAdapter(cfg.provider || 'local', cfg, tenantClient, schemaName);
  }

  /**
   * Devuelve un adapter concreto sin mirar la config — usado al descargar un
   * archivo específico cuya `provider` está fijada en su fila Attachment, así
   * los archivos viejos siguen accesibles aunque el tenant cambie de provider.
   */
  static async forProvider(
    provider: StorageProviderId,
    tenantClient: any,
    schemaName: string,
  ): Promise<StorageAdapter> {
    const cfg = await getStorageConfig(tenantClient);
    return this.buildAdapter(provider, cfg, tenantClient, schemaName);
  }

  private static buildAdapter(
    provider: StorageProviderId,
    cfg: StorageConfig,
    tenantClient: any,
    schemaName: string,
  ): StorageAdapter {
    switch (provider) {
      case 'gdrive':
      case 'onedrive': {
        // Solo construimos el adapter cloud si el tenant completó el flujo
        // OAuth y la conexión no está revocada; si no, fallback a local para
        // no romper subidas (escribir local siempre es seguro).
        const section = cfg[provider];
        if (section?.refreshToken && section.status !== 'revoked') {
          return provider === 'gdrive'
            ? new GoogleDriveAdapter({ tenantClient, schemaName, cfg })
            : new OneDriveAdapter({ tenantClient, schemaName, cfg });
        }
        console.warn(
          `[StorageResolver] Provider "${provider}" sin conexión OAuth válida, cayendo a local`,
        );
        return new LocalStorageAdapter({
          basePath: cfg?.local?.basePath || defaultLocalBasePath(),
        });
      }
      case 'local':
      default:
        return new LocalStorageAdapter({
          basePath: cfg?.local?.basePath || defaultLocalBasePath(),
        });
    }
  }
}
