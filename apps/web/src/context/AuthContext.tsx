import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError, decodeTenantId } from '@/shared/http';
import { authApi } from '@/shared/api';
import { t as tNow, setLocale } from '@/i18n/i18n';
import { msUntilRefresh } from '@/shared/auth/sessionToken';
import { TenantChangedNotice } from '@/components/TenantChangedNotice';

/** Entre renovaciones, y tras un fallo de red, no se vuelve a intentar antes de esto. */
const MIN_REFRESH_DELAY_MS = 30_000;
/** setTimeout no admite más de 2^31 ms. */
const MAX_TIMER_MS = 2_000_000_000;

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
  permissions?: Record<string, { read: boolean; write: boolean; delete: boolean }>;
  avatarImageUrl?: string | null;
  locale?: string | null;
  themePreset?: string | null;
  themeMode?: 'light' | 'dark' | null;
  /** `mfa_setup`: la empresa exige el 2FA y esta sesión aún no lo tiene; solo puede darlo de alta. */
  restricted?: 'mfa_setup' | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
  /** Vuelve a pedir /api/auth/me — útil tras editar el propio perfil (p.ej. la foto). */
  refreshUser: () => Promise<void>;
  /** Cambia datos del usuario en memoria, sin esperar a /me (p.ej. el tema, que se ve al momento). */
  patchUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('openfactu_token'));
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  // La sesión es una por navegador: si otra pestaña cambia de empresa, esta sigue pidiendo la
  // vieja y el servidor contesta 403 SWITCH_TENANT_REQUIRED. Se avisa y se recarga en la nueva.
  const [tenantChangedElsewhere, setTenantChangedElsewhere] = useState(false);

  useEffect(() => {
    const fetchMe = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await authApi.me();
        setUser(userData);
      } catch (err) {
        if (err instanceof ApiError && err.status !== 0) {
          // Token expirado o inválido
          localStorage.removeItem('openfactu_token');
          setToken(null);
        } else {
          console.error('Error fetching auth status', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMe();
  }, [token]);

  const refreshUser = async () => {
    if (!token) return;
    try {
      setUser(await authApi.me());
    } catch {
      /* mantener el usuario anterior si falla el refresh */
    }
  };

  const patchUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const login = (newToken: string, userData: User) => {
    localStorage.setItem('openfactu_token', newToken);
    // Empujar el token al cliente HTTP ya mismo: si esperamos al useEffect de
    // más abajo, cualquier otro efecto que dependa de `token` (fetchMe aquí
    // mismo, notificaciones, user-tables...) puede disparar su petición ANTES
    // de que apiClient tenga el token nuevo, y le llega un 401 que se
    // interpreta como "token inválido" — cerrando la sesión recién creada.
    apiClient.setAuth(newToken, userData.tenantId ?? null);
    setToken(newToken);
    setUser(userData);
  };

  // Cierre local: borra el token sin avisar al servidor (su sesión ya está revocada o caducada).
  const clearSession = useCallback(() => {
    localStorage.removeItem('openfactu_token');
    setToken(null);
    setUser(null);
  }, []);

  // Cierre voluntario: primero revoca la sesión en el servidor y luego borra el token.
  // Si el servidor no contesta, el cierre local se hace igual.
  const logout = useCallback(() => {
    void authApi
      .logout()
      .catch(() => undefined)
      .finally(clearSession);
  }, [clearSession]);

  // Renueva el token al pasar la mitad de su vida; la sesión del servidor se desliza.
  useEffect(() => {
    if (!token) return;
    const wait = msUntilRefresh(token);
    if (wait === null) return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        try {
          const { token: fresh } = await authApi.refresh();
          if (cancelled || !fresh) return;
          const freshTenant = decodeTenantId(fresh);
          if (user?.tenantId && freshTenant && freshTenant !== user.tenantId) {
            setTenantChangedElsewhere(true);
            return;
          }
          localStorage.setItem('openfactu_token', fresh);
          apiClient.setAuth(fresh, null);
          setToken(fresh);
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 401) clearSession();
          // Sin red u otro fallo: se reintenta en el siguiente ciclo (token sin cambios).
          else setRetry((n) => n + 1);
        }
      },
      Math.min(Math.max(wait, MIN_REFRESH_DELAY_MS), MAX_TIMER_MS),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, retry, clearSession, user?.tenantId]);

  // El idioma va con la persona: si lo eligió en su perfil, manda sobre el del navegador.
  useEffect(() => {
    if (user?.locale) setLocale(user.locale);
  }, [user?.locale]);

  // Empuja el estado de auth al cliente HTTP central (único dueño de fetch).
  useEffect(() => {
    apiClient.setAuth(token, user?.tenantId ?? null);
  }, [token, user?.tenantId]);

  // Manejo global de 401 (SESSION_REVOKED, SESSION_EXPIRED, token inválido): cierre local,
  // sin llamar al servidor.
  useEffect(() => {
    apiClient.setOnUnauthorized(() => clearSession());
    return () => apiClient.setOnUnauthorized(null);
  }, [clearSession]);

  useEffect(() => {
    apiClient.setOnTenantMismatch(() => setTenantChangedElsewhere(true));
    return () => apiClient.setOnTenantMismatch(null);
  }, []);

  // Otra pestaña guardó un token de otra empresa: avisar antes de que esta pida nada.
  useEffect(() => {
    const current = user?.tenantId;
    if (!current) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'openfactu_token' || !e.newValue) return;
      const next = decodeTenantId(e.newValue);
      if (next && next !== current) setTenantChangedElsewhere(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.tenantId]);

  const switchTenant = async (tenantId: string) => {
    if (!token) throw new Error(tNow('app.common.notAuthenticated'));
    const data = await authApi.switchTenant(tenantId);
    localStorage.setItem('openfactu_token', data.token);
    // Mismo motivo que en login(): empujar el token antes de que los efectos
    // dependientes de `token` disparen sus peticiones.
    apiClient.setAuth(data.token, data.user.tenantId ?? null);
    setToken(data.token);
    setUser(data.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        loading,
        login,
        logout,
        switchTenant,
        refreshUser,
        patchUser,
      }}
    >
      {children}
      <TenantChangedNotice open={tenantChangedElsewhere} />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
