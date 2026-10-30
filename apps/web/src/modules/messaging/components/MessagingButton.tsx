import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useTabs } from '@/context/TabsContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useMessaging } from '../context/messagingState';

/**
 * Botón del header con los no leídos. En escritorio abre el chat en el panel
 * lateral; en móvil va a la página de Mensajes, que ocupa toda la pantalla
 * (el panel en un teléfono es una cabecera vacía y márgenes que roban sitio).
 */
export const MessagingButton: React.FC = () => {
  const { t } = useI18n();
  const { openTab } = useTabs();
  const mobile = useIsMobile();
  const { phase, unread, setDrawerOpen } = useMessaging();
  if (phase !== 'ready') return null;

  const label = unread ? t('messaging.openWithUnread', { count: unread }) : t('messaging.open');
  return (
    <button
      type="button"
      onClick={() => (mobile ? openTab('/messaging') : setDrawerOpen(true))}
      className="relative p-2 rounded-xs text-fg-muted hover:text-accent hover:bg-bg-hover transition-colors"
      aria-label={label}
      title={label}
    >
      <MessageSquare size={20} />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-fg text-[10px] font-semibold leading-4 text-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
};
