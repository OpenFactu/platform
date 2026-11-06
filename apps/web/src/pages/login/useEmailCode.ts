/**
 * Entrar con un código por correo. En la web se escribe el código; en el escritorio el correo
 * solo lleva el enlace (que aprueba un handoff) y aquí se espera a que lo aprueben.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { getClientKind } from '@/shared/auth/clientKind';
import {
  createHandoff,
  requestEmailCode,
  verifyEmailCode,
  type HandoffTicket,
  type LoginResult,
} from './loginApi';
import { useHandoffWait } from './useHandoffWait';

export const RESEND_SECONDS = 60;

export const isEmailCodeComplete = (code: string) => /^\d{6}$/.test(code);

/** Segundos que quedan, con un tic por segundo mientras haya cuenta atrás. */
function useCountdown(initial: number) {
  const [seconds, setSeconds] = useState(initial);
  const running = seconds > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return [seconds, setSeconds] as const;
}

interface Params {
  email: string;
  tenantId?: string;
  onDone: (data: LoginResult) => void;
}

export function useEmailCode({ email, tenantId, onDone }: Params) {
  const { t } = useI18n();
  const desktop = getClientKind() === 'desktop';
  const [handoff, setHandoff] = useState<HandoffTicket | null>(null);
  const [code, setCode] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [lockedFor, setLockedFor] = useCountdown(0);
  const [resendIn, setResendIn] = useCountdown(RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  /** Pide el correo (y, en el escritorio, un handoff nuevo que sustituye al anterior). */
  const send = useCallback(async () => {
    setSending(true);
    setError(undefined);
    try {
      let handoffId: string | undefined;
      if (desktop) {
        const ticket = await createHandoff();
        setHandoff(ticket);
        handoffId = ticket.handoffId;
      }
      await requestEmailCode({ email, handoffId });
      setResendIn(RESEND_SECONDS);
    } catch {
      setError(t('auth.email.sendFailed'));
    } finally {
      setSending(false);
    }
  }, [desktop, email, setResendIn, t]);

  // Una sola vez al abrir el paso: reentrar no manda un segundo correo.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  const handleExpired = useCallback(() => {
    setHandoff(null);
    setError(t('auth.handoff.expired'));
  }, [t]);

  useHandoffWait({ handoff, onApproved: onDone, onExpired: handleExpired });

  const submit = useCallback(
    async (value?: string) => {
      const v = (value ?? code).trim();
      if (submitting || lockedFor > 0 || !isEmailCodeComplete(v)) return;
      setSubmitting(true);
      setError(undefined);
      try {
        onDone(await verifyEmailCode({ email, code: v, tenantId: tenantId || undefined }));
      } catch (err) {
        const body = err instanceof ApiError ? (err.body as { retryAfter?: number } | null) : null;
        if (err instanceof ApiError && err.status === 429) {
          setLockedFor(Math.max(1, Number(body?.retryAfter) || 1));
        } else if (err instanceof ApiError && err.status !== 0) {
          setError(t('auth.email.invalid'));
        } else {
          setError(t('app.login.connectionError'));
        }
        // Vacía las casillas y devuelve el foco a la primera.
        setCode('');
        setResetKey((k) => k + 1);
      } finally {
        setSubmitting(false);
      }
    },
    [code, email, lockedFor, onDone, setLockedFor, submitting, t, tenantId],
  );

  return {
    desktop,
    handoff,
    code,
    setCode,
    resetKey,
    error,
    submitting,
    sending,
    lockedFor,
    resendIn,
    canResend: resendIn === 0 && !sending,
    resend: send,
    submit,
  };
}

export type EmailCodeState = ReturnType<typeof useEmailCode>;
