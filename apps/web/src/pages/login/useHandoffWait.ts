/** Sondea un handoff cada 2 s hasta que lo aprueban o caduca. Lo usan el correo y el SSO. */
import { useEffect, useRef } from 'react';
import { ApiError } from '@/shared/http';
import { pollHandoff, type HandoffPoll, type HandoffTicket, type LoginResult } from './loginApi';

const POLL_MS = 2000;

/** `pending` y `expired` son los únicos cuerpos con `status`; el resto es el login normal. */
export const pollState = (r: HandoffPoll): 'pending' | 'expired' | 'approved' => {
  const status = (r as { status?: string }).status;
  return status === 'pending' || status === 'expired' ? status : 'approved';
};

/** Espera tras un 429: lo que pide el servidor, y nunca menos de un sondeo normal. */
export const backoffMs = (retryAfter: unknown): number =>
  Math.max(POLL_MS, (Number(retryAfter) || 0) * 1000);

interface Params {
  /** Sin handoff no se sondea. */
  handoff: Pick<HandoffTicket, 'handoffId' | 'pollSecret'> | null;
  onApproved: (data: LoginResult) => void;
  onExpired: () => void;
}

export function useHandoffWait({ handoff, onApproved, onExpired }: Params) {
  // Los avisos van por ref: que cambien no reinicia el sondeo.
  const approved = useRef(onApproved);
  const expired = useRef(onExpired);
  useEffect(() => {
    approved.current = onApproved;
    expired.current = onExpired;
  });

  const id = handoff?.handoffId;
  const secret = handoff?.pollSecret;

  useEffect(() => {
    if (!id || !secret) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, ms);
    };
    async function tick() {
      try {
        const r = await pollHandoff({ handoffId: id!, pollSecret: secret! });
        if (stopped) return;
        const state = pollState(r);
        if (state === 'pending') return next(POLL_MS);
        stopped = true;
        if (state === 'expired') expired.current();
        else approved.current(r as LoginResult);
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && err.status === 429) {
          const body = err.body as { retryAfter?: number } | null;
          return next(backoffMs(body?.retryAfter));
        }
        // Un fallo de red o del servidor es pasajero; un 4xx dice que el handoff ya no vale.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          stopped = true;
          return expired.current();
        }
        next(POLL_MS);
      }
    }
    next(POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, secret]);
}
