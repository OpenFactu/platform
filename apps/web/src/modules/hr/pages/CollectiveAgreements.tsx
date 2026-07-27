import { collectiveAgreementsApi } from '../api';
import type { CollectiveAgreement as Agreement } from '../domain/collectiveAgreement';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Table, useToast, usePopup } from '@openfactu/ui';
import type { TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/http';

const empty = (): Partial<Agreement> => ({
  code: '',
  name: '',
  sector: '',
  validFrom: '',
  validTo: '',
  baseSalary: '0',
  vacationDays: 22,
  weeklyHours: '40',
  documentUrl: '',
  notes: '',
  isActive: true,
});

export const CollectiveAgreements: React.FC = () => {
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [rows, setRows] = useState<Agreement[]>([]);
  const [editing, setEditing] = useState<Partial<Agreement> | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const popup = usePopup();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await collectiveAgreementsApi.list();
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
        await collectiveAgreementsApi.create(editing);
      } else {
        await collectiveAgreementsApi.update(editing.id!, editing);
      }
      toast.success('Guardado');
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const remove = async (a: Agreement) => {
    const ok = await popup.confirm({
      title: 'Borrar convenio',
      message: `¿Borrar convenio ${a.code}?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    await collectiveAgreementsApi.remove(a.id);
    fetchAll();
  };

  const money = (v: unknown) =>
    `${Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

  const columns: TableColumn<Agreement>[] = [
    { header: 'Código', accessor: 'code', sortable: true, primary: true },
    { header: 'Nombre', accessor: 'name', sortable: true },
    {
      header: 'Sector',
      sortable: true,
      sortAccessor: (r) => r.sector || '',
      cell: (r) => <span className="text-fg-muted">{r.sector || '—'}</span>,
    },
    {
      header: 'Salario base',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => Number(r.baseSalary || 0),
      cell: (r) => <span className="tabular-nums">{money(r.baseSalary)}</span>,
      className: 'tabular-nums',
    },
    { header: 'Vacac.', accessor: 'vacationDays', align: 'right', sortable: true },
    { header: 'h/sem', accessor: 'weeklyHours', align: 'right', sortable: true },
    {
      header: 'Vigencia',
      cell: (r) => (
        <span className="text-xs text-fg-muted">
          {r.validFrom?.slice(0, 10) || '—'} → {r.validTo?.slice(0, 10) || '—'}
        </span>
      ),
    },
  ];

  // Editar/borrar viven en el menú ⋯ de la fila; la Table los ofrece también con
  // click derecho, así no hace falta una columna de botones.
  const rowActions = (r: Agreement): RowAction[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditing(r),
    },
    {
      label: 'Borrar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <BookOpen className="text-emerald-600" size={32} /> Convenios colectivos
          </h1>
          <p className="text-slate-500 text-sm">
            Catálogo de convenios. Asigna uno a cada contrato para que el salario base y los días de
            vacaciones se sugieran automáticamente.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setEditing(empty())}>
            <Plus size={14} /> Nuevo convenio
          </Button>
        )}
      </div>

      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
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
              label="Sector"
              value={editing.sector || ''}
              onChange={(e) => setEditing({ ...editing, sector: e.target.value })}
            />
            <Input
              label="Vigencia desde"
              type="date"
              value={(editing.validFrom || '').slice(0, 10)}
              onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })}
            />
            <Input
              label="Vigencia hasta"
              type="date"
              value={(editing.validTo || '').slice(0, 10)}
              onChange={(e) => setEditing({ ...editing, validTo: e.target.value })}
            />
            <Input
              label="Salario base anual"
              type="number"
              step="0.01"
              value={String(editing.baseSalary ?? '0')}
              onChange={(e) => setEditing({ ...editing, baseSalary: e.target.value })}
            />
            <Input
              label="Vacaciones (días)"
              type="number"
              value={String(editing.vacationDays ?? 22)}
              onChange={(e) => setEditing({ ...editing, vacationDays: Number(e.target.value) })}
            />
            <Input
              label="Horas / semana"
              type="number"
              step="0.5"
              value={String(editing.weeklyHours ?? '40')}
              onChange={(e) => setEditing({ ...editing, weeklyHours: e.target.value })}
            />
            <Input
              label="URL del PDF"
              value={editing.documentUrl || ''}
              onChange={(e) => setEditing({ ...editing, documentUrl: e.target.value })}
            />
            <div className="md:col-span-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canWrite}>
                Guardar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden" noPadding>
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={(r) => setEditing(r)}
          emptyMessage="Todavía no hay convenios dados de alta."
        />
      </Card>
    </div>
  );
};

export default CollectiveAgreements;
