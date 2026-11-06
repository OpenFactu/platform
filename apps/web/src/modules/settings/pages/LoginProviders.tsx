import React, { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  Drawer,
  EmptyState,
  Input,
  PageHeader,
  PasswordInput,
  Select,
  Switch,
  Table,
  useToast,
  type RowAction,
  type TableColumn,
} from '@openfactu/ui';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { ProviderLogo } from '@/components/login/ProviderLogo';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import {
  callbackUrlFor,
  emptyProviderForm,
  formFromProvider,
  missingFields,
  PROVIDER_KINDS,
  type AuthProvider,
  type ProviderForm,
} from '../security/providerForm';
import { useProviders } from '../security/useProviders';

/** «Inicio de sesión»: proveedores de acceso único de la instalación. Solo SUPERUSER. */
export const LoginProviders: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const { items, loading, error, busy, save, remove, messageFor } = useProviders(
    user?.role === 'SUPERUSER',
  );
  // `null` cerrado; `'new'` alta; un proveedor, su edición.
  const [editing, setEditing] = useState<AuthProvider | 'new' | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyProviderForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<AuthProvider | null>(null);

  if (user?.role !== 'SUPERUSER') {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <EmptyState title={t('auth.providers.superuserOnly')} variant="compact" />
      </div>
    );
  }

  const patch = (p: Partial<ProviderForm>) => setForm((f) => ({ ...f, ...p }));

  const openNew = () => {
    setForm(emptyProviderForm());
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (p: AuthProvider) => {
    setForm(formFromProvider(p));
    setFormError(null);
    setEditing(p);
  };
  const close = () => !busy && setEditing(null);

  const submit = async () => {
    const missing = missingFields(form);
    if (missing.length > 0) {
      setFormError(
        t('auth.providers.missing', {
          fields: missing.map((m) => t(`auth.providers.fields.${m}`)).join(', '),
        }),
      );
      return;
    }
    setFormError(null);
    try {
      await save(editing !== 'new' && editing ? editing.id : null, form);
      toast.success(t('auth.providers.saved'));
      setEditing(null);
    } catch (err) {
      setFormError(messageFor(err));
    }
  };

  const onRemove = async () => {
    const p = toRemove;
    setToRemove(null);
    if (!p) return;
    try {
      await remove(p.id);
      toast.success(t('auth.providers.removed'));
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  const kindLabel = (k: string) => t(`auth.providers.kinds.${k}`);

  const columns: TableColumn<AuthProvider>[] = [
    {
      header: t('auth.providers.fields.name'),
      card: 'title',
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          <ProviderLogo kind={p.kind} size={16} />
          <span className="truncate font-medium text-fg-default">{p.name}</span>
        </span>
      ),
    },
    { header: t('auth.providers.fields.kind'), card: 'subtitle', cell: (p) => kindLabel(p.kind) },
    {
      header: t('auth.providers.fields.clientId'),
      card: 'body',
      cell: (p) => <span className="break-all font-mono text-xs">{p.clientId}</span>,
    },
    {
      header: t('auth.providers.status'),
      card: 'status',
      cell: (p) => (
        <Badge variant={p.enabled ? 'success' : 'neutral'}>
          {p.enabled ? t('auth.providers.enabled') : t('auth.providers.disabled')}
        </Badge>
      ),
    },
  ];

  const rowActions = (p: AuthProvider): RowAction[] => [
    { label: t('auth.providers.edit'), icon: <Pencil size={14} />, onClick: () => openEdit(p) },
    {
      label: t('auth.providers.remove'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => setToRemove(p),
    },
  ];

  const editingProvider = editing && editing !== 'new' ? editing : null;
  const callback = editingProvider ? callbackUrlFor(editingProvider, window.location.origin) : null;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('auth.providers.title')}
        subtitle={t('auth.providers.subtitle')}
        icon={<KeyRound size={18} />}
        size="lg"
        actions={
          <Button className="gap-1.5" onClick={openNew}>
            <Plus size={14} /> {t('auth.providers.add')}
          </Button>
        }
      />

      {error ? (
        <EmptyState title={t('auth.providers.loadError')} hint={error} variant="compact" />
      ) : (
        <Card className="overflow-hidden border-border-subtle" noPadding>
          <Table
            className="max-md:p-3"
            columns={columns}
            data={items}
            isLoading={loading}
            rowActions={rowActions}
            onRowClick={openEdit}
            emptyMessage={t('auth.providers.empty')}
          />
        </Card>
      )}

      <Drawer
        open={editing !== null}
        onClose={close}
        size="md"
        title={editingProvider ? t('auth.providers.editTitle') : t('auth.providers.newTitle')}
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={close}>
              {t('auth.providers.cancel')}
            </Button>
            <Button isLoading={busy} disabled={busy} onClick={() => void submit()}>
              {t('auth.providers.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <Alert tone="danger" role="alert">
              {formError}
            </Alert>
          )}

          <Select
            label={t('auth.providers.fields.kind')}
            value={form.kind}
            onChange={(v) => patch({ kind: v as ProviderForm['kind'] })}
            disabled={!!editingProvider}
            options={PROVIDER_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
          />
          <Input
            label={t('auth.providers.fields.name')}
            required
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            helperText={t('auth.providers.nameHelp')}
            maxLength={80}
          />
          {form.kind === 'oidc' && (
            <Input
              label={t('auth.providers.fields.issuer')}
              required
              value={form.issuer}
              onChange={(e) => patch({ issuer: e.target.value })}
              placeholder="https://id.example.com"
              helperText={t('auth.providers.issuerHelp')}
              inputMode="url"
              autoComplete="off"
            />
          )}
          <Input
            label={t('auth.providers.fields.clientId')}
            required
            value={form.clientId}
            onChange={(e) => patch({ clientId: e.target.value })}
            autoComplete="off"
          />
          <PasswordInput
            label={t('auth.providers.fields.secret')}
            value={form.clientSecret}
            onChange={(e) => patch({ clientSecret: e.target.value })}
            placeholder={editingProvider?.hasSecret ? t('auth.providers.secretKeep') : ''}
            autoComplete="new-password"
          />
          <Input
            label={t('auth.providers.fields.domains')}
            value={form.allowedDomains}
            onChange={(e) => patch({ allowedDomains: e.target.value })}
            placeholder="acme.com, acme.es"
            helperText={t('auth.providers.domainsHelp')}
            autoComplete="off"
          />
          <div className="space-y-1">
            <Switch
              label={t('auth.providers.fields.trustMfa')}
              checked={form.trustProviderMfa}
              onChange={(v) => patch({ trustProviderMfa: v })}
            />
            <p className="text-xs text-fg-muted">{t('auth.providers.trustMfaHelp')}</p>
          </div>
          <Switch
            label={t('auth.providers.fields.enabled')}
            checked={form.enabled}
            onChange={(v) => patch({ enabled: v })}
          />

          <div className="space-y-2 rounded-[var(--k-radius-md)] border border-border-default bg-bg-muted p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('auth.providers.callback')}
            </p>
            {callback ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all text-xs text-fg-default">{callback}</code>
                <CopyButton value={callback} iconOnly variant="ghost" size="sm" />
              </div>
            ) : (
              <p className="text-xs text-fg-muted">{t('auth.providers.callbackAfterSave')}</p>
            )}
            <p className="text-xs text-fg-subtle">{t('auth.providers.callbackHelp')}</p>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={toRemove !== null}
        tone="danger"
        title={t('auth.providers.removeTitle')}
        message={t('auth.providers.removeMessage', { name: toRemove?.name ?? '' })}
        confirmLabel={t('auth.providers.remove')}
        onCancel={() => setToRemove(null)}
        onConfirm={() => void onRemove()}
      />
    </div>
  );
};
