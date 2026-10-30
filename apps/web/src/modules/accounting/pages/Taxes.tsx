import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Table, PageHeader, useToast, Badge } from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Percent, Plus, Trash2, Edit3, Save, X, Info } from 'lucide-react';
import { taxesApi } from '../api';
import type { Tax } from '../domain/accounting';

/** Id sintético de la fila de alta — se anexa a `data` para que comparta
 *  columnas (y por tanto anchos) con el resto de la tabla. */
const NEW_ROW_ID = '__new';

export const Taxes: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const toast = useToast();
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<{ code: string; rate: string } | null>(null);

  const fetchTaxes = async () => {
    setLoading(true);
    try {
      const data = await taxesApi.list();
      setTaxes(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t('accounting.taxes.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) {
      fetchTaxes();
    }
  }, [user?.tenantId]);

  const handleCreate = async () => {
    if (!newRow || !newRow.code || !newRow.rate) return;
    try {
      await taxesApi.create(newRow);
      toast.success(t('accounting.taxes.created'));
      setNewRow(null);
      fetchTaxes();
    } catch {
      toast.error(t('accounting.taxes.createError'));
    }
  };

  const handleUpdate = async (id: string, code: string, rate: string) => {
    try {
      await taxesApi.update(id, { code, rate });
      toast.success(t('accounting.taxes.updated'));
      setEditingId(null);
      fetchTaxes();
    } catch {
      toast.error(t('accounting.taxes.updateError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('accounting.taxes.deleteConfirm'))) return;
    try {
      await taxesApi.remove(id);
      toast.success(t('accounting.taxes.deleted'));
      fetchTaxes();
    } catch {
      toast.error(t('accounting.common.errorDeleting'));
    }
  };

  /** Filas de la tabla: los impuestos más, si se está creando, la fila de alta. */
  const rows: any[] = newRow ? [...taxes, { id: NEW_ROW_ID, ...newRow }] : taxes;

  const columns: TableColumn<any>[] = [
    {
      header: t('accounting.taxes.code'),
      cell: (tax) => {
        if (tax.id === NEW_ROW_ID)
          return (
            <Input
              placeholder={t('accounting.taxes.codePlaceholder')}
              value={newRow?.code ?? ''}
              onChange={(e) => setNewRow({ code: e.target.value, rate: newRow?.rate ?? '' })}
            />
          );
        if (editingId === tax.id)
          return (
            <Input
              value={tax.code}
              onChange={(e) =>
                setTaxes(taxes.map((x) => (x.id === tax.id ? { ...x, code: e.target.value } : x)))
              }
            />
          );
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-bg-muted rounded-lg flex items-center justify-center text-fg-subtle group-hover:bg-accent/10 group-hover:text-accent transition-colors">
              <Percent size={16} />
            </div>
            <div>
              <p className="font-black text-fg-default">{tax.code}</p>
              <p className="text-[10px] text-fg-subtle font-bold uppercase">
                {t('accounting.taxes.masterId')}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      header: t('accounting.taxes.rate'),
      align: 'center',
      cell: (tax) => {
        if (tax.id === NEW_ROW_ID)
          return (
            <Input
              type="number"
              placeholder="21"
              value={newRow?.rate ?? ''}
              onChange={(e) => setNewRow({ code: newRow?.code ?? '', rate: e.target.value })}
              className="text-center"
            />
          );
        if (editingId === tax.id)
          return (
            <Input
              type="number"
              value={tax.rate}
              onChange={(e) =>
                setTaxes(taxes.map((x) => (x.id === tax.id ? { ...x, rate: e.target.value } : x)))
              }
              className="text-center"
            />
          );
        return <Badge variant="neutral">{tax.rate}%</Badge>;
      },
    },
    {
      // Guardar/cancelar tienen que estar siempre visibles mientras se edita,
      // así que se quedan en su columna; editar y eliminar van a `rowActions`.
      header: t('accounting.taxes.actions'),
      align: 'right',
      width: '11rem',
      cell: (tax) => {
        if (tax.id === NEW_ROW_ID)
          return (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" onClick={handleCreate} className="gap-2">
                <Save size={14} /> {t('accounting.common.save')}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                <X size={14} />
              </Button>
            </div>
          );
        if (editingId === tax.id)
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => handleUpdate(tax.id, tax.code, String(tax.rate))}
                className="gap-2"
              >
                <Save size={14} /> {t('accounting.taxes.apply')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setEditingId(null)}
              >
                <X size={14} />
              </Button>
            </div>
          );
        return null;
      },
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse entre botones y menú contextual.
  const rowActions = (tax: any): RowAction[] =>
    tax.id === NEW_ROW_ID || editingId === tax.id
      ? []
      : [
          {
            label: t('accounting.common.edit'),
            icon: <Edit3 size={14} />,
            disabled: !canWrite,
            onClick: () => setEditingId(tax.id),
          },
          {
            label: t('accounting.common.delete'),
            icon: <Trash2 size={14} />,
            destructive: true,
            disabled: !canDelete,
            onClick: () => handleDelete(tax.id),
          },
        ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow={t('accounting.taxes.eyebrow')}
        title={t('accounting.taxes.title')}
        subtitle={t('accounting.taxes.subtitle')}
        icon={<Percent size={18} />}
        size="lg"
        actions={
          <Button
            type="button"
            onClick={() => setNewRow({ code: '', rate: '' })}
            disabled={!!newRow || !canWrite}
            className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
          >
            <Plus size={18} /> {t('accounting.taxes.new')}
          </Button>
        }
      />

      <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-lg flex items-start gap-4 text-blue-800 dark:text-blue-300">
        <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-lg text-blue-600 dark:text-blue-300">
          <Info size={20} />
        </div>
        <div className="text-sm">
          <p className="font-black uppercase text-[10px] mb-1">{t('accounting.taxes.noteTitle')}</p>
          <p className="font-medium opacity-80">{t('accounting.taxes.noteBody')}</p>
        </div>
      </div>

      <Card className="overflow-hidden border-0" noPadding>
        {/* La Table trae cabecera, esqueleto de carga y estado vacío: el
            <table> a mano y sus filas especiales sobraban. */}
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage={t('accounting.taxes.empty')}
        />
      </Card>
    </div>
  );
};
