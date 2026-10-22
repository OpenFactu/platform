import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/shared/http';
import { timeclockTerminalApi, type KioskConfig } from '../api/timeclockTerminalApi';
import type { IdentificationView, TimeclockEntry } from '../domain/timeclock';
import { newTimeclockRequestId } from '../domain/timeclockRequestId';

export function useKioskIdentification(config: KioskConfig) {
  const api = useMemo(() => timeclockTerminalApi(config), [config]);
  const [identification, setIdentification] = useState<IdentificationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    eventId?: string;
  } | null>(null);
  const active = useRef<IdentificationView | null>(null);
  const working = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const ignored = useRef(new Set<string>());
  const pausedUntil = useRef(0);
  const lastReaderEvent = useRef('');
  const accept = useCallback((value: IdentificationView | null) => {
    active.current = value;
    setIdentification(value);
  }, []);
  const operationId = (key: string) => {
    if (pending.current?.key !== key) pending.current = { key, id: newTimeclockRequestId() };
    return pending.current.id;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // This is an operation counter, not a DOM ref; invalidate the latest generation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!config.token || !config.tenant) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = generation.current;
      if (!document.hidden && !working.current && Date.now() > pausedUntil.current) {
        if (pausedUntil.current) {
          pausedUntil.current = 0;
          setFeedback(null);
        }
        if (active.current && new Date(active.current.expiresAt).getTime() <= Date.now()) {
          ignored.current.add(active.current.identificationId);
          accept(null);
          pending.current = null;
          setFeedback({ ok: false, message: 'Identificación caducada. Vuelve a identificarte.' });
        }
        if (!active.current)
          try {
            const value = await api.current(controller.signal);
            if (
              !controller.signal.aborted &&
              version === generation.current &&
              !working.current &&
              value &&
              !ignored.current.has(value.identificationId)
            ) {
              accept(value);
              setFeedback(null);
            } else if (
              !controller.signal.aborted &&
              version === generation.current &&
              !working.current &&
              !active.current
            ) {
              const event = await api.feedback(controller.signal);
              if (
                event &&
                !controller.signal.aborted &&
                version === generation.current &&
                !working.current &&
                !active.current &&
                event.id !== lastReaderEvent.current
              ) {
                lastReaderEvent.current = event.id;
                pausedUntil.current = Date.now() + 3000;
                setFeedback({ ok: false, message: event.message, eventId: event.id });
              }
            }
          } catch (e) {
            if (!controller.signal.aborted && version === generation.current)
              setFeedback({
                ok: false,
                message: e instanceof Error ? e.message : 'No se puede conectar con el kiosco.',
              });
          }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, config, accept]);
  const identify = useCallback(
    async (method: 'pin' | 'qr', value: string) => {
      if (working.current || active.current) return;
      working.current = true;
      setBusy(true);
      setFeedback(null);
      const version = ++generation.current;
      try {
        const found = await api.identify(method, value, operationId(`identify:${method}:${value}`));
        if (mounted.current && generation.current === version) {
          accept(found);
          pending.current = null;
        }
      } catch (e) {
        if (mounted.current && version === generation.current)
          setFeedback({
            ok: false,
            message: e instanceof Error ? e.message : 'No se pudo identificar.',
          });
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) pending.current = null;
      } finally {
        working.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [api, accept],
  );
  const confirm = useCallback(
    async (kind: TimeclockEntry['kind']) => {
      const current = active.current;
      if (!current || working.current) return;
      working.current = true;
      setBusy(true);
      const version = ++generation.current;
      try {
        const result = await api.confirm(
          current.identificationId,
          kind,
          operationId(`punch:${current.identificationId}:${kind}`),
        );
        if (mounted.current && version === generation.current) {
          ignored.current.add(current.identificationId);
          accept(null);
          pending.current = null;
          pausedUntil.current = Date.now() + 3000;
          setFeedback({
            ok: true,
            message: `Fichaje registrado · ${new Date(result.entry.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
          });
        }
      } catch (e) {
        if (mounted.current && version === generation.current) {
          setFeedback({
            ok: false,
            message:
              e instanceof Error ? e.message : 'No se pudo confirmar. Reintenta la misma acción.',
          });
          if (e instanceof ApiError && [401, 403, 404, 409, 410].includes(e.status)) {
            ignored.current.add(current.identificationId);
            accept(null);
            pending.current = null;
            void api.cancel(current.identificationId).catch(() => {});
          }
        }
      } finally {
        working.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [api, accept],
  );
  const cancel = useCallback(async () => {
    const current = active.current;
    if (working.current) return;
    generation.current++;
    pending.current = null;
    accept(null);
    setFeedback(null);
    if (current) {
      ignored.current.add(current.identificationId);
      try {
        await api.cancel(current.identificationId);
      } catch {
        setFeedback({
          ok: false,
          message: 'No se pudo cerrar. Espera a que caduque la identificación.',
        });
      }
    }
    if (ignored.current.size > 100) ignored.current = new Set([...ignored.current].slice(-50));
  }, [api, accept]);
  return { identification, busy, feedback, identify, confirm, cancel };
}
