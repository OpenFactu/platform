import { incidentTypesApi } from '../api';
import type { IncidentType } from '../domain/incident';
import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup, Checkbox } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { AlertOctagon, Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/http';

const empty = (): Partial<IncidentType> => ({
  code: '',
  name: '',
  requiresSubstitution: false,
  affectsPayroll: false,
  consumesLeaveBalance: false,
  requiresDocument: false,
  paid: true,
  color: '#0EA5E9',
  isActive: true,
});

export const IncidentTypes: React.FC = () => {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<IncidentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<IncidentType> | null>(null);
  const toast = useToast();
  const popup = usePopup();
  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await incidentTypesApi.list();
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
        await incidentTypesApi.create(editing);
      } else {
        await incidentTypesApi.update(editing.id!, editing);
      }
      toast.success('Guardado');
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const remove = async (t: IncidentType) => {
    const ok = await popup.confirm({
      title: `Desactivar ${t.code}?`,
      message: '¿Desactivar este tipo de incidencia?',
      tone: 'danger',
    });
    if (!ok) return;
    await incidentTypesApi.remove(t.id);
    fetchAll();
  };

  const columns = [
    { header: 'Código', cell: (r: IncidentType) => <code>{r.code}</code> },
    { header: 'Nombre', cell: (r: IncidentType) => r.name },
    {
      header: 'Sustitución',
      cell: (r: IncidentType) =>
        r.requiresSubstitution ? <Badge variant="warning">Sí</Badge> : '—',
    },
    {
      header: 'Nómina',
      cell: (r: IncidentType) => (r.affectsPayroll ? <Badge variant="info">Sí</Badge> : '—'),
    },
    { header: 'Pagado', cell: (r: IncidentType) => (r.paid ? 'Sí' : 'No') },
    { header: 'Activo', cell: (r: IncidentType) => (r.isActive ? 'Sí' : 'No') },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hace falta duplicarlas
  // en una columna de botones.
  const rowActions = (r: IncidentType): RowAction[] => [
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <AlertOctagon className="text-amber-600" size={32} /> Tipos de incidencia
          </h1>
          <p className="text-slate-500">
            Configura los tipos de ausencia/incidencia y su política.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(empty())}>
          <Plus size={14} /> Nuevo tipo
        </Button>
      </div>

      {editing && (
        <Card className="p-6" noPadding>
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                ['requiresSubstitution', 'Requiere sustitución'],
                ['affectsPayroll', 'Afecta a nómina'],
                ['consumesLeaveBalance', 'Descuenta saldo'],
                ['requiresDocument', 'Justificante obligatorio'],
                ['paid', 'Retribuido'],
                ['isActive', 'Activo'],
              ].map(([k, lbl]) => (
                // Checkbox no tiene prop `label` → se conserva el <label> envolvente.
                <label key={k} className="flex items-center gap-2 select-none">
                  <Checkbox
                    checked={Boolean((editing as any)[k])}
                    onChange={(checked) => setEditing({ ...editing, [k]: checked })}
                  />
                  {lbl}
                </label>
              ))}
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
        <Table columns={columns} data={rows} isLoading={loading} rowActions={rowActions} />
      </Card>
    </div>
  );
};

export default IncidentTypes;
