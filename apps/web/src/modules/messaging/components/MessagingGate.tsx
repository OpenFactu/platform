import React from 'react';
import { MessageSquareOff, WifiOff } from 'lucide-react';
import { Button, EmptyState, Loader } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useMessaging } from '../context/messagingState';

/** Pinta las páginas de la mensajería cuando está lista; si no, por qué no lo está. */
export const MessagingGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  const { phase, retry } = useMessaging();

  if (phase === 'ready') return <>{children}</>;
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
