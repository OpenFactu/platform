import React, { useEffect } from 'react';
import { MessageSquareOff, WifiOff } from 'lucide-react';
import { Button, EmptyState, Loader } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useMessaging } from '../context/messagingState';

/**
 * Página de Mensajes. El chat no se monta aquí: `MessagingHost` lo pinta en
 * este hueco por portal, con el mismo estado que el panel lateral.
 */
export const Messages: React.FC = () => {
  const { t } = useI18n();
  const { phase, setPageTarget, retry } = useMessaging();

  useEffect(() => () => setPageTarget(null), [setPageTarget]);

  if (phase === 'ready') {
    return <div ref={setPageTarget} className="h-full min-h-0" />;
  }
  if (phase === 'disabled' || phase === 'off') {
    return (
      <EmptyState
        icon={<MessageSquareOff size={28} />}
        title={t('messaging.disabled.title')}
        hint={t('messaging.disabled.hint')}
      />
    );
  }
  if (phase === 'error') {
    return (
      <EmptyState
        icon={<WifiOff size={28} />}
        title={t('messaging.error.title')}
        hint={t('messaging.error.hint')}
        action={<Button onClick={retry}>{t('messaging.retry')}</Button>}
      />
    );
  }
  return (
    <div className="h-full flex items-center justify-center">
      <Loader label={t('messaging.loading')} />
    </div>
  );
};
