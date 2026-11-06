import React, { useState } from 'react';
import { Badge, Button, ConfirmDialog, Input, Modal, useToast } from '@openfactu/ui';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { getClientKind } from '@/shared/auth/clientKind';
import { useI18n } from '@/i18n/I18nContext';
import { intlLocale } from '@/i18n/i18n';
import { usePasskeys, proposePasskeyName } from './usePasskeys';
import { relativeTime } from './sessionLabels';
import {
  RowAction,
  SecurityCard,
  SecurityLoading,
  SecurityNote,
  SecurityRow,
  SecurityRows,
} from './SecurityCard';

type Dialog = { mode: 'add' } | { mode: 'rename'; id: string } | null;

/** «Passkeys»: llaves de acceso de la cuenta; añadir, renombrar y quitar. */
export const PasskeysCard: React.FC<{ onAdded?: () => void; title?: string }> = ({
  onAdded,
  title,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  const { supported, items, loading, error, busy, add, rename, remove, messageFor } =
    usePasskeys(onAdded);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState('');
  const [toRemove, setToRemove] = useState<string | null>(null);

  const openAdd = () => {
    setName(
      proposePasskeyName(
        navigator.userAgent,
        (browser, os) => t('auth.sessions.browserOn', { browser, os }),
        t('auth.passkey.defaultName'),
      ),
    );
    setDialog({ mode: 'add' });
  };

  const openRename = (id: string, current: string) => {
    setName(current);
    setDialog({ mode: 'rename', id });
  };

  const submit = async () => {
    const value = name.trim();
    if (!dialog || !value) return;
    try {
      if (dialog.mode === 'add') {
        // El diálogo del sistema se abre desde aquí: si se cancela, el nombre se conserva.
        if (!(await add(value))) return;
        toast.success(t('auth.passkey.added'));
      } else {
        await rename(dialog.id, value);
        toast.success(t('auth.passkey.renamed'));
      }
      setDialog(null);
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  const onRemove = async () => {
    const id = toRemove;
    setToRemove(null);
    if (!id) return;
    try {
      await remove(id);
      toast.success(t('auth.passkey.removed'));
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  const lastUse = (iso: string | null) =>
    iso
      ? t('auth.passkey.lastUsed', { when: relativeTime(iso, intlLocale()) })
      : t('auth.passkey.neverUsed');

  // La llave sirve donde se creó: en la web o en la app de escritorio. Solo se marca la que no
  // sirve aquí; la de aquí no necesita etiqueta.
  const onlyElsewhere =
    getClientKind() === 'desktop' ? t('auth.passkey.onlyWeb') : t('auth.passkey.onlyDesktop');

  return (
    <SecurityCard
      title={title ?? t('auth.passkey.title')}
      description={t('auth.passkey.help')}
      action={
        supported && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={openAdd}
          >
            <Plus size={14} /> {t('auth.passkey.add')}
          </Button>
        )
      }
    >
      {!supported && <SecurityNote>{t('auth.passkey.unsupported')}</SecurityNote>}

      {loading ? (
        <SecurityLoading />
      ) : error ? (
        <SecurityNote hint={error}>{t('auth.passkey.error')}</SecurityNote>
      ) : items.length === 0 ? (
        supported && <SecurityNote>{t('auth.passkey.empty')}</SecurityNote>
      ) : (
        <SecurityRows label={t('auth.passkey.title')}>
          {items.map((p) => (
            <SecurityRow
              key={p.id}
              icon={<KeyRound size={16} />}
              title={p.name}
              badge={p.here ? undefined : <Badge variant="neutral">{onlyElsewhere}</Badge>}
              meta={lastUse(p.lastUsedAt)}
              trailing={
                <>
                  <RowAction
                    label={t('auth.passkey.rename')}
                    disabled={busy}
                    onClick={() => openRename(p.id, p.name)}
                  >
                    <Pencil size={15} />
                  </RowAction>
                  <RowAction
                    label={t('auth.passkey.remove')}
                    danger
                    disabled={busy}
                    onClick={() => setToRemove(p.id)}
                  >
                    <Trash2 size={15} />
                  </RowAction>
                </>
              }
            />
          ))}
        </SecurityRows>
      )}

      <Modal
        isOpen={dialog !== null}
        onClose={() => !busy && setDialog(null)}
        title={
          dialog?.mode === 'rename' ? t('auth.passkey.renameTitle') : t('auth.passkey.addTitle')
        }
        subtitle={dialog?.mode === 'add' ? t('auth.passkey.addHint') : undefined}
        maxWidth="md"
      >
        <div className="space-y-4">
          <Input
            label={t('auth.passkey.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>
              {t('auth.passkey.cancel')}
            </Button>
            <Button isLoading={busy} disabled={busy || !name.trim()} onClick={() => void submit()}>
              {dialog?.mode === 'rename' ? t('auth.passkey.save') : t('auth.passkey.continue')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={toRemove !== null}
        tone="danger"
        title={t('auth.passkey.removeTitle')}
        message={t('auth.passkey.removeMessage')}
        confirmLabel={t('auth.passkey.remove')}
        onCancel={() => setToRemove(null)}
        onConfirm={() => void onRemove()}
      />
    </SecurityCard>
  );
};
