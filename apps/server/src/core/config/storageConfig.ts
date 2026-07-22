/**
 * Helper de lectura/escritura de la config de almacenamiento (prefijo
 * `storage.*` en `systemConfigs`). Reaprovecha el patrón de
 * `companyConfig.ts` y `systemConfigSection.ts`.
 *
 * Estructura esperada:
 *   storage.provider              → 'local' | 'gdrive' | 'onedrive'
 *   storage.local.basePath        → opcional; default lo decide el resolver
 *   storage.gdrive.clientId       → credenciales OAuth propias (opcional)
 *   storage.gdrive.clientSecret
 *   storage.gdrive.refreshToken   → obtenido vía flujo OAuth (Conectar)
 *   storage.gdrive.rootFolderId
 *   storage.gdrive.credSource     → 'global' (app del .env) | 'tenant' (propias)
 *   storage.gdrive.connectedEmail → cuenta autorizada (informativo)
 *   storage.gdrive.connectedAt    → ISO timestamp de la conexión
 *   storage.gdrive.status         → 'connected' | 'revoked' | ''
 *   storage.onedrive.*            → misma estructura que gdrive
 *
 * Los `*.clientSecret` y `*.refreshToken` se guardan cifrados en reposo
 * (AES-256-GCM, ver `secretCrypto.ts`). Valores heredados en plano se leen
 * tal cual y quedan cifrados en la siguiente escritura. Hacia la API se
 * exponen redactados como `__SET__` (ver `getStorageConfigRedacted`).
 */

import * as schema from '../../db/schema';
import { decryptConfigSecret, encryptConfigSecret, isEncryptedSecret } from './secretCrypto';

export interface CloudProviderConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  rootFolderId?: string;
  credSource?: 'global' | 'tenant' | '';
  connectedEmail?: string;
  connectedAt?: string;
  status?: 'connected' | 'revoked' | '';
}

export interface StorageConfig {
  provider?: 'local' | 'gdrive' | 'onedrive';
  local?: { basePath?: string };
  gdrive?: CloudProviderConfig;
  onedrive?: CloudProviderConfig;
}

const PREFIX = 'storage.';

/** Hojas que se cifran en reposo y se redactan hacia la API. */
const SECRET_LEAF_KEYS = ['clientSecret', 'refreshToken'];

/** Centinela que la API devuelve en lugar de un secreto guardado. */
export const SECRET_SET_SENTINEL = '__SET__';

function isSecretKey(key: string): boolean {
  const leaf = key.split('.').pop() || '';
  return SECRET_LEAF_KEYS.includes(leaf);
}

/**
 * Lee toda la sección `storage.*` y la devuelve como un objeto anidado,
 * con los secretos descifrados (uso interno del server).
 */
export async function getStorageConfig(db: any): Promise<StorageConfig> {
  const rows: Array<{ key: string; value: string | null }> = await db
    .select()
    .from(schema.systemConfigs);
  const out: any = {};
  for (const r of rows) {
    if (!r.key?.startsWith(PREFIX)) continue;
    const parts = r.key.slice(PREFIX.length).split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    let value = r.value ?? '';
    if (value && isSecretKey(r.key)) {
      try {
        value = decryptConfigSecret(value);
      } catch {
        // Clave rotada o valor corrupto: mejor tratarlo como vacío que romper
        console.warn(`[storageConfig] No se pudo descifrar "${r.key}", ignorando valor`);
        value = '';
      }
    }
    cur[parts[parts.length - 1]] = value;
  }
  return out as StorageConfig;
}

/**
 * Igual que `getStorageConfig` pero con los secretos no vacíos sustituidos
 * por el centinela `__SET__` — es lo que se devuelve al navegador.
 */
export async function getStorageConfigRedacted(db: any): Promise<StorageConfig> {
  const cfg: any = await getStorageConfig(db);
  for (const provider of ['gdrive', 'onedrive']) {
    const section = cfg[provider];
    if (!section) continue;
    for (const leaf of SECRET_LEAF_KEYS) {
      if (section[leaf]) section[leaf] = SECRET_SET_SENTINEL;
    }
  }
  return cfg as StorageConfig;
}

/**
 * Persiste un patch parcial. Cualquier campo undefined no se toca; null
 * convierte el valor a cadena vacía. Los secretos se cifran antes de
 * escribirse; los valores `__SET__` (centinela de la API) se descartan.
 */
export async function setStorageConfig(db: any, patch: StorageConfig): Promise<void> {
  const flat: Record<string, string | null> = flatten(patch, PREFIX);
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    let toStore = value;
    if (toStore && isSecretKey(key)) {
      if (toStore === SECRET_SET_SENTINEL) continue; // el cliente no cambió el secreto
      if (!isEncryptedSecret(toStore)) toStore = encryptConfigSecret(toStore);
    }
    await upsertOne(db, key, toStore);
  }
}

function flatten(obj: any, prefix: string, out: Record<string, any> = {}): Record<string, any> {
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix + k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, fullKey + '.', out);
    } else {
      out[fullKey] = v as any;
    }
  }
  return out;
}

async function upsertOne(db: any, key: string, value: string | null): Promise<void> {
  const { eq } = await import('drizzle-orm');
  const crypto = await import('crypto');
  const existing = await db
    .select({ id: schema.systemConfigs.id })
    .from(schema.systemConfigs)
    .where(eq(schema.systemConfigs.key, key));
  if (existing.length > 0) {
    await db
      .update(schema.systemConfigs)
      .set({ value: value ?? '', updatedAt: new Date() })
      .where(eq(schema.systemConfigs.key, key));
  } else {
    await db.insert(schema.systemConfigs).values({
      id: crypto.randomUUID(),
      key,
      value: value ?? '',
      updatedAt: new Date(),
    });
  }
}
