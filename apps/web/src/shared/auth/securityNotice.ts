/**
 * Resultado de enlazar una cuenta externa (`/profile/security?linked=1` o `?ssoError=`).
 *
 * Se captura al cargar el módulo (main.tsx lo importa antes de montar React) porque el sistema de
 * pestañas reescribe la URL y pierde la query antes de que monte la tarjeta, que es perezosa.
 */
import { stripQueryParams } from '@/pages/login/ssoModel';

export interface SecurityNotice {
  linked: boolean;
  errorCode: string | null;
}

const SECURITY_PATH = '/profile/security';

let pending: SecurityNotice | null = null;

/** Lee y quita de la URL los parámetros; solo en la pantalla de seguridad. */
export function captureSecurityNotice(): void {
  try {
    if (window.location.pathname !== SECURITY_PATH) return;
    const q = new URLSearchParams(window.location.search);
    const linked = q.get('linked') === '1';
    const errorCode = q.get('ssoError');
    if (!linked && !errorCode) return;
    pending = { linked, errorCode };
    stripQueryParams('linked', 'ssoError');
  } catch {
    // Sin `window` no hay nada que capturar.
  }
}

/** El aviso pendiente, sin gastarlo (valor inicial: React puede llamarlo dos veces). */
export const peekSecurityNotice = (): SecurityNotice | null => pending;

/** El aviso pendiente, y lo borra: se enseña una sola vez. */
export function consumeSecurityNotice(): SecurityNotice | null {
  const n = pending;
  pending = null;
  return n;
}

captureSecurityNotice();
