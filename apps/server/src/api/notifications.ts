/**
 * Endpoints de notificaciones in-app para el usuario logueado.
 *
 *   GET    /api/notifications?unreadOnly=true&limit=20   — lista
 *   GET    /api/notifications/unread-count               — { count: N }
 *   POST   /api/notifications/:id/read                   — marca una leída
 *   POST   /api/notifications/read-all                   — marca todas
 *   DELETE /api/notifications/:id                        — borra
 *
 * Todos operan sobre `req.tenantClient` y filtran por `req.user.userId` —
 * cada usuario ve y gestiona solo sus propias notificaciones.
 */

import { tr } from '../i18n';
import { Router } from 'express';
import { NotificationService } from '../core/notifications/NotificationService';

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const uid = req.user?.userId || req.user?.id;
  if (!uid) return res.status(401).json({ error: 'No autorizado' });
  req.uid = uid;
  next();
}

router.use(requireAuth);

router.get('/', async (req: any, res) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Number(req.query.limit) || 50;
    const list = await NotificationService.list(req.tenantClient, req.uid, {
      unreadOnly,
      limit,
    });
    // Se guardan en español; se traducen al idioma de quien las lee.
    res.json(
      Array.isArray(list)
        ? list.map((n: any) => ({
            ...n,
            title: n.title ? tr(req, n.title) : n.title,
            body: n.body ? tr(req, n.body) : n.body,
          }))
        : list,
    );
  } catch (e: any) {
    console.error('[Notifications.list]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.get('/unread-count', async (req: any, res) => {
  try {
    const count = await NotificationService.unreadCount(req.tenantClient, req.uid);
    res.json({ count });
  } catch (e: any) {
    console.error('[Notifications.unreadCount]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.post('/:id/read', async (req: any, res) => {
  try {
    await NotificationService.markRead(req.tenantClient, req.uid, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Notifications.markRead]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.post('/read-all', async (req: any, res) => {
  try {
    await NotificationService.markAllRead(req.tenantClient, req.uid);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Notifications.markAllRead]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await NotificationService.remove(req.tenantClient, req.uid, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Notifications.remove]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
