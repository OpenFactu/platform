/** Estado del segundo paso del login: código o passkey, modo, errores y cuenta atrás. */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { authenticateWithPasskey, passkeysSupported } from '@/shared/auth/webauthn';
import { passkeyOptions, verifyMfa, verifyMfaPasskey, type LoginResult } from './loginApi';

export type MfaMode = 'totp' | 'backup' | 'passkey';

export interface MfaStepParams {
  challenge: string;
  methods: string[];
  /** Su passkey es de otro origen y no queda otro método aquí. */
  passkeyElsewhere?: boolean;
  passkeyRpIds?: string[];
  onDone: (data: LoginResult) => void;
  onExpired: () => void;
}

/** Un código completo: 6 dígitos (app) u 8 alfanuméricos (respaldo, sin el guion). */
export const isCodeComplete = (mode: MfaMode, code: string) =>
  mode === 'totp'
    ? /^\d{6}$/.test(code)
    : mode === 'backup'
      ? /^[A-Za-z0-9]{8}$/.test(code)
      : false;

/** Una passkey de `localhost` es la de la app de escritorio; otra, de otro dispositivo. */
export const passkeyElsewhereKind = (rpIds: string[] | undefined): 'desktop' | 'device' =>
  rpIds?.includes('localhost') ? 'desktop' : 'device';

/** Modo con el que arranca el paso: la app si la hay, si no la passkey. */
export const initialMode = (methods: string[], passkeyUsable: boolean): MfaMode =>
  methods.includes('totp') || !passkeyUsable ? 'totp' : 'passkey';

export function useMfaStep({
  challenge,
  methods,
  passkeyElsewhere,
  passkeyRpIds,
  onDone,
  onExpired,
}: MfaStepParams) {
  const { t } = useI18n();
  const canPasskey = methods.includes('passkey') && passkeysSupported();
  const [mode, setModeState] = useState<MfaMode>(() => initialMode(methods, canPasskey));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  // Sube al vaciar el código tras un fallo: la vista remonta las casillas y el foco vuelve a la primera.
  const [resetKey, setResetKey] = useState(0);

  const canBackup = methods.includes('backup');
  const canTotp = methods.includes('totp');

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

  const fail = useCallback(
    (err: unknown) => {
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
    },
    [clearCode, onExpired, t],
  );

  const submit = useCallback(
    async (value?: string) => {
      const v = (value ?? code).trim();
      if (submitting || lockedFor > 0 || !isCodeComplete(mode, v)) return;
      setSubmitting(true);
      setError(undefined);
      try {
        onDone(await verifyMfa({ challenge, code: v }));
      } catch (err) {
        fail(err);
      } finally {
        setSubmitting(false);
      }
    },
    [challenge, code, fail, lockedFor, mode, onDone, submitting],
  );

  /** Lanza el diálogo del sistema y cierra el paso con la passkey. */
  const signInWithPasskey = useCallback(async () => {
    if (submitting || lockedFor > 0) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const { options, challenge: webauthn } = await passkeyOptions(challenge);
      const response = await authenticateWithPasskey(options);
      if (!response) return; // cancelado: sin aviso
      onDone(await verifyMfaPasskey({ challenge, passkey: { challenge: webauthn, response } }));
    } catch (err) {
      if (err instanceof ApiError) fail(err);
      else setError(t('auth.passkey.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [challenge, fail, lockedFor, onDone, submitting, t]);

  return {
    mode,
    setMode,
    canBackup,
    canTotp,
    canPasskey,
    elsewhere: passkeyElsewhere ? passkeyElsewhereKind(passkeyRpIds) : null,
    resetKey,
    code,
    setCode,
    error,
    submitting,
    lockedFor,
    submit,
    signInWithPasskey,
  };
}

export type MfaStepState = ReturnType<typeof useMfaStep>;
