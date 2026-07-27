import { kiosksApi } from '../api';
import type { Kiosk } from '../domain/kiosk';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Table, useToast, usePopup, PageHeader } from '@openfactu/ui';
import type { TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import {
  Tablet,
  Plus,
  RefreshCw,
  Trash2,
  Copy,
  Link as LinkIcon,
  ExternalLink,
} from 'lucide-react';
import { ApiError } from '@/shared/http';

export const Kiosks: React.FC = () => {
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [rows, setRows] = useState<Kiosk[]>([]);
  const [editing, setEditing] = useState<Partial<Kiosk> | null>(null);
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
      const d = await kiosksApi.list();
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
    if (!editing?.name) return;
    const isNew = !editing.id;
    try {
      if (isNew) {
        await kiosksApi.create(editing);
      } else {
        await kiosksApi.update(editing.id!, editing);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const regenerate = async (k: Kiosk) => {
    const ok = await popup.confirm({
      title: 'Regenerar token',
      message: '¿Regenerar token? El kiosko deberá ser configurado de nuevo.',
      tone: 'danger',
      confirmLabel: 'Regenerar',
    });
    if (!ok) return;
    await kiosksApi.regenerateToken(k.id);
    fetchAll();
  };

  const remove = async (k: Kiosk) => {
    const ok = await popup.confirm({
      title: 'Eliminar kiosko',
      message: `¿Eliminar el kiosko "${k.name}"?`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    await kiosksApi.remove(k.id);
    fetchAll();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const kioskUrl = (k: Kiosk) => {
    const tenant = user?.tenantId || '';
    const params = new URLSearchParams({ token: k.token, tenant });
    return `${window.location.origin}/kiosk?${params.toString()}`;
  };

  const copyLink = (k: Kiosk) => {
    const url = kioskUrl(k);
    navigator.clipboard.writeText(url);
    toast.success('Enlace del kiosko copiado');
  };

  const openKiosk = (k: Kiosk) => {
    window.open(kioskUrl(k), '_blank', 'noopener');
  };

  const columns: TableColumn<Kiosk>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true, primary: true },
    {
      header: 'Ubicación',
      sortable: true,
      sortAccessor: (k) => k.location || '',
      cell: (k) => k.location || '—',
    },
    {
      header: 'Token (recortado)',
      cell: (k) => (
        <div className="flex items-center gap-2 font-mono text-xs">
          {k.token.slice(0, 8)}…
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => copy(k.token)}
            title="Copiar token completo"
          >
            <Copy size={14} />
          </Button>
        </div>
      ),
    },
    {
      header: 'Activo',
      sortable: true,
      sortAccessor: (k) => (k.isActive ? 1 : 0),
      cell: (k) => (k.isActive ? 'Sí' : 'No'),
    },
  ];

  const rowActions = (k: Kiosk): RowAction[] => [
    { label: 'Copiar enlace', icon: <LinkIcon size={14} />, onClick: () => copyLink(k) },
    { label: 'Abrir kiosko', icon: <ExternalLink size={14} />, onClick: () => openKiosk(k) },
    {
      label: 'Regenerar token',
      icon: <RefreshCw size={14} />,
      disabled: !canWrite,
      onClick: () => regenerate(k),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => remove(k),
    },
  ];

  return (
    <div className="p-4 w-full space-y-6">
      <PageHeader
        title="Kioskos de fichaje"
        subtitle="Terminales compartidos donde los empleados fichan introduciendo su PIN personal."
        icon={<Tablet size={18} />}
        size="lg"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setEditing({ name: '', location: '' })}>
              <Plus size={14} /> Nuevo kiosko
            </Button>
          )
        }
      />

      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label="Nombre"
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
            />
            <Input
              label="Ubicación"
              value={editing.location || ''}
              onChange={(e) => setEditing({ ...editing, location: e.target.value })}
            />
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={!canWrite}>
                Guardar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
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
          emptyMessage="Todavía no hay kioskos configurados."
        />
      </Card>

      <p className="text-xs text-slate-400 italic">
        Para usar un kiosko: navega a <code>/kiosk?token=&lt;TOKEN&gt;</code> en el terminal y los
        empleados introducirán su PIN para fichar.
      </p>
    </div>
  );
};

export default Kiosks;
