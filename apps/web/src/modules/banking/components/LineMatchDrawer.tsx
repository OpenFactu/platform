import React from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  Input,
  NumberInput,
  SearchInput,
  SearchableSelect,
  Tabs,
  useToast,
} from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import type { LineMatch, MatchReason, StatementLine } from '../domain/banking';
import { useLineMatch, type MatchTab } from '../hooks/useLineMatch';

interface Props {
  line: StatementLine | null;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** Por qué se sugiere: es lo que permite fiarse de la sugerencia. */
const Reasons: React.FC<{ reasons: MatchReason[] }> = ({ reasons }) => {
  const { t } = useI18n();
  if (reasons.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <Badge key={reason} variant={reason === 'date' ? 'neutral' : 'info'}>
          {t(`banking.match.reasons.${reason}`)}
        </Badge>
      ))}
    </span>
  );
};

const MatchRow: React.FC<{ match: LineMatch }> = ({ match }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-fg-default">
          {match.invoiceCode ??
            (match.journalEntryId ? t('banking.match.entry') : t('banking.match.payment'))}
        </p>
        {match.reference && <p className="text-xs text-fg-muted">{match.reference}</p>}
        {match.createdFromLine && (
          <p className="text-xs text-fg-muted">{t('banking.match.createdHere')}</p>
        )}
      </div>
      <span className="shrink-0 tabular-nums text-sm font-semibold">
        {fmt.money(Number(match.amount))}
      </span>
    </li>
  );
};

