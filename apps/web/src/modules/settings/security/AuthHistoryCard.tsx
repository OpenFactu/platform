import React from 'react';
import { Card, EmptyState, List, ListItem, Spinner } from '@openfactu/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { intlLocale } from '@/i18n/i18n';
import type { AuthEventInfo } from './api';
import { useAuthHistory } from './useAuthHistory';
import { eventKindLabel, eventMethodLabel } from './authEventLabels';
import { relativeTime, summarizeUserAgent } from './sessionLabels';

/** Lista de eventos con icono de éxito o fallo; la usan la tarjeta propia y la ficha del usuario. */
export const AuthHistoryList: React.FC<{ events: AuthEventInfo[] }> = ({ events }) => {
  const { t } = useI18n();

  const device = (e: AuthEventInfo) => {
    const { browser, os } = summarizeUserAgent(e.userAgent);
    if (browser && os) return t('auth.sessions.browserOn', { browser, os });
    if (browser || os) return (browser ?? os) as string;
    return e.clientKind
      ? t(e.clientKind.startsWith('desktop') ? 'auth.sessions.desktop' : 'auth.sessions.unknown')
      : null;
  };

  return (
    <List aria-label={t('auth.history.title')}>
      {events.map((e) => (
        <ListItem
          key={e.id}
          icon={
            e.ok ? (
              <CheckCircle2 size={16} className="text-success" aria-label={t('auth.history.ok')} />
            ) : (
              <XCircle size={16} className="text-danger" aria-label={t('auth.history.failed')} />
            )
          }
          title={eventKindLabel(t, e.kind)}
          subtitle={[eventMethodLabel(t, e.method), device(e), e.ip].filter(Boolean).join(' · ')}
          meta={
            <span
              className="text-[11px] text-fg-muted whitespace-normal text-right"
              title={new Date(e.at).toLocaleString(intlLocale())}
            >
              {relativeTime(e.at, intlLocale())}
            </span>
          }
        />
      ))}
    </List>
  );
};

/** «Historial de accesos» de la cuenta, en Seguridad. */
export const AuthHistoryCard: React.FC = () => {
  const { t } = useI18n();
  const { events, loading, error } = useAuthHistory();
  return (
    <Card className="p-4 sm:p-6 space-y-4 border-border-subtle">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle">
          {t('auth.history.title')}
        </h2>
        <p className="text-[11px] text-fg-muted max-w-md">{t('auth.history.help')}</p>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title={t('auth.history.error')} hint={error} variant="compact" />
      ) : events.length === 0 ? (
        <EmptyState title={t('auth.history.empty')} variant="compact" />
      ) : (
        <AuthHistoryList events={events} />
      )}
    </Card>
  );
};
