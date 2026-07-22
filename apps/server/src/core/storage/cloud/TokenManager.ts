/**
 * Gestión de access tokens de los proveedores cloud (Google / Microsoft).
 *
 * Cachea el access token en memoria por `<schema>:<provider>` y lo refresca
 * con el refresh token guardado en la config del tenant cuando caduca (con
 * margen de 120 s). Si el proveedor responde `invalid_grant` (token revocado
 * por el usuario o caducado), marca la conexión como `revoked` y notifica al
 * tenant para que vuelva a conectar.
 */

import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { ClientFactory } from '../../tenant/ClientFactory';
import { notifyTenant } from '../../realtime/notifyTenant';
import { getStorageConfig, setStorageConfig } from '../../config/storageConfig';
import {
  OAUTH_PROVIDERS,
  resolveOAuthCreds,
  type CloudProviderId,
} from './oauthProviders';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const REFRESH_MARGIN_MS = 120_000;

const cache = new Map<string, CachedToken>();

function cacheKey(schemaName: string, provider: CloudProviderId): string {
  return `${schemaName}:${provider}`;
}

export interface TokenContext {
  tenantClient: any;
  schemaName: string;
  provider: CloudProviderId;
}

/**
 * Devuelve un access token válido para el tenant+provider, refrescando si
 * hace falta. Lanza si el proveedor no está conectado o el refresh falla.
 */
export async function getAccessToken(ctx: TokenContext): Promise<string> {
  const key = cacheKey(ctx.schemaName, ctx.provider);
  const cached = cache.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const cfg = await getStorageConfig(ctx.tenantClient);
  const section = cfg[ctx.provider];
  const def = OAUTH_PROVIDERS[ctx.provider];
  if (!section?.refreshToken) {
    throw new Error(`${def.label} no está conectado para este tenant`);
  }
  if (section.status === 'revoked') {
    throw new Error(`La conexión con ${def.label} fue revocada — vuelve a conectar en Ajustes`);
  }
  const creds = resolveOAuthCreds(cfg, ctx.provider, section.credSource || undefined);
  if (!creds) {
    throw new Error(
      `No hay credenciales OAuth (${section.credSource || 'auto'}) para ${def.label}`,
    );
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: section.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  if (ctx.provider === 'onedrive') {
    body.set('scope', def.scopes.join(' '));
  }

  const res = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    // invalid_grant: el usuario revocó el acceso o el refresh token caducó.
    // unauthorized_client: la app (client_id) ya no está habilitada para este
    // tipo de cuenta/audiencia (p.ej. tras cambiar la config en Azure/Google)
    // — el refresh token guardado ya no sirve en ninguno de los dos casos,
    // así que tratamos ambos igual: marcar revocado y pedir reconectar en
    // vez de fallar en silencio en cada intento del cron.
    if (data?.error === 'invalid_grant' || data?.error === 'unauthorized_client') {
      await markRevoked(ctx).catch((e) =>
        console.warn('[TokenManager] Error marcando conexión revocada:', e?.message),
      );
      throw new Error(
        `La conexión con ${def.label} fue revocada o caducó — vuelve a conectar en Ajustes`,
      );
    }
    throw new Error(
      `Error refrescando token de ${def.label}: ${data?.error_description || data?.error || res.status}`,
    );
  }

  const token: CachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  cache.set(key, token);

  // Google puede rotar el refresh token en algunos flujos; persistir si cambia.
  if (data.refresh_token && data.refresh_token !== section.refreshToken) {
    await setStorageConfig(ctx.tenantClient, {
      [ctx.provider]: { refreshToken: data.refresh_token },
    } as any).catch(() => undefined);
  }

  return token.accessToken;
}

/** Invalida el token cacheado (tras un 401 de la API o al desconectar). */
export function invalidateToken(schemaName: string, provider: CloudProviderId): void {
  cache.delete(cacheKey(schemaName, provider));
}

/**
 * Marca la conexión como revocada y notifica a los miembros del tenant.
 * El tenantId se resuelve desde `public.Tenant` por schemaName (los adapters
 * solo conocen el schema).
 */
async function markRevoked(ctx: TokenContext): Promise<void> {
  invalidateToken(ctx.schemaName, ctx.provider);
  await setStorageConfig(ctx.tenantClient, {
    [ctx.provider]: { status: 'revoked' },
  } as any);

  const def = OAUTH_PROVIDERS[ctx.provider];
  const publicDb = ClientFactory.getClient('public');
  const [tenant] = await publicDb
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.schemaName, ctx.schemaName));
  if (!tenant) return;

  await notifyTenant({
    tenantId: tenant.id,
    tenantClient: ctx.tenantClient,
    level: 'error',
    title: `${def.label} desconectado`,
    body: `La autorización de ${def.label} fue revocada o caducó. Vuelve a conectar la cuenta en Ajustes → Almacenamiento.`,
    link: '/settings/company?tab=storage',
  });
}
