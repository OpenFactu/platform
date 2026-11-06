import { Router, type Request, type Response } from 'express';
import { listAuthEvents } from '../../core/auth/authEvents';
import { requireSession } from './sessionRoutes';

const router = Router();

/** GET /api/auth/events?limit=50 — el historial de accesos del propio usuario. */
router.get('/events', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const rows = await listAuthEvents(session.userId, Number(req.query.limit) || 50);
    res.json({ events: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
