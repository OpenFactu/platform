import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup } from '@openfactu/ui';
import { useAuth } from '../../context/AuthContext';
import { AlertOctagon, Plus, Pencil, Trash2 } from 'lucide-react';

interface IncidentType {
  id: string;
  code: string;
  name: string;
  requiresSubstitution: boolean;
  affectsPayroll: boolean;
  consumesLeaveBalance: boolean;
  requiresDocument: boolean;
  paid: boolean;
  color: string | null;
  isActive: boolean;
}

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
  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/hr/incident-types', { headers: authHeaders });
      const d = await r.json();
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
    const url = isNew ? '/api/hr/incident-types' : `/api/hr/incident-types/${editing.id}`;
    const r = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    const d = await r.json();
    if (!r.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success('Guardado');
    setEditing(null);
    fetchAll();
  };

  const remove = async (t: IncidentType) => {
    const ok = await popup.confirm({ title: `Desactivar ${t.code}?`, message: '¿Desactivar este tipo de incidencia?', tone: 'danger' });
    if (!ok) return;
    await fetch(`/api/hr/incident-types/${t.id}`, { method: 'DELETE', headers: authHeaders });
    fetchAll();
  };

  const columns = [
    { header: 'Código', cell: (r: IncidentType) => <code>{r.code}</code> },
    { header: 'Nombre', cell: (r: IncidentType) => r.name },
    {
      header: 'Sustitución',
      cell: (r: IncidentType) => (r.requiresSubstitution ? <Badge variant="warning">Sí</Badge> : '—'),
    },
    {
      header: 'Nómina',
      cell: (r: IncidentType) => (r.affectsPayroll ? <Badge variant="info">Sí</Badge> : '—'),
    },
    { header: 'Pagado', cell: (r: IncidentType) => (r.paid ? 'Sí' : 'No') },
    { header: 'Activo', cell: (r: IncidentType) => (r.isActive ? 'Sí' : 'No') },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: IncidentType) => (
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

  return (
    <div className="p-4 w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <AlertOctagon className="text-amber-600" size={32} /> Tipos de incidencia
          </h1>
          <p className="text-slate-500">Configura los tipos de ausencia/incidencia y su política.</p>
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
                <label key={k} className="flex items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={Boolean((editing as any)[k])}
                    onChange={(e) => setEditing({ ...editing, [k]: e.target.checked })}
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
        <Table columns={columns} data={rows} isLoading={loading} />
      </Card>
    </div>
  );
};

export default IncidentTypes;
