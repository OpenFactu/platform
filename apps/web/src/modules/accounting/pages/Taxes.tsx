import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Table, useToast, Badge } from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Percent, Plus, Trash2, Edit3, Save, X, Info } from 'lucide-react';
import { taxesApi } from '../api';
import type { Tax } from '../domain/accounting';

/** Id sintético de la fila de alta — se anexa a `data` para que comparta
 *  columnas (y por tanto anchos) con el resto de la tabla. */
const NEW_ROW_ID = '__new';

export const Taxes: React.FC = () => {
  const { user } = useAuth();
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
      toast.error('Error al cargar impuestos');
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
      toast.success('Impuesto creado');
      setNewRow(null);
      fetchTaxes();
    } catch {
      toast.error('Error al crear impuesto');
    }
  };

  const handleUpdate = async (id: string, code: string, rate: string) => {
    try {
      await taxesApi.update(id, { code, rate });
      toast.success('Impuesto actualizado');
      setEditingId(null);
      fetchTaxes();
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        '¿Seguro que deseas eliminar este tipo de IVA? Esto podría afectar a los documentos que lo usen.',
      )
    )
      return;
    try {
      await taxesApi.remove(id);
      toast.success('Impuesto eliminado');
      fetchTaxes();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  /** Filas de la tabla: los impuestos más, si se está creando, la fila de alta. */
  const rows: any[] = newRow ? [...taxes, { id: NEW_ROW_ID, ...newRow }] : taxes;

  const columns: TableColumn<any>[] = [
    {
      header: 'Código / Identificador',
      cell: (t) => {
        if (t.id === NEW_ROW_ID)
          return (
            <Input
              placeholder="Ej: IVA_21"
              value={newRow?.code ?? ''}
              onChange={(e) => setNewRow({ code: e.target.value, rate: newRow?.rate ?? '' })}
            />
          );
        if (editingId === t.id)
          return (
            <Input
              value={t.code}
              onChange={(e) =>
                setTaxes(taxes.map((x) => (x.id === t.id ? { ...x, code: e.target.value } : x)))
              }
            />
          );
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-bg-muted rounded-lg flex items-center justify-center text-fg-subtle group-hover:bg-accent/10 group-hover:text-accent transition-colors">
              <Percent size={16} />
            </div>
            <div>
              <p className="font-black text-fg-default">{t.code}</p>
              <p className="text-[10px] text-fg-subtle font-bold uppercase">
                Identificador Maestro
              </p>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Porcentaje (%)',
      align: 'center',
      cell: (t) => {
        if (t.id === NEW_ROW_ID)
          return (
            <Input
              type="number"
              placeholder="21"
              value={newRow?.rate ?? ''}
              onChange={(e) => setNewRow({ code: newRow?.code ?? '', rate: e.target.value })}
              className="text-center"
            />
          );
        if (editingId === t.id)
          return (
            <Input
              type="number"
              value={t.rate}
              onChange={(e) =>
                setTaxes(taxes.map((x) => (x.id === t.id ? { ...x, rate: e.target.value } : x)))
              }
              className="text-center"
            />
          );
        return <Badge variant="neutral">{t.rate}%</Badge>;
      },
    },
    {
      // Guardar/cancelar tienen que estar siempre visibles mientras se edita,
      // así que se quedan en su columna; editar y eliminar van a `rowActions`.
      header: 'Acciones',
      align: 'right',
      width: '11rem',
      cell: (t) => {
        if (t.id === NEW_ROW_ID)
          return (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" onClick={handleCreate} className="gap-2">
                <Save size={14} /> Guardar
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                <X size={14} />
              </Button>
            </div>
          );
        if (editingId === t.id)
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => handleUpdate(t.id, t.code, String(t.rate))}
                className="gap-2"
              >
                <Save size={14} /> Aplicar
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
  const rowActions = (t: any): RowAction[] =>
    t.id === NEW_ROW_ID || editingId === t.id
      ? []
      : [
          {
            label: 'Editar',
            icon: <Edit3 size={14} />,
            disabled: !canWrite,
            onClick: () => setEditingId(t.id),
          },
          {
            label: 'Eliminar',
            icon: <Trash2 size={14} />,
            destructive: true,
            disabled: !canDelete,
            onClick: () => handleDelete(t.id),
          },
        ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-amber-600 rounded-lg text-white">
              <Percent size={20} />
            </span>
            <span className="text-[10px] font-black text-amber-600 dark:text-amber-300 uppercase tracking-[0.2em]">
              Finanzas / Configuración
            </span>
          </div>
          <h1 className="text-4xl font-black text-fg-default tracking-tight">
            Gestión de Impuestos
          </h1>
          <p className="text-fg-muted font-medium">
            Configura los tipos de IVA y retenciones aplicables a tus documentos.
          </p>
        </div>
        <Button
          onClick={() => setNewRow({ code: '', rate: '' })}
          disabled={!!newRow || !canWrite}
          className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Plus size={18} /> Nuevo Impuesto
        </Button>
      </header>

      <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-2xl flex items-start gap-4 text-blue-800 dark:text-blue-300">
        <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-xl text-blue-600 dark:text-blue-300">
          <Info size={20} />
        </div>
        <div className="text-sm">
          <p className="font-black uppercase text-[10px] mb-1">Nota importante</p>
          <p className="font-medium opacity-80">
            Los impuestos definidos aquí aparecerán automáticamente en la selección de líneas de
            Pedidos, Albaranes y Facturas. El sistema calculará la cuota de IVA basándose en el
            porcentaje aquí definido.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-0" noPadding>
        {/* La Table trae cabecera, esqueleto de carga y estado vacío: el
            <table> a mano y sus filas especiales sobraban. */}
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage="No hay impuestos definidos todavía."
        />
      </Card>
    </div>
  );
};
