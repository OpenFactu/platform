import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface PermittedRouteProps {
  path: string;
  children: React.ReactElement;
}

export const PermittedRoute: React.FC<PermittedRouteProps> = ({ path, children }) => {
  const { user } = useAuth();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // Rutas del cockpit/sistema solo son accesibles al rol SUPERUSER. El backend
  // también rechaza al resto con 403, pero así evitamos montar la página en UI.
  if (normalizedPath.startsWith('/system/')) {
    return user?.role === 'SUPERUSER' ? children : <Navigate to="/" replace />;
  }
  if (user?.role === 'SUPERUSER' || user?.role === 'ADMIN') return children;
  // El rol de conductor ya implica su app, como en el servidor.
  if (normalizedPath === '/driver' && user?.role === 'DRIVER') return children;
  if (user?.permissions?.[normalizedPath]?.read) return children;
  return <Navigate to="/" replace />;
};
