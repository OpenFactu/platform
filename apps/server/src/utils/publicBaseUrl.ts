import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

/**
 * URL base pública para los enlaces de los emails al destinatario.
 *
 * Prioridad:
 *   1. SystemConfig del tenant `app_public_base_url` (se fija en el SetupWizard
 *      y se puede editar desde Ajustes). Es lo normal en producción.
 *   2. `PUBLIC_BASE_URL` del entorno.
 *   3. Header `Origin` del request — útil en dev (Vite HTTPS en LAN).
 *   4. Header `Referer`.
 *   5. `X-Forwarded-Proto/Host` (detrás de proxy).
 *   6. `req.protocol + host` (último recurso).
 */
export async function publicBaseUrl(req: any): Promise<string> {
  // 1. SystemConfig del tenant.
  try {
    if (req.tenantClient) {
      const [row] = await req.tenantClient
        .select({ value: schema.systemConfigs.value })
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, 'app_public_base_url'));
      const v = row?.value?.toString().trim();
      if (v && /^https?:\/\//.test(v)) return v.replace(/\/$/, '');
    }
  } catch {
    /* ignore, cae al siguiente */
  }

  const envUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const origin = (req.headers?.origin as string | undefined)?.trim();
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, '');

  const referer = (req.headers?.referer as string | undefined)?.trim();
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }

  const xfProto = (req.headers?.['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const xfHost = (req.headers?.['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  return `${req.protocol}://${req.get('host')}`;
}
