import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  FormGrid,
  Input,
  Modal,
  SearchableSelect,
  Select,
  useToast,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { bankAccountsApi } from '../api/bankingApi';
import {
  accountFormOf,
  emptyAccountForm,
  formatIban,
  type BankAccount,
  type BankAccountForm,
  type BankAccountFormOptions,
} from '../domain/banking';

interface Props {
  open: boolean;
  account: BankAccount | null;
  options: BankAccountFormOptions;
  onClose: () => void;
  onSaved: () => void;
}

/** Alta y edición de una cuenta de la empresa. */
export const BankAccountModal: React.FC<Props> = ({ open, account, options, onClose, onSaved }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<BankAccountForm>(() =>
    account ? accountFormOf(account) : emptyAccountForm(),
  );
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<BankAccountForm>) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(t('banking.accounts.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      if (account) await bankAccountsApi.update(account.id, form);
      else await bankAccountsApi.create(form);
      toast.success(t('banking.accounts.saved'));
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('banking.accounts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={account ? t('banking.accounts.edit') : t('banking.accounts.new')}
    >
      <div className="p-6 space-y-4">
        <Input
          label={t('banking.accounts.name')}
          requiredMark
          value={form.name}
          onChange={(event) => set({ name: event.target.value })}
        />
        <Input
          label="IBAN"
          value={form.iban}
          onChange={(event) => set({ iban: event.target.value })}
          onBlur={(event) => set({ iban: formatIban(event.target.value.replace(/\s+/g, '')) })}
        />
        <FormGrid columns={2}>
          <Input
            label={t('banking.accounts.bank')}
            value={form.bankName}
            onChange={(event) => set({ bankName: event.target.value })}
          />
          <Input
            label="SWIFT / BIC"
            value={form.swift}
            onChange={(event) => set({ swift: event.target.value.toUpperCase() })}
          />
          <Select
            label={t('banking.accounts.currency')}
            placeholder={t('banking.accounts.baseCurrency')}
            value={form.currencyId}
            onChange={(currencyId) => set({ currencyId })}
            options={options.currencies.map((currency) => ({
              value: currency.id,
              label: `${currency.code} · ${currency.name}`,
            }))}
          />
          <Input
            label={t('banking.accounts.creditorId')}
            helperText={t('banking.accounts.creditorIdHint')}
            value={form.creditorId}
            onChange={(event) => set({ creditorId: event.target.value })}
          />
        </FormGrid>
        <SearchableSelect
          label={t('banking.accounts.ledger')}
          helperText={t('banking.accounts.ledgerHint')}
          value={form.accountId}
          onChange={(accountId) => set({ accountId })}
          options={options.accounts.map((row) => ({
            value: row.id,
            label: `${row.code} · ${row.name}`,
          }))}
        />
        <div className="space-y-2">
          <Checkbox
            label={t('banking.accounts.isDefault')}
            checked={form.isDefault}
            onChange={(isDefault) => set({ isDefault })}
          />
          {account && (
            <Checkbox
              label={t('banking.accounts.isActive')}
              checked={form.isActive}
              onChange={(isActive) => set({ isActive })}
            />
          )}
        </div>
      </div>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t('banking.common.cancel')}
        </Button>
        <Button onClick={save} isLoading={saving}>
          {t('banking.common.save')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
