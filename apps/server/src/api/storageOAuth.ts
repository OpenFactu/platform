/**
 * Flujo OAuth para conectar Google Drive / OneDrive como almacenamiento.
 *
 * Montado desde `api/config.ts` en `/storage/oauth` → URLs finales:
 *   GET  /api/config/storage/oauth/status                → estado por proveedor
 *   GET  /api/config/storage/oauth/:provider/url         → URL de autorización (popup)
 *   GET  /api/config/storage/oauth/:provider/callback    → redirect de Google/MS (sin auth)
 *   POST /api/config/storage/oauth/:provider/disconnect  → desconectar
 *
 * El `state` es un JWT firmado con JWT_SECRET (10 min) que lleva el tenant,
 * el usuario y el origen de credenciales — sirve de anti-CSRF y permite que
 * el callback (que llega sin Authorization) sepa a qué tenant persistir.
 * El callback responde un HTML mínimo que hace postMessage al opener y se
 * cierra; NUNCA incluye tokens en ese mensaje.
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { getStorageConfig, setStorageConfig } from '../core/config/storageConfig';
import {
  OAUTH_PROVIDERS,
  hasGlobalCreds,
  isCloudProvider,
  oauthRedirectUri,
  resolveOAuthCreds,
  type CloudProviderId,
} from '../core/storage/cloud/oauthProviders';
import { invalidateToken } from '../core/storage/cloud/TokenManager';
import { GoogleDriveClient } from '../core/storage/cloud/GoogleDriveClient';
import { OneDriveClient } from '../core/storage/cloud/OneDriveClient';
import { logAudit } from '../utils/audit';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const STATE_PURPOSE = 'storage-oauth';

interface OAuthState {
  tid: string; // tenantId
  uid: string; // userId que inició la conexión
  provider: CloudProviderId;
  src: 'global' | 'tenant';
  purpose: typeof STATE_PURPOSE;
}

/** HTML que cierra el popup y avisa al opener del resultado (sin secretos). */
function popupResponse(provider: string, ok: boolean, detail?: string): string {
  const payload = JSON.stringify({ type: 'keirost-oauth', provider, ok, detail: detail || '' });
  return `<!doctype html><html><body><script>
try { window.opener && window.opener.postMessage(${payload}, '*'); } catch (e) {}
window.close();
</script><p>${ok ? 'Conexión completada. Puedes cerrar esta ventana.' : 'Error en la conexión: ' + (detail || '')}</p></body></html>`;
}

router.get('/status', async (req: any, res) => {
  if (!req.tenantId || !req.user) return res.status(401).json({ error: 'No autenticado' });
  try {
    const cfg = await getStorageConfig(req.tenantClient);
    const out: any = {};
    for (const provider of ['gdrive', 'onedrive'] as CloudProviderId[]) {
      const section = cfg[provider] || {};
      out[provider] = {
        connected: Boolean(section.refreshToken) && section.status !== 'revoked',
        status: section.status || '',
        credSource: section.credSource || '',
        connectedEmail: section.connectedEmail || '',
        connectedAt: section.connectedAt || '',
        globalAvailable: hasGlobalCreds(provider),
        tenantCredsSet: Boolean(section.clientId && section.clientSecret),
      };
    }
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al leer estado OAuth' });
  }
});

router.get('/:provider/url', async (req: any, res) => {
  const provider = req.params.provider;
  if (!isCloudProvider(provider)) return res.status(400).json({ error: 'Proveedor inválido' });
  if (!req.tenantId || !req.user) return res.status(401).json({ error: 'No autenticado' });
  try {
    const cfg = await getStorageConfig(req.tenantClient);
    const creds = resolveOAuthCreds(cfg, provider);
    if (!creds) {
      return res.status(400).json({
        error:
          'No hay credenciales OAuth disponibles: configura las globales en el servidor o unas propias en esta pantalla',
      });
    }
    const def = OAUTH_PROVIDERS[provider];
    const state = jwt.sign(
      {
        tid: req.tenantId,
        uid: req.user.id,
        provider,
        src: creds.source,
        purpose: STATE_PURPOSE,
      } satisfies OAuthState,
      JWT_SECRET,
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: oauthRedirectUri(provider),
      response_type: 'code',
      scope: def.scopes.join(' '),
      state,
      ...def.extraAuthParams,
    });
    res.json({ url: `${def.authorizeUrl}?${params.toString()}` });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error generando URL de autorización' });
  }
});

