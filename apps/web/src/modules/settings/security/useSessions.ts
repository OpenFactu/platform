import { useCallback, useEffect, useState } from 'react';
import { securityApi, type SessionInfo } from './api';

/** Sesiones abiertas de la cuenta, con cerrar una o todas las demás. */
export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSessions(await securityApi.listSessions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    securityApi
      .listSessions()
      .then((list) => live && setSessions(list))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const revoke = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await securityApi.revokeSession(id);
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [reload],
  );

  /** Devuelve cuántas sesiones se cerraron. */
  const revokeOthers = useCallback(async () => {
    setBusy(true);
    try {
      return (await securityApi.revokeOthers()).revoked;
    } finally {
      setBusy(false);
      await reload();
    }
  }, [reload]);

  return { sessions, loading, error, busy, reload, revoke, revokeOthers };
}
