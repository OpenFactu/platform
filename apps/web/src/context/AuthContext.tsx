import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/shared/http';
import { authApi } from '@/shared/api';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
  permissions?: Record<string, { read: boolean; write: boolean; delete: boolean }>;
  avatarImageUrl?: string | null;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('openfactu_token'));
  const [loading, setLoading] = useState(true);

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

  const logout = useCallback(() => {
    localStorage.removeItem('openfactu_token');
    setToken(null);
    setUser(null);
  }, []);

  // Empuja el estado de auth al cliente HTTP central (único dueño de fetch).
  useEffect(() => {
    apiClient.setAuth(token, user?.tenantId ?? null);
  }, [token, user?.tenantId]);

  // Manejo global de 401: cualquier petición autenticada que devuelva 401 cierra sesión.
  useEffect(() => {
    apiClient.setOnUnauthorized(() => logout());
    return () => apiClient.setOnUnauthorized(null);
  }, [logout]);

  const switchTenant = async (tenantId: string) => {
    if (!token) throw new Error('No autenticado');
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
