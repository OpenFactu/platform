import React, { useState } from 'react';
import { Badge, Button, ConfirmDialog, useToast } from '@openfactu/ui';
import { Globe, LogOut, Monitor } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { intlLocale } from '@/i18n/i18n';
import { useSessions } from './useSessions';
import { relativeTime, summarizeUserAgent } from './sessionLabels';
import {
  RowAction,
  SecurityCard,
  SecurityLoading,
  SecurityNote,
  SecurityRow,
  SecurityRows,
} from './SecurityCard';

/** «Sesiones abiertas»: dónde está iniciada la cuenta y cerrar las que sobren. */
export const SessionsCard: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { sessions, loading, error, busy, revoke, revokeOthers } = useSessions();
  const [confirmOthers, setConfirmOthers] = useState(false);
  const others = sessions.filter((s) => !s.current).length;

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : t('auth.sessions.error'));

  const onRevoke = async (id: string) => {
    try {
      await revoke(id);
      toast.success(t('auth.sessions.closed'));
    } catch (err) {
      fail(err);
    }
  };

  const onRevokeOthers = async () => {
    setConfirmOthers(false);
    try {
      const n = await revokeOthers();
      toast.success(t('auth.sessions.closedOthers', { count: n }));
    } catch (err) {
      fail(err);
    }
  };

  const describe = (userAgent: string | null, clientKind: string) => {
    const { browser, os } = summarizeUserAgent(userAgent);
    if (browser && os) return t('auth.sessions.browserOn', { browser, os });
    if (browser || os) return (browser ?? os) as string;
    return t(clientKind.startsWith('desktop') ? 'auth.sessions.desktop' : 'auth.sessions.unknown');
  };

  return (
    <SecurityCard
      title={t('auth.sessions.title')}
      description={t('auth.sessions.help')}
      action={
        <Button
          variant="secondary"
          size="sm"
          disabled={others === 0 || busy}
          onClick={() => setConfirmOthers(true)}
        >
          {t('auth.sessions.closeOthers')}
        </Button>
      }
    >
      {loading ? (
        <SecurityLoading />
      ) : error ? (
        <SecurityNote hint={error}>{t('auth.sessions.error')}</SecurityNote>
      ) : (
        <SecurityRows label={t('auth.sessions.title')}>
          {sessions.map((s) => (
            <SecurityRow
              key={s.id}
              icon={
                s.clientKind.startsWith('desktop') ? <Monitor size={16} /> : <Globe size={16} />
              }
              title={describe(s.userAgent, s.clientKind)}
              badge={
                s.current ? (
                  <Badge variant="success">{t('auth.sessions.current')}</Badge>
                ) : undefined
              }
              meta={[
                s.ip,
                t('auth.sessions.activeAgo', { when: relativeTime(s.lastSeenAt, intlLocale()) }),
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                s.current ? undefined : (
                  <RowAction
                    label={t('auth.sessions.closeOne')}
                    danger
                    disabled={busy}
                    onClick={() => void onRevoke(s.id)}
                  >
                    <LogOut size={15} />
                  </RowAction>
                )
              }
            />
          ))}
        </SecurityRows>
      )}

      <ConfirmDialog
        open={confirmOthers}
        tone="danger"
        title={t('auth.sessions.closeOthersTitle')}
        message={t('auth.sessions.closeOthersMessage', { count: others })}
        confirmLabel={t('auth.sessions.closeOthers')}
        onCancel={() => setConfirmOthers(false)}
        onConfirm={() => void onRevokeOthers()}
      />
    </SecurityCard>
  );
};
