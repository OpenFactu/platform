import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, useToast, Badge } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { BookOpenCheck } from 'lucide-react';
import { chartOfAccountsApi, journalEntriesApi } from '../api';
import type { Account, LedgerRow } from '../domain/accounting';

export const Ledger: React.FC = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();


  useEffect(() => {
    if (!user?.tenantId) return;
    chartOfAccountsApi
      .list()
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Error al cargar cuentas'));
  }, [user?.tenantId]);

  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    setLoading(true);
    journalEntriesApi
      .ledger(selected)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Error al cargar mayor'))
      .finally(() => setLoading(false));
  }, [selected]);

  const account = useMemo(() => accounts.find((a) => a.id === selected), [accounts, selected]);
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);

  const columns = [
    {
      header: 'Fecha',
      cell: (r: LedgerRow) => new Date(r.entryDate).toLocaleDateString(),
    },
    { header: 'Asiento', cell: (r: LedgerRow) => <b>{r.entryNumber}</b> },
    { header: 'Concepto', cell: (r: LedgerRow) => r.description || r.headerDescription || '' },
    {
      header: 'Debe',
      align: 'right' as const,
      cell: (r: LedgerRow) =>
        Number(r.debit) > 0
          ? Number(r.debit).toLocaleString('es-ES', { minimumFractionDigits: 2 })
          : '',
    },
    {
      header: 'Haber',
      align: 'right' as const,
      cell: (r: LedgerRow) =>
        Number(r.credit) > 0
          ? Number(r.credit).toLocaleString('es-ES', { minimumFractionDigits: 2 })
          : '',
    },
    {
      header: 'Saldo',
      align: 'right' as const,
      cell: (r: LedgerRow) => (
        <b
          className={
            r.runningBalance >= 0
              ? 'text-slate-700 dark:text-slate-200'
              : 'text-red-600 dark:text-red-400'
          }
        >
          {r.runningBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
        </b>
      ),
    },
  ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
          <BookOpenCheck className="text-blue-600 dark:text-blue-300" size={32} />
          Libro mayor
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          Movimientos posteados por cuenta, con saldo corriente.
        </p>
      </div>

      <Card className="p-6 border-blue-50 shadow-lg" noPadding>
        <div className="p-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cuenta
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">— seleccionar cuenta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          {account && (
            <div className="flex items-center gap-2">
              <Badge variant="info">{account.type}</Badge>
              <Badge variant="success">Debe {totalDebit.toFixed(2)}</Badge>
              <Badge variant="warning">Haber {totalCredit.toFixed(2)}</Badge>
              <Badge variant="neutral">Saldo {(totalDebit - totalCredit).toFixed(2)}</Badge>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={columns} data={rows} isLoading={loading} />
      </Card>
    </div>
  );
};

export default Ledger;
