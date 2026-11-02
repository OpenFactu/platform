import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Send, TriangleAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Loader,
  PageHeader,
  PasswordInput,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { messagingApi } from '../api/messagingApi';
import { rtClient } from '../api/rtClient';
import { CallDiagnostics } from '../components/CallDiagnostics';
import { messagingErrorText } from '../domain/errors';
import type { ChannelAccount } from '../domain/messaging';
import { useMessaging } from '../context/messagingState';

/**
 * Canales de la empresa: hoy, el bot de Telegram. Lo conecta un administrador
 * pegando el token que le da @BotFather; el token se guarda cifrado en el
 * servicio de mensajería y no vuelve a salir de ahí.
 */
export const Channels: React.FC = () => {
  const { t } = useI18n();
  const { phase } = useMessaging();
  const [accounts, setAccounts] = useState<ChannelAccount[] | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await messagingApi.channels());
    } catch (err) {
      setError(messagingErrorText(err, t));
      setAccounts([]);
    }
  }, [t]);

  useEffect(() => {
    if (phase !== 'ready') return;
    let cancelled = false;
    messagingApi
      .channels()
      .then((list) => !cancelled && setAccounts(list))
      .catch((err) => {
        if (cancelled) return;
        setError(messagingErrorText(err, t));
        setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, t]);

  if (phase !== 'ready' || accounts === null) {
    return phase === 'loading' || accounts === null ? (
      <div className="h-full flex items-center justify-center">
        <Loader label={t('messaging.loading')} />
      </div>
    ) : (
      <EmptyState title={t('messaging.disabled.title')} hint={t('messaging.disabled.hint')} />
    );
  }

  const telegram = accounts.find((a) => a.channel === 'telegram');
  const manage = rtClient.manage;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await messagingApi.connectTelegram(token);
      setToken('');
      await load();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await messagingApi.disconnectTelegram();
      await load();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
      setConfirmDisconnect(false);
    }
  };

  const username = telegram?.config.username;

  return (
    <div className="p-4 md:p-6 max-w-3xl flex flex-col gap-6">
      <PageHeader title={t('messaging.channels.title')} subtitle={t('messaging.channels.hint')} />

      {rtClient.manage && <CallDiagnostics />}

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-accent">
              <Send size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-fg-default">
                {t('messaging.channels.names.telegram')}
              </h2>
              <p className="text-sm text-fg-muted">
                {t('messaging.channels.telegram.description')}
              </p>
            </div>
            {telegram && (
              <Badge variant={telegram.status === 'active' ? 'success' : 'warning'}>
                {t(`messaging.channels.status.${telegram.status}`)}
              </Badge>
            )}
          </div>

          {telegram ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-fg-body">
                <CheckCircle2 size={16} className="text-success" />
                <span>
                  {t('messaging.channels.telegram.connectedAs', { name: telegram.displayName })}
                  {username && <span className="text-fg-muted"> · @{username}</span>}
                </span>
              </div>
              {telegram.status !== 'active' && telegram.lastError && (
                <div className="flex items-start gap-2 text-sm text-warning">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  <span>{telegram.lastError}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {username && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => window.open(`https://t.me/${username}`, '_blank', 'noopener')}
                  >
                    <ExternalLink size={14} />
                    {t('messaging.channels.telegram.openBot')}
                  </Button>
                )}
                {manage && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmDisconnect(true)}>
                    {t('messaging.channels.disconnect')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-fg-muted">{t('messaging.channels.telegram.shareHint')}</p>
            </div>
          ) : manage ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void connect();
              }}
            >
              <ol className="list-decimal pl-5 text-sm text-fg-body flex flex-col gap-1">
                <li>{t('messaging.channels.telegram.step1')}</li>
                <li>{t('messaging.channels.telegram.step2')}</li>
                <li>{t('messaging.channels.telegram.step3')}</li>
              </ol>
              <PasswordInput
                label={t('messaging.channels.telegram.token')}
                placeholder="123456789:AA…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="submit"
                className="self-start"
                isLoading={busy}
                disabled={!token.trim()}
              >
                {t('messaging.channels.connect')}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-fg-muted">{t('messaging.channels.adminOnly')}</p>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => void disconnect()}
        title={t('messaging.channels.disconnectTitle')}
        message={t('messaging.channels.disconnectHint')}
        confirmLabel={t('messaging.channels.disconnect')}
        tone="danger"
        loading={busy}
      />
    </div>
  );
};
