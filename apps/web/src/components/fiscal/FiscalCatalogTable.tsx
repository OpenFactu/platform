import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Table,
  useToast,
  usePopup,
  Checkbox,
  Select,
  NumberInput,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/** Id sintético de la fila de alta — se anexa a `data` para que comparta
 *  columnas (y por tanto anchos) con el resto de la tabla. */
const NEW_ROW_ID = '__new';

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
    setEditingId(NEW_ROW_ID);
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
          <label className="inline-flex items-center gap-1.5 text-xs text-fg-body cursor-pointer">
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

  /** Filas de la tabla: el catálogo más, si se está creando, la fila de alta. */
  const data: any[] = creating ? [...rows, { id: NEW_ROW_ID }] : rows;

  const tableColumns: TableColumn<any>[] = [
    ...columns.map<TableColumn<any>>((c) => ({
      id: c.key,
      header: c.label,
      width: c.width,
      // En la fila de alta el valor sale de `draft`, no de la fila.
      cell: (row) => renderCell(c, row, row.id === NEW_ROW_ID || editingId === row.id),
    })),
    {
      // Guardar/cancelar tienen que estar siempre visibles mientras se edita,
      // así que se quedan en su columna; editar y eliminar van a `rowActions`.
      header: 'Acciones',
      align: 'right',
      width: '6rem',
      cell: (row) =>
        row.id === NEW_ROW_ID || editingId === row.id ? (
          <div className="inline-flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => save(draft, row.id === NEW_ROW_ID)}
              title="Guardar"
            >
              <Check size={14} />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancel} title="Cancelar">
              <X size={14} />
            </Button>
          </div>
        ) : null,
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho.
  const rowActions = (row: any): RowAction[] =>
    row.id === NEW_ROW_ID || editingId === row.id
      ? []
      : [
          { label: 'Editar', icon: <Edit3 size={14} />, onClick: () => startEdit(row) },
          {
            label: 'Eliminar',
            icon: <Trash2 size={14} />,
            destructive: true,
            onClick: () => remove(row.id),
          },
        ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-fg-muted">{title}</h3>
        {!creating && !editingId && (
          <Button type="button" size="sm" variant="outline" onClick={startNew} className="gap-1">
            <Plus size={14} /> Añadir
          </Button>
        )}
      </div>
      {/* La Table trae cabecera, esqueleto de carga y estado vacío: el <table>
          a mano y sus filas especiales sobraban. */}
      <div className="border border-border-default rounded-sm overflow-hidden">
        <Table
          columns={tableColumns}
          data={data}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage={'Sin datos — pulsa "Añadir" para crear.'}
        />
      </div>
    </div>
  );
};
