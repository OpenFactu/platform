import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  List,
  ListItem,
  Spinner,
  useToast,
} from '@openfactu/ui';
import { ProviderLogo } from '@/components/login/ProviderLogo';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate } from '@/i18n/format';
import { ssoErrorKey } from '@/pages/login/ssoModel';
import { consumeSecurityNotice, peekSecurityNotice } from '@/shared/auth/securityNotice';
import { useIdentities } from './useIdentities';

/** «Cuentas enlazadas»: entrar con Google, Microsoft u otro proveedor; enlazar y desenlazar. */
export const LinkedAccountsCard: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const { items, available, loading, error, busy, link, unlink, messageFor } = useIdentities(
    user?.tenantId,
  );
  const [toUnlink, setToUnlink] = useState<string | null>(null);
  // Resultado de volver del proveedor tras enlazar (`?linked=1` o `?ssoError=`).
  // Capturado antes de montar React (`securityNotice`); se gasta en el efecto por StrictMode.
  const [returned] = useState(
    () => peekSecurityNotice() ?? { linked: false, errorCode: null as string | null },
  );
  const [returnedShown, setReturnedShown] = useState(true);
  useEffect(() => {
    consumeSecurityNotice();
  }, []);

  // Sin proveedores configurados ni cuentas enlazadas no hay nada que enseñar.
  if (!loading && !error && items.length === 0 && available.length === 0 && !returned.errorCode) {
    return null;
  }

  const onLink = async (providerId: string) => {
    try {
      await link(providerId);
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  const onUnlink = async () => {
    const id = toUnlink;
    setToUnlink(null);
    if (!id) return;
    try {
      await unlink(id);
      toast.success(t('auth.sso.unlinked'));
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  return (
    <Card className="p-6 space-y-4 border-border-subtle">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle">
          {t('auth.sso.linkedTitle')}
        </h2>
        <p className="text-[11px] text-fg-muted max-w-md">{t('auth.sso.linkedHelp')}</p>
      </div>

      {returnedShown && returned.linked && (
        <Alert tone="success" role="status" onDismiss={() => setReturnedShown(false)}>
          {t('auth.sso.linked')}
        </Alert>
      )}
      {returnedShown && returned.errorCode && (
        <Alert tone="danger" role="alert" onDismiss={() => setReturnedShown(false)}>
          {t(ssoErrorKey(returned.errorCode))}
        </Alert>
      )}

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title={t('auth.sso.error')} hint={error} variant="compact" />
      ) : (
        <>
          {items.length === 0 ? (
            <EmptyState title={t('auth.sso.noneLinked')} variant="compact" />
          ) : (
            <List aria-label={t('auth.sso.linkedTitle')}>
              {items.map((i) => (
                <ListItem
                  key={i.id}
                  icon={<ProviderLogo kind={i.kind} />}
                  title={i.providerName}
                  subtitle={[i.email, t('auth.sso.linkedOn', { date: formatDate(i.linkedAt) })]
                    .filter(Boolean)
                    .join(' · ')}
                  meta={
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setToUnlink(i.id)}
                    >
                      {t('auth.sso.unlink')}
                    </Button>
                  }
                />
              ))}
            </List>
          )}

          {available.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {available.map((p) => (
                <Button
                  key={p.id}
                  variant="secondary"
                  size="sm"
                  className="gap-2 min-w-0"
                  disabled={busy}
                  onClick={() => void onLink(p.id)}
                >
                  <ProviderLogo kind={p.kind} size={16} />
                  <span className="truncate">{t('auth.sso.linkWith', { provider: p.name })}</span>
                </Button>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={toUnlink !== null}
        tone="danger"
        title={t('auth.sso.unlinkTitle')}
        message={t('auth.sso.unlinkMessage')}
        confirmLabel={t('auth.sso.unlink')}
        onCancel={() => setToUnlink(null)}
        onConfirm={() => void onUnlink()}
      />
    </Card>
  );
};
