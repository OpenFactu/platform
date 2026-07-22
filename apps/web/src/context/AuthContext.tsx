import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/shared/http';

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
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        } else {
          // Token expirado o inválido
          localStorage.removeItem('openfactu_token');
          setToken(null);
        }
      } catch (err) {
        console.error('Error fetching auth status', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMe();
  }, [token]);

  const refreshUser = async () => {
    if (!token) return;
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUser(await res.json());
  };

  const login = (newToken: string, userData: User) => {
    localStorage.setItem('openfactu_token', newToken);
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
    const res = await fetch('/api/auth/switch-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenantId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error al cambiar de empresa' }));
      throw new Error(err.error || 'Error al cambiar de empresa');
    }
    const data = await res.json();
    localStorage.setItem('openfactu_token', data.token);
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
