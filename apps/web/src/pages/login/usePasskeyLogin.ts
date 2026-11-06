/** «Entrar con passkey»: inicio sin usuario ni contraseña. */
import { useCallback, useState } from 'react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { authenticateWithPasskey, passkeysSupported } from '@/shared/auth/webauthn';
import { passkeyOptions, passkeyVerify, type LoginResult } from './loginApi';

export function usePasskeyLogin(onResult: (data: LoginResult) => void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (tenantId?: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const { options, challenge } = await passkeyOptions();
        const response = await authenticateWithPasskey(options);
        if (!response) return; // cancelado: sin aviso
        onResult(await passkeyVerify({ challenge, response, tenantId: tenantId || undefined }));
      } catch (err) {
        const body = err instanceof ApiError ? (err.body as { error?: string } | null) : null;
        if (err instanceof ApiError && err.status === 429) setError(t('auth.passkey.tooMany'));
        else if (err instanceof ApiError && err.status === 403 && body?.error) setError(body.error);
        else setError(t('auth.passkey.loginFailed'));
      } finally {
        setBusy(false);
      }
    },
    [busy, onResult, t],
  );

  return { supported: passkeysSupported(), busy, error, start };
}
