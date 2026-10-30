import { createContext, useContext } from 'react';

/**
 * Estado de la mensajería que necesita el resto de la app (botón del header,
 * página de Mensajes) sin estar dentro del `ChatProvider`. Lo da
 * `MessagingProvider`.
 */

export type MessagingPhase = 'off' | 'loading' | 'ready' | 'disabled' | 'error';

/** Resultado de una carga, ligado a la sesión (usuario, empresa, intento) que la pidió. */
export interface MessagingStatus {
  key: string;
  phase: 'ready' | 'disabled' | 'error';
}

export interface MessagingContextValue {
  /** Flag de la empresa + permiso `/messaging` + sesión iniciada. */
  enabled: boolean;
  /** Identifica la sesión de mensajería actual: cambia con usuario, empresa o reintento. */
  sessionKey: string;
  phase: MessagingPhase;
  setStatus: (status: MessagingStatus) => void;
  unread: number;
  setUnread: (n: number) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Nodo de la página de Mensajes donde el host pinta el chat. */
  pageTarget: HTMLElement | null;
  setPageTarget: (el: HTMLElement | null) => void;
  retry: () => void;
}

export const MessagingContext = createContext<MessagingContextValue | null>(null);

export function useMessaging(): MessagingContextValue {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging debe usarse dentro de <MessagingProvider>');
  return ctx;
}
