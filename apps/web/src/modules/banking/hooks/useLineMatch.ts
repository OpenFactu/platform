import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@openfactu/ui';
import { bankStatementsApi } from '../api/bankingApi';
import {
  gapCents,
  invoicesCents,
  paymentsCents,
  proposedAmount,
  type LedgerAccount,
  type LineSuggestions,
  type StatementLine,
  type StatementLineDetail,
} from '../domain/banking';

export type MatchTab = 'payments' | 'invoices' | 'entry';

/** Conciliar un movimiento: lo que se le parece, lo elegido y lo que falta para cuadrar. */
export function useLineMatch(line: StatementLine | null, onChanged: () => void) {
  const [detail, setDetail] = useState<StatementLineDetail | null>(null);
  const [suggestions, setSuggestions] = useState<LineSuggestions>({ payments: [], invoices: [] });
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<MatchTab>('payments');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [entryAccount, setEntryAccount] = useState('');
  const [description, setDescription] = useState('');
  const [differenceAccount, setDifferenceAccount] = useState('');
  const debounced = useDebouncedValue(query, 300);

  const lineId = line?.id ?? null;
  const open = line?.status === 'open';

  useEffect(() => {
    setTab('payments');
    setQuery('');
    setPicked(new Set());
    setAmounts({});
    setEntryAccount('');
    setDifferenceAccount('');
    setDescription(line?.description ?? '');
    setDetail(null);
    if (!lineId) return;
    let alive = true;
    bankStatementsApi
      .line(lineId)
      .then((row) => {
        if (alive) setDetail(row);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  useEffect(() => {
    if (!lineId || !open) return;
    let alive = true;
    setLoading(true);
    bankStatementsApi
      .suggestions(lineId, debounced.trim() || undefined)
      .then((rows) => {
        if (alive) setSuggestions(rows);
      })
      .catch(() => {
        if (alive) setSuggestions({ payments: [], invoices: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [lineId, open, debounced]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    bankStatementsApi
      .ledgerAccounts()
      .then((rows) => {
        if (alive) setAccounts(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  const lineAmount = Number(line?.amount ?? 0);
  const explained = useMemo(
    () =>
      tab === 'payments'
        ? paymentsCents(suggestions.payments, picked)
        : tab === 'invoices'
          ? invoicesCents(lineAmount, amounts)
          : 0,
    [tab, suggestions.payments, picked, lineAmount, amounts],
  );
  const gap = gapCents(lineAmount, explained);

  const togglePayment = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleInvoice = (id: string, remaining: number) =>
    setAmounts((current) => {
      if (id in current) {
        return Object.fromEntries(Object.entries(current).filter(([key]) => key !== id));
      }
      return { ...current, [id]: proposedAmount(remaining, lineAmount, explained) };
    });

  const setInvoiceAmount = (id: string, amount: number | null) =>
    setAmounts((current) => ({ ...current, [id]: amount }));

  const changeTab = (next: MatchTab) => {
    setTab(next);
    setDifferenceAccount('');
  };

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setSaving(true);
      try {
        await action();
        onChanged();
      } finally {
        setSaving(false);
      }
    },
    [onChanged],
  );

  const difference = differenceAccount
    ? { accountId: differenceAccount, description: description.trim() || undefined }
    : undefined;

  const canSubmit =
    tab === 'entry'
      ? !!entryAccount
      : (tab === 'payments' ? picked.size > 0 : Object.keys(amounts).length > 0) &&
        (gap === 0 || !!differenceAccount);

  const submit = () => {
    if (!lineId) return Promise.resolve();
    if (tab === 'payments') {
      return run(() => bankStatementsApi.match(lineId, { paymentIds: [...picked], difference }));
    }
    if (tab === 'invoices') {
      const invoices = suggestions.invoices
        .filter((invoice) => invoice.id in amounts)
        .map((invoice) => ({
          kind: invoice.kind,
          id: invoice.id,
          amount: Number(amounts[invoice.id] ?? 0),
        }));
      return run(() => bankStatementsApi.pay(lineId, { invoices, difference }));
    }
    return run(() =>
      bankStatementsApi.entry(lineId, {
        accountId: entryAccount,
        description: description.trim() || undefined,
      }),
    );
  };

  return {
    detail,
    suggestions,
    accounts,
    loading,
    saving,
    tab,
    changeTab,
    query,
    setQuery,
    picked,
    togglePayment,
    amounts,
    toggleInvoice,
    setInvoiceAmount,
    entryAccount,
    setEntryAccount,
    description,
    setDescription,
    differenceAccount,
    setDifferenceAccount,
    explained,
    gap,
    canSubmit,
    submit,
    undo: () => (lineId ? run(() => bankStatementsApi.undo(lineId)) : Promise.resolve()),
    ignore: (ignored: boolean) =>
      lineId ? run(() => bankStatementsApi.ignore(lineId, ignored)) : Promise.resolve(),
  };
}
