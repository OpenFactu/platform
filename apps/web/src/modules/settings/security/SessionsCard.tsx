import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  List,
  ListItem,
  Spinner,
  useToast,
} from '@openfactu/ui';
import { Globe, Monitor } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { intlLocale } from '@/i18n/i18n';
import { useSessions } from './useSessions';
import { relativeTime, summarizeUserAgent } from './sessionLabels';

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
    <Card className="p-6 space-y-4 border-border-subtle">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle">
            {t('auth.sessions.title')}
          </h2>
          <p className="text-[11px] text-fg-muted max-w-md">{t('auth.sessions.help')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={others === 0 || busy}
          onClick={() => setConfirmOthers(true)}
        >
          {t('auth.sessions.closeOthers')}
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title={t('auth.sessions.error')} hint={error} variant="compact" />
      ) : (
        <List aria-label={t('auth.sessions.title')}>
          {sessions.map((s) => (
            <ListItem
              key={s.id}
              icon={
                s.clientKind.startsWith('desktop') ? <Monitor size={16} /> : <Globe size={16} />
              }
              title={describe(s.userAgent, s.clientKind)}
              subtitle={[
                s.ip,
                t('auth.sessions.activeAgo', { when: relativeTime(s.lastSeenAt, intlLocale()) }),
              ]
                .filter(Boolean)
                .join(' · ')}
              badge={
                s.current ? (
                  <Badge variant="success">{t('auth.sessions.current')}</Badge>
                ) : undefined
              }
              meta={
                s.current ? undefined : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onRevoke(s.id)}
                  >
                    {t('auth.sessions.close')}
                  </Button>
                )
              }
            />
          ))}
        </List>
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
    </Card>
  );
};
