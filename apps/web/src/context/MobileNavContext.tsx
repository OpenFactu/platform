import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTabs } from './TabsContext';

interface MobileNavContextType {
  /** El drawer/sidebar móvil está abierto. */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const MobileNavContext = createContext<MobileNavContextType | undefined>(undefined);

/**
 * Estado global del drawer móvil (sidebar oculto por defecto en < md,
 * visible mediante hamburguesa o bottom-nav "Menú"). Se cierra
 * automáticamente al cambiar de pestaña activa para no tapar contenido.
 */
export const MobileNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Cierre automático al navegar — evita que el drawer quede abierto
  // tras seleccionar un módulo.
  const { activeTabId } = useTabs();
  useEffect(() => {
    setOpen(false);
  }, [activeTabId]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </MobileNavContext.Provider>
  );
};

export const useMobileNav = (): MobileNavContextType => {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav must be used within MobileNavProvider');
  return ctx;
};
