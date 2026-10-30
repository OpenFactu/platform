import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { PageLoading } from './PageLoading';

/**
 * Pantalla de arranque (comprobar instalación y sesión): el mismo cargador
 * discreto que al cambiar de pantalla, a toda la vista y con el nombre de la
 * empresa encima del spinner.
 */
export const BootLoader: React.FC = () => {
  const { branding } = useTheme();
  return <PageLoading fullScreen label={branding.appName || 'Keirost'} />;
};