/** Un movimiento del banco: con qué está conciliado o con qué se puede conciliar. */
export const LineMatchDrawer: React.FC<Props> = ({ line, canWrite, onClose, onChanged }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const finish = () => {
    onChanged();
    onClose();
  };
  const match = useLineMatch(line, finish);

  const attempt = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('banking.match.error'));
    }
  };

  const amount = Number(line?.amount ?? 0);
  const status = line?.status;
  const options = match.accounts.map((account) => ({
    value: account.id,
    label: `${account.code} · ${account.name}`,
  }));

  const footer =
    !canWrite || !line ? undefined : status === 'matched' ? (
      <div className="flex justify-end">
        <Button
          variant="secondary"
          isLoading={match.saving}
          onClick={() => attempt(match.undo, t('banking.match.undone'))}
        >
          {t('banking.match.undo')}
        </Button>
      </div>
    ) : status === 'ignored' ? (
      <div className="flex justify-end">
        <Button
          variant="secondary"
          isLoading={match.saving}
          onClick={() => attempt(() => match.ignore(false), t('banking.match.recovered'))}
        >
          {t('banking.match.recover')}
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={match.saving}
          onClick={() => attempt(() => match.ignore(true), t('banking.match.ignored'))}
        >
          {t('banking.match.ignore')}
        </Button>
        <Button
          disabled={!match.canSubmit}
          isLoading={match.saving}
          onClick={() => attempt(match.submit, t('banking.match.done'))}
        >
          {t(match.tab === 'entry' ? 'banking.match.createEntry' : 'banking.match.submit')}
        </Button>
      </div>
    );

  return (
    <Drawer
      open={!!line}
      onClose={onClose}
      size="lg"
      title={line?.description || t('banking.match.title')}
      subtitle={line ? `${fmt.date(line.date)} · ${fmt.money(amount)}` : undefined}
      footer={footer}
    >
      {line && (
        <div className="space-y-4">
          {(line.reference || line.counterparty) && (
            <p className="text-sm text-fg-muted">
              {[line.counterparty, line.reference].filter(Boolean).join(' · ')}
            </p>
          )}
          {status === 'matched' && (
            <>
              <Alert tone="success">{t('banking.match.isMatched')}</Alert>
              <ul className="divide-y divide-border-subtle">
                {(match.detail?.matches ?? []).map((row) => (
                  <MatchRow key={row.id} match={row} />
                ))}
              </ul>
            </>
          )}
          {status === 'ignored' && <Alert tone="info">{t('banking.match.isIgnored')}</Alert>}
          {status === 'open' && !canWrite && (
            <Alert tone="info">{t('banking.match.readOnly')}</Alert>
          )}
          {status === 'open' && canWrite && (
            <>
              <Tabs
                value={match.tab}
                onChange={(key) => match.changeTab(key as MatchTab)}
                items={[
                  { key: 'payments', label: t('banking.match.tabPayments') },
                  { key: 'invoices', label: t('banking.match.tabInvoices') },
                  { key: 'entry', label: t('banking.match.tabEntry') },
                ]}
              />
              {match.tab !== 'entry' && (
                <SearchInput
                  value={match.query}
                  placeholder={t('banking.match.search')}
                  onChange={match.setQuery}
                />
              )}

              {match.tab === 'payments' &&
                (match.suggestions.payments.length === 0 ? (
                  <EmptyState
                    title={t('banking.match.noPayments')}
                    hint={t('banking.match.noPaymentsHint')}
                  />
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {match.suggestions.payments.map((payment) => (
                      <li key={payment.id} className="py-2">
                        <Checkbox
                          checked={match.picked.has(payment.id)}
                          onChange={() => match.togglePayment(payment.id)}
                          label={
                            <span className="block min-w-0">
                              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <span className="font-semibold text-fg-default">
                                  {payment.invoiceCode ?? t('banking.match.payment')}
                                </span>
                                <span className="tabular-nums font-semibold">
                                  {fmt.money(payment.amount)}
                                </span>
                              </span>
                              <span className="block text-xs text-fg-muted">
                                {[payment.partnerName, fmt.date(payment.date), payment.reference]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                              <Reasons reasons={payment.reasons} />
                            </span>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ))}

              {match.tab === 'invoices' &&
                (match.suggestions.invoices.length === 0 ? (
                  <EmptyState
                    title={t('banking.match.noInvoices')}
                    hint={t('banking.match.noInvoicesHint')}
                  />
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {match.suggestions.invoices.map((invoice) => {
                      const chosen = invoice.id in match.amounts;
                      return (
                        <li key={invoice.id} className="space-y-2 py-2">
                          <Checkbox
                            checked={chosen}
                            onChange={() => match.toggleInvoice(invoice.id, invoice.remaining)}
                            label={
                              <span className="block min-w-0">
                                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                                  <span className="font-semibold text-fg-default">
                                    {invoice.code}
                                    {invoice.isCreditNote && ` · ${t('banking.match.creditNote')}`}
                                  </span>
                                  <span className="tabular-nums text-sm text-fg-muted">
                                    {t('banking.match.left', {
                                      amount: fmt.money(invoice.remaining),
                                    })}
                                  </span>
                                </span>
                                <span className="block text-xs text-fg-muted">
                                  {[invoice.partnerName, fmt.date(invoice.dueDate ?? invoice.date)]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                                <Reasons reasons={invoice.reasons} />
                              </span>
                            }
                          />
                          {chosen && (
                            <NumberInput
                              aria-label={t('banking.match.amountOf', { code: invoice.code })}
                              containerClassName="ml-7 max-w-[12rem]"
                              value={match.amounts[invoice.id] ?? null}
                              onChange={(value) => match.setInvoiceAmount(invoice.id, value)}
                              min={0}
                              inputSize="sm"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ))}

              {match.tab === 'entry' && (
                <div className="space-y-3">
                  <p className="text-sm text-fg-muted">{t('banking.match.entryHint')}</p>
                  <SearchableSelect
                    label={t('banking.match.entryAccount')}
                    required
                    value={match.entryAccount}
                    onChange={match.setEntryAccount}
                    options={options}
                  />
                  <Input
                    label={t('banking.match.description')}
                    value={match.description}
                    onChange={(event) => match.setDescription(event.target.value)}
                  />
                </div>
              )}

              {match.tab !== 'entry' && (
                <div className="space-y-3 rounded border border-border-subtle p-3">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-fg-muted">{t('banking.match.movement')}</dt>
                    <dd className="text-right tabular-nums">{fmt.money(amount)}</dd>
                    <dt className="text-fg-muted">{t('banking.match.chosen')}</dt>
                    <dd className="text-right tabular-nums">{fmt.money(match.explained / 100)}</dd>
                    <dt className="font-semibold">{t('banking.match.gap')}</dt>
                    <dd
                      className={`text-right font-semibold tabular-nums ${match.gap === 0 ? 'text-success' : 'text-warning'}`}
                    >
                      {fmt.money(match.gap / 100)}
                    </dd>
                  </dl>
                  {match.gap !== 0 && match.explained !== 0 && (
                    <div className="space-y-2">
                      <SearchableSelect
                        label={t('banking.match.differenceAccount')}
                        helperText={t('banking.match.differenceHint')}
                        value={match.differenceAccount}
                        onChange={match.setDifferenceAccount}
                        options={options}
                      />
                      {match.differenceAccount && (
                        <Input
                          label={t('banking.match.description')}
                          value={match.description}
                          onChange={(event) => match.setDescription(event.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
};
