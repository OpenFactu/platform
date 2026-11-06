import type { NextFunction, Response } from 'express';

// Los patrones de /api/auth no se alcanzan hoy: `/api/auth` se monta antes que este middleware.
// Se dejan por si algún día se monta después, para que sigan siendo lo permitido.
// Lo único que puede hacer una sesión a la que se le exige configurar el segundo factor.
const ALLOWED = [
  /^\/api\/2fa(\/|$)/,
  /^\/api\/auth\/passkeys(\/|$)/,
  /^\/api\/auth\/(me|logout|refresh)\/?$/,
];

/** Una sesión con `restricted = mfa_setup` solo configura su 2FA o sale. Va tras el contexto de empresa. */
export function restrictedSession(req: any, res: Response, next: NextFunction) {
  if (req.session?.restricted !== 'mfa_setup') return next();
  const url = String(req.originalUrl || '').split('?')[0];
  if (ALLOWED.some((re) => re.test(url))) return next();
  res.status(403).json({
    error: 'Tu empresa exige activar la verificación en dos pasos antes de continuar',
    code: 'SESSION_RESTRICTED',
  });
}
