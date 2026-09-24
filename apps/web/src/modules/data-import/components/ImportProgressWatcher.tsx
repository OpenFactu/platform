import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useImportJobToast } from '../hooks/useImportJobToast';

/**
 * Componente sin interfaz: solo existe para colgar `useImportJobToast` del
 * layout, de modo que el aviso de progreso de una importación sobreviva a
 * cambiar de pantalla.
 *
 * Va condicionado al rol porque el importador es de administración: para
 * cualquier otro usuario no hay trabajos que seguir y `/jobs/active`
 * respondería 403 en cada carga de la aplicación.
 */
export const ImportProgressWatcher: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  if (!isAdmin) return null;
  return <ImportJobToastHost />;
};

const ImportJobToastHost: React.FC = () => {
  useImportJobToast();
  return null;
};
