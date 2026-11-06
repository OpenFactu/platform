import { Request, Response, NextFunction } from 'express';
import { resolveSession } from '../../core/auth/sessions';

/**
 * Middleware para asegurar que el usuario esté autenticado y sea ADMIN.
 */
export const adminMiddleware = async (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });

  const token = authHeader.split(' ')[1];
  let resolved: Awaited<ReturnType<typeof resolveSession>>;
  try {
    resolved = await resolveSession(token);
  } catch (e: any) {
    console.error('[adminAuth] No se pudo resolver la sesión:', e?.message);
    return res.status(500).json({ error: 'Error interno' });
  }
  if ('error' in resolved) {
    const code = resolved.error === 'INVALID' ? 'UNAUTHORIZED' : resolved.error;
    return res.status(401).json({ error: 'No autorizado', code });
  }
  const payload: any = resolved.payload;

  if (payload.role !== 'ADMIN' && payload.role !== 'SUPERUSER') {
    return res
      .status(403)
      .json({ error: 'Acceso denegado: Se requiere rol de administrador o súper usuario' });
  }

  req.user = payload;
  req.session = resolved.session;
  next();
};
