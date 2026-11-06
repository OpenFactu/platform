/** Lee `iat` y `exp` (segundos) de un JWT sin verificarlo. */
export function readTokenTimes(token: string): { iat: number; exp: number } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload?.exp !== 'number' || typeof payload?.iat !== 'number') return null;
    return { iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Milisegundos hasta la mitad de la vida del token (0 si ya pasó); null si no se puede leer. */
export function msUntilRefresh(token: string, now = Date.now()): number | null {
  const times = readTokenTimes(token);
  if (!times) return null;
  const half = (times.iat + (times.exp - times.iat) / 2) * 1000;
  return Math.max(0, half - now);
}
