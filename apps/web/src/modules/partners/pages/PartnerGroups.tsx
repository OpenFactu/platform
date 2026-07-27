import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Checkbox, useToast, usePopup, Badge, Table } from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Network, Plus, Trash2, Save, X, UserCheck, ShoppingBag, Pencil } from 'lucide-react';
import { partnerGroupsApi } from '../api';

export const PartnerGroups: React.FC = () => {
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
  const popup = usePopup();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<any | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await partnerGroupsApi.list();
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar grupos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchGroups();
  }, [user?.tenantId]);

  const handleCreate = async () => {
    if (!newRow?.code || !newRow?.name) return;
    try {
      await partnerGroupsApi.create({
        ...newRow,
        code: newRow.code.toUpperCase(),
        codePrefix: newRow.codePrefix?.trim().toUpperCase() || null,
      });
      setNewRow(null);
      fetchGroups();
      toast.success('Grupo creado');
    } catch {
      toast.error('Error al crear');
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      await partnerGroupsApi.update(id, {
        ...data,
        code: data.code.toUpperCase(),
        codePrefix: data.codePrefix?.trim().toUpperCase() || null,
      });
      setEditingId(null);
      fetchGroups();
      toast.success('Grupo actualizado');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar grupo',
      message: '¿Seguro que deseas eliminar este grupo?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await partnerGroupsApi.remove(id);
      fetchGroups();
      toast.success('Grupo eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // Menú ⋯ / click derecho de la fila. Mismo gating de permisos que tenían los
  // botones de la antigua columna de acciones.
  const rowActions = (g: any): RowAction[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingId(g.id),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(g.id),
    },
  ];

  /** Casilla con etiqueta: Checkbox no expone `label`. */
  const labelledCheck = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-xs font-bold text-fg-body cursor-pointer">
      <Checkbox checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );

  const patchGroup = (id: string, patch: Record<string, any>) =>
    setGroups(groups.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const columns: TableColumn<any>[] = [
    {
      header: 'Identificación',
      cell: (g) =>
        editingId === g.id ? (
          <div className="space-y-2">
            <Input
              value={g.code}
              onChange={(e) => patchGroup(g.id, { code: e.target.value })}
              inputSize="sm"
              autoFocus
            />
            <Input
              value={g.name}
              onChange={(e) => patchGroup(g.id, { name: e.target.value })}
              inputSize="sm"
            />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-bg-muted text-accent rounded-xl flex items-center justify-center font-black group-hover:bg-accent group-hover:text-accent-fg transition-all text-xs">
              {g.code?.substring(0, 2).toUpperCase() || '??'}
            </div>
            <div>
              <p className="font-bold text-fg-default text-sm leading-tight">{g.name}</p>
              <p className="text-[10px] text-fg-subtle font-bold uppercase tracking-widest">
                {g.code}
              </p>
            </div>
          </div>
        ),
    },
    {
      header: 'Codificación',
      align: 'center',
      cell: (g) =>
        editingId === g.id ? (
          <Input
            value={g.codePrefix || ''}
            onChange={(e) => patchGroup(g.id, { codePrefix: e.target.value })}
            inputSize="sm"
            className="uppercase font-mono text-center"
            maxLength={5}
          />
        ) : g.codePrefix ? (
          <Badge variant="neutral" className="font-mono tracking-widest text-[10px] bg-bg-muted">
            {g.codePrefix}-XXX
          </Badge>
        ) : (
          <span className="text-fg-subtle italic text-[10px]">Sin Prefijo</span>
        ),
    },
    {
      header: 'Tipología',
      align: 'center',
      cell: (g) =>
        editingId === g.id ? (
          <div className="flex flex-col gap-2">
            {labelledCheck('Cliente', g.isCustomer, (v) => patchGroup(g.id, { isCustomer: v }))}
            {labelledCheck('Proveedor', g.isVendor, (v) => patchGroup(g.id, { isVendor: v }))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            {g.isCustomer && (
              <Badge variant="success" className="w-full justify-center gap-1.5">
                <UserCheck size={10} />
                <span className="text-[9px] font-black uppercase">Cliente</span>
              </Badge>
            )}
            {g.isVendor && (
              <Badge variant="warning" className="w-full justify-center gap-1.5">
                <ShoppingBag size={10} />
                <span className="text-[9px] font-black uppercase">Proveedor</span>
              </Badge>
            )}
          </div>
        ),
    },
    {
      // Solo se usa mientras se edita una fila; el resto del tiempo va vacía
      // porque editar/eliminar viven en el menú ⋯.
      id: 'edicion',
      header: '',
      align: 'right',
      cell: (g) =>
        editingId === g.id ? (
          <div className="flex justify-end gap-2 whitespace-nowrap">
            <Button type="button" size="sm" onClick={() => handleUpdate(g.id, g)}>
              <Save size={14} className="mr-2" /> Aplicar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>
              <X size={14} />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-accent rounded-lg text-accent-fg">
              <Network size={20} />
            </span>
            <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">
              CRM / Estructura
            </span>
          </div>
          <h1 className="text-4xl font-black text-fg-default tracking-tight text-display">
            Grupos de Socios
          </h1>
          <p className="text-fg-muted font-medium">
            Clasifica tus interlocutores comerciales para segmentación y tarifas.
          </p>
        </div>
        <Button
          onClick={() =>
            setNewRow({ code: '', name: '', codePrefix: '', isCustomer: false, isVendor: false })
          }
          disabled={!!newRow || !canWrite}
          className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Plus size={18} /> Nuevo Grupo
        </Button>
      </header>

      <Card className="overflow-hidden border-0" noPadding>
        <Table
          columns={columns}
          data={groups}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage="Todavía no hay grupos de socios"
          skeletonRowHeight={40}
          appendRow={
            // Alta rápida: la Table la pinta como una fila a lo ancho al final
            // del cuerpo, en lugar del <tr> con celdas de antes.
            newRow ? (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-bg-muted">
                <Input
                  placeholder="Cód (Ej: VIP)"
                  value={newRow.code}
                  onChange={(e) => setNewRow({ ...newRow, code: e.target.value })}
                  inputSize="sm"
                  containerClassName="w-32"
                  autoFocus
                />
                <Input
                  placeholder="Nombre del Grupo"
                  value={newRow.name}
                  onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                  inputSize="sm"
                  containerClassName="flex-1 min-w-[180px]"
                />
                <Input
                  placeholder="Prefijo (Ej: V)"
                  value={newRow.codePrefix}
                  onChange={(e) => setNewRow({ ...newRow, codePrefix: e.target.value })}
                  inputSize="sm"
                  containerClassName="w-32"
                  className="uppercase font-mono text-center"
                  maxLength={5}
                />
                <div className="flex gap-4">
                  {labelledCheck('Cliente', newRow.isCustomer, (v) =>
                    setNewRow({ ...newRow, isCustomer: v }),
                  )}
                  {labelledCheck('Proveedor', newRow.isVendor, (v) =>
                    setNewRow({ ...newRow, isVendor: v }),
                  )}
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button type="button" size="sm" onClick={handleCreate}>
                    <Save size={14} className="mr-2" /> Guardar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setNewRow(null)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      </Card>
    </div>
  );
};
