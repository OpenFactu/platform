/**
 * Cuentas externas enlazadas del propio usuario (pantalla de seguridad). Todo con la sesión.
 *
 *   GET    /identities                   → { identities: [...] }
 *   POST   /identities/link/:providerId  → { url }: la web navega a ella (el Bearer no viaja en
 *                                          un 302, por eso no es un GET que redirija)
 *   DELETE /identities/:id               → 204
 */
import { Router, type Request, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { recordAuthEvent } from '../../core/auth/authEvents';
import { clientInfo } from '../../core/auth/clientInfo';
import { loadProvider, ssoCookie, startSso, webOrigin } from '../../core/auth/sso';
import { requireSession } from './sessionRoutes';
import { notConfigured } from './ssoRoutes';

const router = Router();
const db = () => ClientFactory.getClient('public');

router.get('/identities', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const rows = await db()
      .select({
        id: schema.userIdentities.id,
        providerId: schema.userIdentities.providerId,
        providerName: schema.authProviders.name,
        kind: schema.authProviders.kind,
        email: schema.userIdentities.email,
        linkedAt: schema.userIdentities.linkedAt,
      })
      .from(schema.userIdentities)
      .innerJoin(
        schema.authProviders,
        eq(schema.authProviders.id, schema.userIdentities.providerId),
      )
      .where(eq(schema.userIdentities.userId, session.userId))
      .orderBy(desc(schema.userIdentities.linkedAt));
    res.json({ identities: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.post('/identities/link/:providerId', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  if (!webOrigin()) return notConfigured(res);
  try {
    const provider = await loadProvider(req.params.providerId);
    if (!provider) {
      return res
        .status(404)
        .json({ error: 'Proveedor no encontrado', code: 'SSO_PROVIDER_NOT_FOUND' });
    }
    let started: Awaited<ReturnType<typeof startSso>>;
    try {
      started = await startSso(provider, { linkUserId: session.userId });
    } catch (e: any) {
      console.error(
        `[auth] SSO ${provider.id}: no se pudo contactar con el proveedor:`,
        e?.message,
      );
      return res
        .status(502)
        .json({ error: 'No se pudo contactar con el proveedor', code: 'SSO_UNAVAILABLE' });
    }
    // La cookie se queda en este navegador (misma web): el callback la pide.
    res.setHeader('Set-Cookie', ssoCookie(started.binding));
    res.json({ url: started.url });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.delete('/identities/:id', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const rows = await db()
      .delete(schema.userIdentities)
      .where(
        and(
          eq(schema.userIdentities.id, req.params.id),
          eq(schema.userIdentities.userId, session.userId),
        ),
      )
      .returning({ providerId: schema.userIdentities.providerId });
    if (!rows.length) return res.status(404).json({ error: 'No encontrada', code: 'NOT_FOUND' });
    await recordAuthEvent({
      userId: session.userId,
      kind: 'sso_unlink',
      ok: true,
      client: clientInfo(req),
      detail: { providerId: rows[0].providerId },
    });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
