import { useCallback, useState } from 'react';
import { authApi } from '@/shared/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Salir de la pantalla de alta obligada del segundo factor: se vuelve a pedir `/me` y,
 * si el servidor ya no restringe la sesión, `refreshUser` deja pasar al ERP.
 */
export function useMfaSetup() {
  const { refreshUser, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [stillRestricted, setStillRestricted] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setStillRestricted(false);
    try {
      const me = await authApi.me();
      if (me.restricted) setStillRestricted(true);
      else await refreshUser();
    } catch {
      setStillRestricted(true);
    } finally {
      setChecking(false);
    }
  }, [refreshUser]);

  return { check, checking, stillRestricted, logout };
}
