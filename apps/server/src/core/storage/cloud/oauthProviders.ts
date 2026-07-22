/**
 * Metadatos OAuth de los proveedores cloud (Google Drive / OneDrive) y
 * resolución de credenciales en modo híbrido:
 *
 *  - Credenciales GLOBALES: app OAuth registrada por el operador de la
 *    plataforma, en `.env` (GOOGLE_OAUTH_*, MS_OAUTH_*). Permiten el botón
 *    "Conectar" de un clic sin que el tenant registre nada.
 *  - Credenciales del TENANT: clientId/clientSecret propios guardados en
 *    `storage.<provider>.*` — tienen prioridad sobre las globales.
 *
 * Un refresh token emitido bajo un client_id NO es canjeable con otro
 * client_id, por eso al conectar se persiste `credSource` y los refrescos
 * posteriores usan siempre las credenciales de ese origen.
 */

import type { StorageConfig } from '../../config/storageConfig';

export type CloudProviderId = 'gdrive' | 'onedrive';

export interface OAuthProviderDef {
  /** Nombre visible en mensajes/notificaciones. */
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Parámetros extra del authorize (offline access, etc.). */
  extraAuthParams: Record<string, string>;
  envClientIdVar: string;
  envClientSecretVar: string;
}

export const OAUTH_PROVIDERS: Record<CloudProviderId, OAuthProviderDef> = {
  gdrive: {
    label: 'Google Drive',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // drive.file: solo archivos creados por la app — mínimo necesario
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    envClientIdVar: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecretVar: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },
  onedrive: {
    label: 'OneDrive',
    // Endpoint /common → cuentas personales y de empresa (work/school)
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'Files.ReadWrite', 'User.Read'],
    extraAuthParams: {},
    envClientIdVar: 'MS_OAUTH_CLIENT_ID',
    envClientSecretVar: 'MS_OAUTH_CLIENT_SECRET',
  },
};

export function isCloudProvider(value: string): value is CloudProviderId {
  return value === 'gdrive' || value === 'onedrive';
}

export interface ResolvedOAuthCreds {
  clientId: string;
  clientSecret: string;
  source: 'global' | 'tenant';
}

function globalCreds(provider: CloudProviderId): ResolvedOAuthCreds | null {
  const def = OAUTH_PROVIDERS[provider];
  const clientId = process.env[def.envClientIdVar] || '';
  const clientSecret = process.env[def.envClientSecretVar] || '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, source: 'global' };
}

function tenantCreds(cfg: StorageConfig, provider: CloudProviderId): ResolvedOAuthCreds | null {
  const section = cfg[provider];
  if (!section?.clientId || !section?.clientSecret) return null;
  return { clientId: section.clientId, clientSecret: section.clientSecret, source: 'tenant' };
}

/**
 * Resuelve las credenciales OAuth a usar para un tenant+provider.
 *
 * - `preferSource` fuerza un origen concreto (usado al refrescar tokens: el
 *   `credSource` persistido en la conexión manda, no "lo que haya ahora").
 * - Sin preferencia: credenciales propias del tenant si existen, si no las
 *   globales del `.env`.
 */
export function resolveOAuthCreds(
  cfg: StorageConfig,
  provider: CloudProviderId,
  preferSource?: 'global' | 'tenant' | '',
): ResolvedOAuthCreds | null {
  if (preferSource === 'global') return globalCreds(provider);
  if (preferSource === 'tenant') return tenantCreds(cfg, provider);
  return tenantCreds(cfg, provider) || globalCreds(provider);
}

export function hasGlobalCreds(provider: CloudProviderId): boolean {
  return globalCreds(provider) !== null;
}

/** Base pública para construir los redirect_uri del flujo OAuth. */
export function oauthRedirectBase(): string {
  const fromEnv = (process.env.OAUTH_REDIRECT_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  return `http://localhost:${process.env.SERVER_PORT || 3000}`;
}

export function oauthRedirectUri(provider: CloudProviderId): string {
  return `${oauthRedirectBase()}/api/config/storage/oauth/${provider}/callback`;
}
