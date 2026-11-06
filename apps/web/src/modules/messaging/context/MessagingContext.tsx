import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { canRead } from '@/modules/permissions';
import { MessagingContext, type MessagingPhase, type MessagingStatus } from './messagingState';

/**
 * El `ChatProvider` vive en `MessagingHost`, al lado de `MainLayout` y no
 * envolviéndolo: se monta cuando ya hay datos, y montarlo alrededor del layout
 * lo remontaría entero (pestañas incluidas). La página y el panel lateral
 * pintan el chat dentro de ese host mediante un portal; este provider es lo
 * que comparten todos.
 */
export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { flags } = useTheme();
  const [status, setStatus] = useState<MessagingStatus | null>(null);
  const [unread, setUnread] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pageTarget, setPageTarget] = useState<HTMLElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focusConversation, setFocusConversation] = useState<string | null>(null);

  const enabled =
    isAuthenticated && Boolean(user) && flags.messagingEnabled && canRead(user, '/messaging');
  const sessionKey = `${user?.id ?? ''}:${user?.tenantId ?? ''}:${attempt}`;
  // Mientras la carga de esta sesión no responde, está cargando; una respuesta
  // de una sesión anterior (otra empresa, otro intento) no cuenta.
  const phase: MessagingPhase = !enabled
    ? 'off'
    : status?.key === sessionKey
      ? status.phase
      : 'loading';

  const value = useMemo(
    () => ({
      enabled,
      sessionKey,
      phase,
      setStatus,
      unread: phase === 'ready' ? unread : 0,
      setUnread,
      drawerOpen: phase === 'ready' && drawerOpen,
      setDrawerOpen,
      pageTarget,
      setPageTarget,
      focusConversation,
      setFocusConversation,
      retry: () => setAttempt((n) => n + 1),
    }),
    [enabled, sessionKey, phase, unread, drawerOpen, pageTarget, focusConversation],
  );
  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
};
