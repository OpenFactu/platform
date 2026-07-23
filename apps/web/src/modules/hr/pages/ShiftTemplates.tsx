import { shiftTemplatesApi } from '../api';
import type { ShiftTemplate } from '../domain/shift';
import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Input, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ApiError } from '@/shared/http';

const empty = (): Partial<ShiftTemplate> => ({
  code: '',
  name: '',
  startTime: '08:00',
  endTime: '15:00',
  breakMinutes: 0,
  secondStartTime: null,
  secondEndTime: null,
  color: '#6366F1',
  isActive: true,
});

export const ShiftTemplates: React.FC = () => {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<ShiftTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<ShiftTemplate> | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await shiftTemplatesApi.list();
      setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.code || !editing?.name) {
      toast.error('Código y nombre obligatorios');
      return;
    }
    const isNew = !editing.id;
    try {
      if (isNew) {
        await shiftTemplatesApi.create(editing);
      } else {
        await shiftTemplatesApi.update(editing.id!, editing);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const remove = async (t: ShiftTemplate) => {
    await shiftTemplatesApi.remove(t.id);
    fetchAll();
  };

  const columns = [
    {
      header: 'Color',
      cell: (r: ShiftTemplate) => (
        <span className="inline-block w-4 h-4 rounded" style={{ background: r.color || '#999' }} />
      ),
    },
    { header: 'Código', cell: (r: ShiftTemplate) => <code>{r.code}</code> },
    { header: 'Nombre', cell: (r: ShiftTemplate) => r.name },
    {
      header: 'Horario',
      cell: (r: ShiftTemplate) =>
        r.secondStartTime && r.secondEndTime ? (
          <span>
            {r.startTime}–{r.endTime}{' '}
            <span className="text-amber-600 font-bold">
              + {r.secondStartTime}–{r.secondEndTime}
            </span>
          </span>
        ) : (
          `${r.startTime} – ${r.endTime}`
        ),
    },
    { header: 'Pausa (min)', cell: (r: ShiftTemplate) => r.breakMinutes },
    {
      header: '',
      align: 'right' as const,
      cell: (r: ShiftTemplate) => (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setEditing(r)} className="text-slate-500 hover:text-indigo-600">
            <Pencil size={16} />
          </button>
          <button onClick={() => remove(r)} className="text-slate-400 hover:text-red-500">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<ShiftTemplate>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (r: ShiftTemplate) => [
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Clock className="text-indigo-600" size={32} /> Plantillas de turno
          </h1>
          <p className="text-slate-500">
            Cada plantilla define un turno por horas reales (no fijo). Se usan en patrones y
            asignaciones.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(empty())}>
          <Plus size={14} /> Nueva plantilla
        </Button>
      </div>

      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Input
                label="Código"
                value={editing.code || ''}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                required
              />
              <div className="md:col-span-2">
                <Input
                  label="Nombre"
                  value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              <Input
                label="Inicio"
                type="time"
                value={editing.startTime || '08:00'}
                onChange={(e) => setEditing({ ...editing, startTime: e.target.value })}
                required
              />
              <Input
                label="Fin"
                type="time"
                value={editing.endTime || '15:00'}
                onChange={(e) => setEditing({ ...editing, endTime: e.target.value })}
                required
              />
              <Input
                label="Pausa (min)"
                type="number"
                value={editing.breakMinutes ?? 0}
                onChange={(e) =>
                  setEditing({ ...editing, breakMinutes: Number(e.target.value) || 0 })
                }
              />
              <div>
                <label className="block text-sm mb-1">Color</label>
                <input
                  type="color"
                  value={editing.color || '#6366F1'}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  className="w-full h-9 rounded border"
                />
              </div>
            </div>

            {/* Turno partido opcional */}
            <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    Turno partido (segundo tramo)
                  </div>
                  <div className="text-xs text-slate-500">
                    Opcional. Si lo defines, al aplicar la plantilla se generan dos turnos en el
                    mismo día (mañana + tarde).
                  </div>
                </div>
                {editing.secondStartTime || editing.secondEndTime ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEditing({ ...editing, secondStartTime: null, secondEndTime: null })
                    }
                  >
                    Quitar partido
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        secondStartTime: '16:00',
                        secondEndTime: '20:00',
                      })
                    }
                  >
                    + Añadir tramo tarde
                  </Button>
                )}
              </div>
              {(editing.secondStartTime || editing.secondEndTime) && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Inicio 2º tramo"
                    type="time"
                    value={editing.secondStartTime || ''}
                    onChange={(e) => setEditing({ ...editing, secondStartTime: e.target.value })}
                  />
                  <Input
                    label="Fin 2º tramo"
                    type="time"
                    value={editing.secondEndTime || ''}
                    onChange={(e) => setEditing({ ...editing, secondEndTime: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </Card>
      )}

      <Card noPadding>
        <Table columns={ctxColumns} data={rows} isLoading={loading} />
      </Card>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  );
};

export default ShiftTemplates;
