import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/http';
import { myEventsApi, userAccessApi, type AuthEventInfo } from './api';

/**
 * Historial de accesos: el propio (sin `userId`) o el de un usuario de la empresa.
 * `notFound` es un 404 (p. ej. un superusuario visto por un administrador): no es un error.
 */
export function useAuthHistory(userId?: string) {
  const [events, setEvents] = useState<AuthEventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchEvents = useCallback(
    () => (userId ? userAccessApi.events(userId) : myEventsApi.events()),
    [userId],
  );

  const apply = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) setNotFound(true);
    else setError(err instanceof Error ? err.message : String(err));
  }, []);

  const reload = useCallback(async () => {
    try {
      setEvents(await fetchEvents());
      setError(null);
      setNotFound(false);
    } catch (err) {
      apply(err);
    }
  }, [fetchEvents, apply]);

  // Al cambiar de usuario hay que remontar el componente (`key`): aquí no se reinicia el estado.
  useEffect(() => {
    let live = true;
    fetchEvents()
      .then((list) => live && setEvents(list))
      .catch((err) => live && apply(err))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [fetchEvents, apply]);

  return { events, loading, error, notFound, reload };
}
