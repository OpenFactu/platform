import React, { useState } from 'react';
import { Button, ConfirmDialog, EmptyState, Spinner, useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { userAccessApi } from './api';
import { AuthHistoryList } from './AuthHistoryCard';
import { useAuthHistory } from './useAuthHistory';

/** «Accesos» en la ficha de un usuario: su historial y cerrarle todas las sesiones. */
export const UserAccessSection: React.FC<{ userId: string; canWrite: boolean }> = ({
  userId,
  canWrite,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  const { events, loading, error, notFound, reload } = useAuthHistory(userId);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const closeAll = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      const { revoked } = await userAccessApi.revokeAll(userId);
      toast.success(t('auth.access.closedAll', { count: revoked }));
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.sessions.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-2 border-t border-border-subtle">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-fg-default uppercase tracking-tight">
            {t('auth.access.title')}
          </h3>
          <p className="text-[10px] text-fg-subtle font-bold mt-0.5">{t('auth.access.help')}</p>
        </div>
        {canWrite && !notFound && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            {t('auth.access.closeAll')}
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : notFound ? (
        <p className="text-sm text-fg-muted">{t('auth.access.unavailable')}</p>
      ) : error ? (
        <EmptyState title={t('auth.history.error')} hint={error} variant="compact" />
      ) : events.length === 0 ? (
        <EmptyState title={t('auth.history.empty')} variant="compact" />
      ) : (
        <AuthHistoryList events={events} />
      )}

      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={t('auth.access.closeAllTitle')}
        message={t('auth.access.closeAllMessage')}
        confirmLabel={t('auth.access.closeAll')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void closeAll()}
      />
    </div>
  );
};
