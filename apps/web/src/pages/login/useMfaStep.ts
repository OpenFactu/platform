/** Estado del segundo paso del login: código, modo, errores y cuenta atrás. */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { verifyMfa, type LoginResult } from './loginApi';

export type MfaMode = 'totp' | 'backup';

export interface MfaStepParams {
  challenge: string;
  methods: string[];
  onDone: (data: LoginResult) => void;
  onExpired: () => void;
}

/** Un código completo: 6 dígitos (app) u 8 alfanuméricos (respaldo, sin el guion). */
export const isCodeComplete = (mode: MfaMode, code: string) =>
  mode === 'totp' ? /^\d{6}$/.test(code) : /^[A-Za-z0-9]{8}$/.test(code);

export function useMfaStep({ challenge, methods, onDone, onExpired }: MfaStepParams) {
  const { t } = useI18n();
  const [mode, setModeState] = useState<MfaMode>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  // Sube al vaciar el código tras un fallo: la vista remonta las casillas y el foco vuelve a la primera.
  const [resetKey, setResetKey] = useState(0);

  const canBackup = methods.includes('backup');

  const clearCode = useCallback(() => {
    setCode('');
    setResetKey((k) => k + 1);
  }, []);

  const setMode = useCallback(
    (m: MfaMode) => {
      setModeState(m);
      clearCode();
      setError(undefined);
    },
    [clearCode],
  );

  // Cuenta atrás: un tic por segundo mientras haya bloqueo.
  const locked = lockedFor > 0;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockedFor((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const submit = useCallback(
    async (value?: string) => {
      const v = (value ?? code).trim();
      if (submitting || lockedFor > 0 || !isCodeComplete(mode, v)) return;
      setSubmitting(true);
      setError(undefined);
      try {
        const data = await verifyMfa({ challenge, code: v });
        onDone(data);
      } catch (err) {
        const body =
          err instanceof ApiError
            ? (err.body as { code?: string; error?: string; retryAfter?: number } | null)
            : null;
        if (err instanceof ApiError && err.status === 429) {
          setLockedFor(Math.max(1, Number(body?.retryAfter) || 1));
          clearCode();
        } else if (body?.code === 'MFA_CHALLENGE_EXPIRED') {
          onExpired();
        } else if (body?.code === 'MFA_INVALID') {
          setError(t('auth.mfa.invalid'));
          clearCode();
        } else if (err instanceof ApiError && err.status !== 0) {
          setError(body?.error || t('auth.mfa.invalid'));
          clearCode();
        } else {
          setError(t('app.login.connectionError'));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [challenge, clearCode, code, lockedFor, mode, onDone, onExpired, submitting, t],
  );

  return {
    mode,
    setMode,
    canBackup,
    resetKey,
    code,
    setCode,
    error,
    submitting,
    lockedFor,
    submit,
  };
}

export type MfaStepState = ReturnType<typeof useMfaStep>;
