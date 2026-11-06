/**
 * Empezar el acceso único desde el login. En la web se navega a la dirección de inicio del
 * servidor; en el escritorio se abre en el navegador del sistema con un handoff y aquí se espera
 * a que el servidor lo apruebe (la confirmación es una página suya, no de la SPA).
 */
import { useCallback, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { getClientKind } from '@/shared/auth/clientKind';
import { openExternal } from '@/shared/auth/openExternal';
import { createHandoff, type HandoffTicket, type LoginResult } from './loginApi';
import { safeReturnPath, ssoStartUrl } from './ssoModel';
import { useHandoffWait } from './useHandoffWait';

interface Params {
  onDone: (data: LoginResult) => void;
}

export function useSsoLogin({ onDone }: Params) {
  const { t } = useI18n();
  const [handoff, setHandoff] = useState<HandoffTicket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const start = useCallback(
    async (provider: { id: string; startUrl: string }) => {
      setError(undefined);
      let returnTo: string | null = null;
      try {
        returnTo = safeReturnPath(new URLSearchParams(window.location.search).get('return'));
      } catch {
        returnTo = null;
      }
      if (getClientKind() !== 'desktop') {
        const url = ssoStartUrl(provider.startUrl, { returnTo });
        if (url) window.location.assign(url);
        else setError(t('auth.sso.startFailed'));
        return;
      }
      setBusyId(provider.id);
      try {
        const ticket = await createHandoff();
        setHandoff(ticket);
        const url = ssoStartUrl(provider.startUrl, { handoffId: ticket.handoffId });
        if (!url) throw new Error('startUrl');
        await openExternal(url);
      } catch {
        setHandoff(null);
        setError(t('auth.sso.startFailed'));
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  const cancel = useCallback(() => {
    setHandoff(null);
    setError(undefined);
  }, []);

  const handleExpired = useCallback(() => {
    setHandoff(null);
    setError(t('auth.handoff.expired'));
  }, [t]);

  useHandoffWait({ handoff, onApproved: onDone, onExpired: handleExpired });

  return { handoff, busyId, error, start, cancel };
}
