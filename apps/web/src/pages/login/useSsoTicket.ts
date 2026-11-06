/**
 * Vuelta del proveedor (`/login/sso?ticket=`): canjea el ticket de un solo uso y sigue como el
 * login: sesión directa o reto del segundo paso.
 */
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/http';
import { readQueryParam, stripQueryParams } from './ssoModel';
import { redeemSsoTicket, type LoginResult } from './loginApi';

export type SsoTicketState =
  | { kind: 'checking' }
  | { kind: 'error'; code: string }
  | { kind: 'mfa'; result: LoginResult };

export function useSsoTicket(onSession: (data: LoginResult) => void) {
  // El ticket se lee una vez al montar y se quita de la URL: un F5 no lo reenvía.
  const [ticket] = useState(() => readQueryParam('ticket') ?? '');
  const [state, setState] = useState<SsoTicketState>(
    ticket ? { kind: 'checking' } : { kind: 'error', code: 'TICKET_INVALID' },
  );
  // El ticket se gasta al canjearlo: el segundo montaje (StrictMode) no lo repite.
  const started = useRef(false);

  useEffect(() => {
    stripQueryParams('ticket');
    if (!ticket || started.current) return;
    started.current = true;
    redeemSsoTicket({ ticket })
      .then((data) => {
        if (data.challenge) setState({ kind: 'mfa', result: data });
        else if (data.token) onSession(data);
        else setState({ kind: 'error', code: 'SSO_FAILED' });
      })
      .catch((err) => {
        const code =
          err instanceof ApiError ? (err.body as { code?: string } | null)?.code : undefined;
        setState({ kind: 'error', code: code ?? 'SSO_FAILED' });
      });
    // `onSession` solo se llama una vez, con el resultado del primer canje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  return state;
}