router.get('/:provider/callback', async (req: any, res) => {
  const provider = req.params.provider;
  if (!isCloudProvider(provider)) {
    return res.status(400).send(popupResponse(provider, false, 'Proveedor inválido'));
  }
  const def = OAUTH_PROVIDERS[provider];
  try {
    const { code, state: rawState, error: oauthError } = req.query as Record<string, string>;
    if (oauthError) {
      return res.send(popupResponse(provider, false, String(oauthError)));
    }
    if (!code || !rawState) {
      return res.send(popupResponse(provider, false, 'Falta code o state'));
    }

    let state: OAuthState;
    try {
      state = jwt.verify(rawState, JWT_SECRET) as OAuthState;
    } catch {
      return res.send(popupResponse(provider, false, 'State inválido o caducado'));
    }
    if (state.purpose !== STATE_PURPOSE || state.provider !== provider) {
      return res.send(popupResponse(provider, false, 'State inválido'));
    }

    const tenantClient = await ClientFactory.getTenantClient(state.tid);
    const cfg = await getStorageConfig(tenantClient);
    const creds = resolveOAuthCreds(cfg, provider, state.src);
    if (!creds) {
      return res.send(popupResponse(provider, false, 'Credenciales OAuth no disponibles'));
    }

    // Intercambio code → tokens
    const tokenRes = await fetch(def.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthRedirectUri(provider),
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }).toString(),
    });
    const tokens: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) {
      const detail = tokens?.error_description || tokens?.error || `HTTP ${tokenRes.status}`;
      return res.send(popupResponse(provider, false, `Intercambio de código fallido: ${detail}`));
    }
    if (!tokens.refresh_token) {
      return res.send(
        popupResponse(
          provider,
          false,
          'El proveedor no devolvió refresh token — revoca el acceso de la app en tu cuenta y vuelve a intentarlo',
        ),
      );
    }

    // Email de la cuenta conectada (informativo, best-effort)
    let email = '';
    try {
      const getToken = async () => tokens.access_token as string;
      const invalidate = () => undefined;
      email =
        provider === 'gdrive'
          ? (await new GoogleDriveClient({ getToken, invalidateToken: invalidate }).about()).email
          : (await new OneDriveClient({ getToken, invalidateToken: invalidate }).me()).email;
    } catch {
      /* sin email no pasa nada */
    }

    await setStorageConfig(tenantClient, {
      [provider]: {
        refreshToken: tokens.refresh_token,
        credSource: creds.source,
        connectedEmail: email,
        connectedAt: new Date().toISOString(),
        status: 'connected',
      },
    } as any);

    logAudit({
      tenantClient,
      tenantId: state.tid,
      userId: state.uid,
      entityType: 'StorageConfig',
      entityId: `oauth-${provider}`,
      action: 'UPDATE',
      newValue: { provider, connectedEmail: email, credSource: creds.source },
    });

    res.send(popupResponse(provider, true));
  } catch (e: any) {
    console.error(`[storageOAuth] Error en callback de ${provider}:`, e?.message);
    res.send(popupResponse(provider, false, e?.message || 'Error interno'));
  }
});

router.post('/:provider/disconnect', async (req: any, res) => {
  const provider = req.params.provider;
  if (!isCloudProvider(provider)) return res.status(400).json({ error: 'Proveedor inválido' });
  if (!req.tenantId || !req.user) return res.status(401).json({ error: 'No autenticado' });
  try {
    const cfg = await getStorageConfig(req.tenantClient);
    const section = cfg[provider];

    // Revocación best-effort en Google (Microsoft no expone revoke por token)
    if (provider === 'gdrive' && section?.refreshToken) {
      fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(section.refreshToken)}`,
        {
          method: 'POST',
        },
      ).catch(() => undefined);
    }

    const patch: any = {
      [provider]: {
        refreshToken: null,
        credSource: null,
        connectedEmail: null,
        connectedAt: null,
        status: null,
      },
    };
    // Si era el provider activo, volver a local para no dejar subidas colgando
    if (cfg.provider === provider) patch.provider = 'local';
    await setStorageConfig(req.tenantClient, patch);

    if (req.tenantSchema) invalidateToken(req.tenantSchema, provider);

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId,
      userId: req.user?.id,
      entityType: 'StorageConfig',
      entityId: `oauth-${provider}`,
      action: 'UPDATE',
      newValue: { provider, disconnected: true },
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al desconectar' });
  }
});

export default router;
