import React, { useState } from 'react';
import { Button } from '@openfactu/ui';
import { BellRing, CheckCircle2, ChevronDown, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { intlLocale } from '@/i18n/i18n';
import type { AuthEventInfo } from './api';
import { useAuthHistory } from './useAuthHistory';
import { eventKindLabel, eventMethodLabel, eventTone } from './authEventLabels';
import { relativeTime, summarizeUserAgent } from './sessionLabels';
import {
  SecurityCard,
  SecurityLoading,
  SecurityNote,
  SecurityRow,
  SecurityRows,
} from './SecurityCard';

/** Los más recientes de entrada; el resto, a tandas con «Ver más». */
const FIRST_PAGE = 8;
const NEXT_PAGE = 15;

/** Lista de eventos con icono de éxito o fallo; la usan la tarjeta propia y la ficha del usuario. */
export const AuthHistoryList: React.FC<{ events: AuthEventInfo[]; flush?: boolean }> = ({
  events,
  flush,
}) => {
  const { t } = useI18n();
  const [shown, setShown] = useState(FIRST_PAGE);

  const device = (e: AuthEventInfo) => {
    const { browser, os } = summarizeUserAgent(e.userAgent);
    if (browser && os) return t('auth.sessions.browserOn', { browser, os });
    if (browser || os) return (browser ?? os) as string;
    return e.clientKind
      ? t(e.clientKind.startsWith('desktop') ? 'auth.sessions.desktop' : 'auth.sessions.unknown')
      : null;
  };

  const icon = (e: AuthEventInfo) => {
    const tone = eventTone(e.kind, e.ok);
    if (tone === 'notice') return <BellRing size={16} aria-label={t('auth.history.notice')} />;
    if (tone === 'ok')
      return <CheckCircle2 size={16} className="text-success" aria-label={t('auth.history.ok')} />;
    return <XCircle size={16} className="text-danger" aria-label={t('auth.history.failed')} />;
  };

  const rest = events.length - shown;

  return (
    <>
      <SecurityRows label={t('auth.history.title')} flush={flush}>
        {events.slice(0, shown).map((e) => (
          <SecurityRow
            key={e.id}
            icon={icon(e)}
            title={eventKindLabel(t, e.kind, e.ok)}
            meta={[eventMethodLabel(t, e.method), device(e), e.ip].filter(Boolean).join(' · ')}
            trailing={
              <span
                className="text-xs text-fg-subtle whitespace-nowrap"
                title={new Date(e.at).toLocaleString(intlLocale())}
              >
                {relativeTime(e.at, intlLocale())}
              </span>
            }
          />
        ))}
      </SecurityRows>
      {rest > 0 && (
        <div className={`border-t border-border-subtle py-3 ${flush ? '' : 'px-6'}`}>
          <Button
            variant="link"
            size="sm"
            className="gap-1 px-0"
            onClick={() => setShown((n) => n + NEXT_PAGE)}
          >
            <ChevronDown size={14} />
            {t('auth.history.more', { count: Math.min(rest, NEXT_PAGE) })}
          </Button>
        </div>
      )}
    </>
  );
};

/** «Historial de accesos» de la cuenta, en Seguridad. */
export const AuthHistoryCard: React.FC = () => {
  const { t } = useI18n();
  const { events, loading, error } = useAuthHistory();
  return (
    <SecurityCard title={t('auth.history.title')} description={t('auth.history.help')}>
      {loading ? (
        <SecurityLoading />
      ) : error ? (
        <SecurityNote hint={error}>{t('auth.history.error')}</SecurityNote>
      ) : events.length === 0 ? (
        <SecurityNote>{t('auth.history.empty')}</SecurityNote>
      ) : (
        <AuthHistoryList events={events} />
      )}
    </SecurityCard>
  );
};
