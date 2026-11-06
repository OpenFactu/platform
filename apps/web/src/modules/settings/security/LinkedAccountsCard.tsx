import React, { useEffect, useState } from 'react';
import { Alert, Button, ConfirmDialog, useToast } from '@openfactu/ui';
import { Unlink } from 'lucide-react';
import { ProviderLogo } from '@/components/login/ProviderLogo';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate } from '@/i18n/format';
import { ssoErrorKey } from '@/pages/login/ssoModel';
import { consumeSecurityNotice, peekSecurityNotice } from '@/shared/auth/securityNotice';
import { useIdentities } from './useIdentities';
import {
  RowAction,
  SecurityBody,
  SecurityCard,
  SecurityLoading,
  SecurityNote,
  SecurityRow,
  SecurityRows,
} from './SecurityCard';

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
    <SecurityCard title={t('auth.sso.linkedTitle')} description={t('auth.sso.linkedHelp')}>
      {returnedShown && (returned.linked || returned.errorCode) && (
        <SecurityBody>
          {returned.errorCode ? (
            <Alert tone="danger" role="alert" onDismiss={() => setReturnedShown(false)}>
              {t(ssoErrorKey(returned.errorCode))}
            </Alert>
          ) : (
            <Alert tone="success" role="status" onDismiss={() => setReturnedShown(false)}>
              {t('auth.sso.linked')}
            </Alert>
          )}
        </SecurityBody>
      )}

      {loading ? (
        <SecurityLoading />
      ) : error ? (
        <SecurityNote hint={error}>{t('auth.sso.error')}</SecurityNote>
      ) : (
        <>
          {items.length === 0 ? (
            <SecurityNote>{t('auth.sso.noneLinked')}</SecurityNote>
          ) : (
            <SecurityRows label={t('auth.sso.linkedTitle')}>
              {items.map((i) => (
                <SecurityRow
                  key={i.id}
                  icon={<ProviderLogo kind={i.kind} size={16} />}
                  title={i.providerName}
                  meta={[i.email, t('auth.sso.linkedOn', { date: formatDate(i.linkedAt) })]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <RowAction
                      label={t('auth.sso.unlink')}
                      danger
                      disabled={busy}
                      onClick={() => setToUnlink(i.id)}
                    >
                      <Unlink size={15} />
                    </RowAction>
                  }
                />
              ))}
            </SecurityRows>
          )}

          {available.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border-subtle px-6 py-4 sm:flex-row sm:flex-wrap">
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
    </SecurityCard>
  );
};
