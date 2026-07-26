import React, { useEffect } from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@openfactu/ui';
import { DriverApp } from '@/modules/logistics/pages/DriverApp';
import { useAuth } from '@/context/AuthContext';

/**
 * Layout mínimo para usuarios con rol DRIVER. Sin sidebar ni tabs.
 * Solo la app del repartidor con un pequeño header para cerrar sesión.
 */
export const DriverLayout: React.FC = () => {
  const { user, logout } = useAuth();

  useEffect(() => {
    // Si en algún momento el driver llega con una URL distinta de /driver,
    // el router interno la reduce al inicio.
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-100">{user?.username}</span>{' '}
          <span className="text-slate-500">· repartidor</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={logout} title="Cerrar sesión">
          <LogOut size={14} /> Salir
        </Button>
      </header>
      <div className="flex-1 min-h-0">
        <MemoryRouter initialEntries={['/driver']}>
          <Routes>
            <Route path="/driver" element={<DriverApp />} />
            <Route path="*" element={<Navigate to="/driver" replace />} />
          </Routes>
        </MemoryRouter>
      </div>
    </div>
  );
};
