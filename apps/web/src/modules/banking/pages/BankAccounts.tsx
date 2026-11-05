import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
  usePopup,
  useToast,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { useI18n } from '@/i18n/I18nContext';
import { bankAccountsApi } from '../api/bankingApi';
import { BankAccountModal } from '../components/BankAccountModal';
import { formatIban, type BankAccount, type BankAccountFormOptions } from '../domain/banking';

/** Las cuentas de la empresa, con su IBAN y su cuenta contable. */
export const BankAccounts: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();
  const { canWrite, canDelete } = usePagePermissions();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [options, setOptions] = useState<BankAccountFormOptions>({ accounts: [], currencies: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await bankAccountsApi.list());
    } catch {
      toast.error(t('banking.accounts.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    bankAccountsApi
      .formOptions()
      .then(setOptions)
      .catch(() => undefined);
  }, [load]);

  const openForm = (account: BankAccount | null) => {
    setEditing(account);
    setFormOpen(true);
  };

  const remove = async (account: BankAccount) => {
    const sure = await popup.confirm({
      title: t('banking.accounts.deleteTitle'),
      message: t('banking.accounts.deleteMessage', { name: account.name }),
      confirmLabel: t('banking.accounts.delete'),
      cancelLabel: t('banking.common.cancel'),
    });
    if (!sure) return;
    try {
      await bankAccountsApi.remove(account.id);
      toast.success(t('banking.accounts.deleted'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('banking.accounts.saveError'));
    }
  };

  const columns: TableColumn<BankAccount>[] = [
    {
      header: t('banking.accounts.name'),
      card: 'title',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-fg-default">{row.name}</p>
          {row.bankName && <p className="text-xs text-fg-muted">{row.bankName}</p>}
        </div>
      ),
    },
    {
      header: 'IBAN',
      card: 'subtitle',
      cell: (row) => <span className="font-mono text-sm">{formatIban(row.iban) || '—'}</span>,
    },
    {
      header: t('banking.accounts.ledger'),
      card: 'meta',
      cell: (row) =>
        row.accountCode ? (
          <span className="text-sm">
            {row.accountCode} · {row.accountName}
          </span>
        ) : (
          <Badge variant="warning">{t('banking.accounts.noLedger')}</Badge>
        ),
    },
    {
      header: t('banking.accounts.toReconcile'),
      align: 'right',
      card: 'hidden',
      cell: (row) => <span className="tabular-nums">{row.openLines}</span>,
    },
    {
      header: t('banking.accounts.state'),
      card: 'status',
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.isDefault && <Badge variant="info">{t('banking.accounts.default')}</Badge>}
          {!row.isActive && <Badge variant="neutral">{t('banking.accounts.inactive')}</Badge>}
        </span>
      ),
    },
  ];

  const rowActions = (row: BankAccount): RowAction[] => [
    ...(canWrite
      ? [
          {
            id: 'edit',
            label: t('banking.accounts.edit'),
            icon: <Pencil size={14} />,
            onClick: () => openForm(row),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            id: 'delete',
            label: t('banking.accounts.delete'),
            icon: <Trash2 size={14} />,
            onClick: () => remove(row),
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title={t('banking.accounts.title')}
        subtitle={t('banking.accounts.subtitle')}
        actions={
          canWrite ? (
            <Button className="gap-2" onClick={() => openForm(null)}>
              <Plus size={16} /> {t('banking.accounts.new')}
            </Button>
          ) : undefined
        }
      />
      <Card noPadding>
        {!loading && accounts.length === 0 ? (
          <EmptyState
            icon={<Landmark size={24} />}
            title={t('banking.accounts.emptyTitle')}
            hint={t('banking.accounts.emptyHint')}
          />
        ) : (
          <Table
            className="max-md:p-3"
            columns={columns}
            data={accounts}
            isLoading={loading}
            rowKey={(row) => row.id}
            rowActions={canWrite || canDelete ? rowActions : undefined}
            onRowClick={canWrite ? openForm : undefined}
          />
        )}
      </Card>
      <BankAccountModal
        key={`${editing?.id ?? 'new'}-${formOpen}`}
        open={formOpen}
        account={editing}
        options={options}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </div>
  );
};

export default BankAccounts;
