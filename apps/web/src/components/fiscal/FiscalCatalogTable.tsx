import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, useToast, usePopup, Checkbox, Select, NumberInput } from '@openfactu/ui';
import { Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface CatalogColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'boolean' | 'select';
  width?: string;
  /** Opciones cuando type === 'select'. */
  options?: Array<{ label: string; value: string }>;
  /** Placeholder opcional para inputs de texto/número. */
  placeholder?: string;
}

interface Props {
  endpoint: string; // '/api/currencies', '/api/payment-methods', ...
  title: string;
  columns: CatalogColumn[];
  /** Plantilla para fila nueva */
  defaultRow: Record<string, any>;
  /** Formatter opcional de un valor para mostrar */
  render?: (col: CatalogColumn, row: any) => React.ReactNode;
}

/**
 * Tabla genérica CRUD para un catálogo fiscal auxiliar (Divisas, Tipos de
 * documento, Métodos de pago, Plazos de pago). Lista, edita inline y
 * permite crear/borrar. No valida mucho — los catálogos son pocos y los
 * gestionan admins.
 */
export const FiscalCatalogTable: React.FC<Props> = ({
  endpoint,
  title,
  columns,
  defaultRow,
  render,
}) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [creating, setCreating] = useState(false);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': user?.tenantId || '',
      'Content-Type': 'application/json',
    }),
    [token, user?.tenantId],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('GET', endpoint);
      const data = res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error(`Error cargando ${title}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (row: any, isNew: boolean) => {
    try {
      const url = isNew ? endpoint : `${endpoint}/${row.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = { ...row };
      if (isNew) delete body.id;
      const res = await coreApi.raw(method, url, body);
      if (!res.ok) throw new Error(res.data?.error || 'Error');
      toast.success(isNew ? 'Creado' : 'Actualizado');
      setEditingId(null);
      setCreating(false);
      setDraft({});
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    }
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar registro',
      message: 'Esta acción no se puede deshacer.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', `${endpoint}/${id}`);
      if (!res.ok) throw new Error(res.data?.error || 'Error');
      toast.success('Eliminado');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    }
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setDraft({ ...row });
    setCreating(false);
  };

  const startNew = () => {
    setCreating(true);
    setEditingId('__new');
    setDraft({ ...defaultRow });
  };

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setDraft({});
  };

  const renderCell = (col: CatalogColumn, row: any, isDraft: boolean) => {
    if (isDraft) {
      const val = draft[col.key];
      if (col.type === 'boolean') {
        return (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-700 dark:text-slate-200 cursor-pointer">
            <Checkbox
              checked={!!val}
              onChange={(checked) => setDraft({ ...draft, [col.key]: checked })}
            />
          </label>
        );
      }
      if (col.type === 'select' && col.options) {
        return (
          <Select
            options={col.options}
            value={(val as string) ?? ''}
            onChange={(v) => setDraft({ ...draft, [col.key]: v })}
            placeholder="—"
            ariaLabel={col.label}
          />
        );
      }
      if (col.type === 'number') {
        return (
          <NumberInput
            value={(val as number) ?? null}
            onChange={(v) => setDraft({ ...draft, [col.key]: v })}
            placeholder={col.placeholder}
            inputSize="sm"
          />
        );
      }
      return (
        <Input
          value={(val as string) ?? ''}
          onChange={(e) => setDraft({ ...draft, [col.key]: e.target.value })}
          placeholder={col.placeholder}
          inputSize="sm"
        />
      );
    }
    if (render) return render(col, row);
    const val = row[col.key];
    if (col.type === 'boolean') return val ? '✓' : '';
    return String(val ?? '');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          {title}
        </h3>
        {!creating && !editingId && (
          <Button size="sm" variant="outline" onClick={startNew} className="gap-1">
            <Plus size={14} /> Añadir
          </Button>
        )}
      </div>
      <div className="border border-line dark:border-ink-700 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-line-2/60 dark:bg-ink-800">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-4 text-center text-ink-400">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 && !creating ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-4 text-center text-ink-400 italic text-xs"
                >
                  Sin datos — pulsa "Añadir" para crear.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-line dark:border-ink-700 hover:bg-line-2/40 dark:hover:bg-ink-800/50"
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 align-middle">
                    {renderCell(c, row, editingId === row.id)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  {editingId === row.id ? (
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => save(draft, false)}
                        title="Guardar"
                      >
                        <Check size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancel}
                        title="Cancelar"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(row)}
                        title="Editar"
                      >
                        <Edit3 size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(row.id)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {creating && (
              <tr className="border-t border-line dark:border-ink-700 bg-accent/5">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    {renderCell(c, draft, true)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => save(draft, true)}
                      title="Guardar"
                    >
                      <Check size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={cancel}
                      title="Cancelar"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
