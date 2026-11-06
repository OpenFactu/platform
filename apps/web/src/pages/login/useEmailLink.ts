/**
 * Enlace del correo (`/login/email?token=`). Sin handoff entra en este navegador; con handoff
 * enseña qué dispositivo pide entrar y solo lo aprueba cuando la persona lo confirma.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { approveEmailLink, redeemEmailLink, type HandoffInfo, type LoginResult } from './loginApi';
import { summarizeUserAgent } from '@/modules/settings/security/sessionLabels';

export type EmailLinkState =
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'mfa'; result: LoginResult }
  | { kind: 'approve'; info: HandoffInfo; approving: boolean; failed: boolean }
  | { kind: 'approved' }
  | { kind: 'denied' };

/** «Chrome · Windows», o null si no se reconoce nada. */
export const deviceSummary = (userAgent: string | null | undefined): string | null => {
  const { browser, os } = summarizeUserAgent(userAgent);
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

export function useEmailLink(token: string, onSession: (data: LoginResult) => void) {
  const [state, setState] = useState<EmailLinkState>({ kind: token ? 'checking' : 'invalid' });
  // El enlace se gasta al usarlo: el segundo montaje (StrictMode) no debe canjearlo otra vez.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    redeemEmailLink(token)
      .then((data) => {
        if (data.handoff) {
          setState({ kind: 'approve', info: data.handoff, approving: false, failed: false });
        } else if (data.challenge) {
          setState({ kind: 'mfa', result: data });
        } else if (data.token) {
          onSession(data);
        } else {
          setState({ kind: 'invalid' });
        }
      })
      .catch(() => setState({ kind: 'invalid' }));
    // `onSession` solo se llama una vez, con el resultado del primer canje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const approve = useCallback(async () => {
    setState((s) => (s.kind === 'approve' ? { ...s, approving: true, failed: false } : s));
    try {
      await approveEmailLink(token);
      setState({ kind: 'approved' });
    } catch {
      // El enlace pudo gastarse o caducar: se vuelve a la pantalla con el aviso.
      setState((s) => (s.kind === 'approve' ? { ...s, approving: false, failed: true } : s));
    }
  }, [token]);

  const deny = useCallback(() => setState({ kind: 'denied' }), []);

  return { state, approve, deny };
}
