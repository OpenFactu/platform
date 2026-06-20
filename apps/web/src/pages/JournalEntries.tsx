import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ScrollText, Plus, Trash2, Pencil, CheckCircle, Undo2 } from 'lucide-react';
import { PluginFieldsPanel } from '../components/PluginFieldsPanel';

interface Line {
  id?: string;
  accountId: string;
  debit: number | string;
  credit: number | string;
  description?: string;
  partnerId?: string | null;
  costCenterId?: string | null;
  profitCenterId?: string | null;
  internalOrderId?: string | null;
}

interface Entry {
  id: string;
  number: number;
  date: string;
  periodId: string;
  description: string | null;
  source: string;
  status: 'draft' | 'posted' | 'reversed';
  reversedById: string | null;
  lines?: Line[];
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  sales_invoice: 'Factura venta',
  purchase_invoice: 'Factura compra',
  payment: 'Pago',
  payroll: 'Nómina',
  period_close: 'Cierre',
  period_open: 'Apertura',
  reversal: 'Reversión',
};

const STATUS_VARIANT: Record<string, any> = {
  draft: 'neutral',
  posted: 'success',
  reversed: 'warning',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  posted: 'Asentado',
  reversed: 'Reversado',
};

export const JournalEntries: React.FC = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;

  const [rows, setRows] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [header, setHeader] = useState<Partial<Entry>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const authHeaders = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/journal-entries', { headers: authHeaders }).then((r) => r.json()),
        fetch('/api/chart-of-accounts', { headers: authHeaders }).then((r) => r.json()),
        fetch('/api/periods', { headers: authHeaders }).then((r) => r.json()),
      ]);
      setRows(Array.isArray(r1) ? r1 : []);
      setAccounts(Array.isArray(r2) ? r2 : []);
      setPeriods(Array.isArray(r3) ? r3 : []);
    } catch {
      toast.error('Error al cargar asientos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    const today = new Date().toISOString().substring(0, 10);
    const openPeriod = periods.find((p) => p.status === 'O');
    setHeader({ date: today, periodId: openPeriod?.id || '', description: '', source: 'manual' });
    setLines([
      { accountId: '', debit: 0, credit: 0 },
      { accountId: '', debit: 0, credit: 0 },
    ]);
    setPluginValues({});
  };

  const openEdit = async (r: Entry) => {
    const res = await fetch(`/api/journal-entries/${r.id}`, { headers: authHeaders });
    const full = await res.json();
    setEditing(full);
    setHeader({
      date: full.date?.substring(0, 10),
      periodId: full.periodId,
      description: full.description || '',
      source: full.source,
    });
    setLines(
      (full.lines || []).map((l: any) => ({
        id: l.id,
        accountId: l.accountId,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
        partnerId: l.partnerId,
        costCenterId: l.costCenterId,
        profitCenterId: l.profitCenterId,
        internalOrderId: l.internalOrderId,
      })),
    );
    setPluginValues(full);
  };

  const closeForm = () => {
    setEditing(null);
    setHeader({});
    setLines([]);
    setPluginValues({});
  };

  const addLine = () => setLines([...lines, { accountId: '', debit: 0, credit: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalDebit = useMemo(
    () => lines.reduce((s, l) => s + Number(l.debit || 0), 0),
    [lines],
  );
  const totalCredit = useMemo(
    () => lines.reduce((s, l) => s + Number(l.credit || 0), 0),
    [lines],
  );
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.periodId) {
      toast.error('Debes elegir un período');
      return;
    }
    if (lines.length < 2) {
      toast.error('Un asiento necesita al menos 2 líneas');
      return;
    }
    if (!balanced) {
      toast.error(`Asiento descuadrado: debe ${totalDebit.toFixed(2)} ≠ haber ${totalCredit.toFixed(2)}`);
      return;
    }
    setSubmitting(true);
    try {
      const body = { ...header, ...pluginValues, lines };
      const url = editing ? `/api/journal-entries/${editing.id}` : '/api/journal-entries';
      // NOTA: para editar un asiento draft se crearía un endpoint PATCH;
      // de momento solo permitimos crear + postear + reversar. Los borradores
      // se pueden eliminar y recrear si hace falta.
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar');
        return;
      }
      toast.success('Asiento creado en borrador');
      closeForm();
      fetchAll();
    } catch {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    try {
      const res = await fetch(`/api/journal-entries/${id}/post`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al postear');
        return;
      }
      toast.success(`Asiento nº ${data.number} posteado`);
      fetchAll();
    } catch {
      toast.error('Error de red');
    }
  };

  const handleReverse = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Reversar asiento',
      message:
        'Se creará un contra-asiento que invierte debe y haber, y el original quedará marcado como reversado.',
      tone: 'warning',
      confirmLabel: 'Reversar',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/journal-entries/${id}/reverse`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al reversar');
        return;
      }
      toast.success('Reversión creada y posteada');
      fetchAll();
    } catch {
      toast.error('Error de red');
    }
  };

  const columns: TableColumn<Entry>[] = [
    {
      header: 'Nº',
      cell: (r: Entry) => (r.status === 'draft' ? <span className="text-slate-400">—</span> : <b>{r.number}</b>),
    },
    { header: 'Fecha', cell: (r: Entry) => new Date(r.date).toLocaleDateString() },
    { header: 'Concepto', accessor: 'description' },
    {
      header: 'Origen',
      cell: (r: Entry) => <Badge variant="info">{SOURCE_LABELS[r.source] || r.source}</Badge>,
    },
    {
      header: 'Estado',
      cell: (r: Entry) => (
        <Badge variant={STATUS_VARIANT[r.status] || 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
      ),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: Entry) => (
        <div className="flex items-center justify-end gap-2">
          {r.status === 'draft' && canWrite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePost(r.id);
              }}
              className="text-emerald-600 hover:text-emerald-700"
              title="Postear"
            >
              <CheckCircle size={16} />
            </button>
          )}
          {r.status === 'posted' && canWrite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleReverse(r.id);
              }}
              className="text-amber-600 hover:text-amber-700"
              title="Reversar"
            >
              <Undo2 size={16} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
            className="text-slate-500 hover:text-blue-600"
            title="Ver"
          >
            <Pencil size={16} />
          </button>
        </div>
      ),
    },
  ];

  const formOpen = editing !== null || lines.length > 0;
  const isReadOnly = !!editing && editing.status !== 'draft';

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            <ScrollText className="text-blue-600 dark:text-blue-300" size={32} />
            Asientos contables
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Doble partida. Los asientos posteados son inmutables — para corregir se reversan.
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={18} />
            Nuevo asiento
          </Button>
        )}
      </div>

      {formOpen && (
        <Card className="p-6 border-blue-50 shadow-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                type="date"
                label="Fecha"
                value={(header.date as string) || ''}
                onChange={(e) => setHeader({ ...header, date: e.target.value })}
                disabled={isReadOnly}
                required
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Período
                </label>
                <select
                  value={header.periodId || ''}
                  onChange={(e) => setHeader({ ...header, periodId: e.target.value })}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-60"
                  required
                >
                  <option value="">— seleccionar —</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.status !== 'O'}>
                      {p.code} — {p.name} {p.status !== 'O' ? '(cerrado)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Concepto"
                value={(header.description as string) || ''}
                onChange={(e) => setHeader({ ...header, description: e.target.value })}
                disabled={isReadOnly}
              />
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Cuenta</th>
                    <th className="p-2 text-left">Descripción</th>
                    <th className="p-2 text-right">Debe</th>
                    <th className="p-2 text-right">Haber</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-2 text-slate-400">{i + 1}</td>
                      <td className="p-2">
                        <select
                          value={l.accountId}
                          onChange={(e) => updateLine(i, { accountId: e.target.value })}
                          disabled={isReadOnly}
                          className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs disabled:opacity-60"
                          required
                        >
                          <option value="">—</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          value={l.description || ''}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                          disabled={isReadOnly}
                          className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.debit || ''}
                          onChange={(e) =>
                            updateLine(i, { debit: e.target.value, credit: 0 })
                          }
                          disabled={isReadOnly}
                          className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-right disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.credit || ''}
                          onChange={(e) =>
                            updateLine(i, { credit: e.target.value, debit: 0 })
                          }
                          disabled={isReadOnly}
                          className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-right disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        {!isReadOnly && lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-900/40 font-semibold">
                  <tr>
                    <td colSpan={3} className="p-2 text-right">
                      Totales:
                    </td>
                    <td className="p-2 text-right">{totalDebit.toFixed(2)}</td>
                    <td className="p-2 text-right">{totalCredit.toFixed(2)}</td>
                    <td className="p-2 text-right">
                      {balanced ? (
                        <Badge variant="success">OK</Badge>
                      ) : (
                        <Badge variant="error">Δ {(totalDebit - totalCredit).toFixed(2)}</Badge>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {!isReadOnly && (
                <div className="p-2 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus size={14} />
                    Añadir línea
                  </button>
                </div>
              )}
            </div>

            <PluginFieldsPanel
              tableName="JournalEntry"
              values={pluginValues}
              onChange={(k, v) => setPluginValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                {isReadOnly ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!isReadOnly && (
                <Button type="submit" disabled={submitting || !balanced}>
                  Guardar borrador
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={columns} data={rows} isLoading={loading} />
      </Card>
    </div>
  );
};

export default JournalEntries;
