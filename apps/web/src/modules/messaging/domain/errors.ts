import { ApiError } from '@/shared/http';
import type { Translate } from './messaging';

/**
 * Texto para el usuario a partir de un error del servicio. El servicio responde
 * `{ error, code }` con `error` en español para los logs; aquí se traduce por
 * `code`, y si no hay traducción, un mensaje genérico.
 */
export function messagingErrorText(err: unknown, t: Translate): string {
  const code =
    err instanceof ApiError && err.body && typeof err.body === 'object'
      ? (err.body as { code?: unknown }).code
      : undefined;
  if (typeof code === 'string') {
    const key = `messaging.errors.${code}`;
    const text = t(key);
    if (text !== key) return text;
  }
  if (err instanceof ApiError && err.status === 0) return err.message;
  // Un Error propio (no de la API) ya trae su texto para el usuario.
  if (err instanceof Error && !(err instanceof ApiError) && err.message) return err.message;
  return t('messaging.errors.generic');
}
