import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentTab } from '@/context/TabsContext';

/**
 * Volver a la pantalla anterior de esta pestaña. Cada pestaña lleva su propio historial, y
 * una abierta directamente (desde el menú, o restaurada al recargar) no tiene anterior:
 * `navigate(-1)` no haría nada, así que entonces se cierra, como la flecha de siempre.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  const { close } = useCurrentTab();
  // La primera entrada del historial de una pestaña es la única con esta clave.
  const isFirstEntry = key === 'default';
  return useCallback(() => {
    if (isFirstEntry) close();
    else navigate(-1);
  }, [isFirstEntry, close, navigate]);
}
