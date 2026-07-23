import { kiosksApi } from '../api';
import type { Kiosk } from '../domain/kiosk';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
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
  const [rows, setRows] = useState<Kiosk[]>([]);
  const [editing, setEditing] = useState<Partial<Kiosk> | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
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
    if (!confirm('¿Regenerar token? El kiosko deberá ser configurado de nuevo.')) return;
    await kiosksApi.regenerateToken(k.id);
    fetchAll();
  };

  const remove = async (k: Kiosk) => {
    if (!confirm(`Eliminar kiosko "${k.name}"?`)) return;
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

  return (
    <div className="p-4 w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Tablet className="text-indigo-600" size={32} /> Kioskos de fichaje
          </h1>
          <p className="text-slate-500">
            Terminales compartidos donde los empleados fichan introduciendo su PIN personal.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ name: '', location: '' })}>
          <Plus size={14} /> Nuevo kiosko
        </Button>
      </div>

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
              <Button type="submit">Guardar</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card noPadding>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="p-3">Nombre</th>
              <th className="p-3">Ubicación</th>
              <th className="p-3">Token (recortado)</th>
              <th className="p-3">Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center">
                  Cargando…
                </td>
              </tr>
            )}
            {rows.map((k) => (
              <tr key={k.id} className="border-b">
                <td className="p-3 font-medium">{k.name}</td>
                <td className="p-3">{k.location || '—'}</td>
                <td className="p-3 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    {k.token.slice(0, 8)}…
                    <button
                      onClick={() => copy(k.token)}
                      className="text-slate-400 hover:text-indigo-500"
                      title="Copiar token completo"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </td>
                <td className="p-3">{k.isActive ? 'Sí' : 'No'}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => copyLink(k)}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                      title="Copiar enlace al portapapeles"
                    >
                      <LinkIcon size={14} /> Copiar enlace
                    </button>
                    <button
                      onClick={() => openKiosk(k)}
                      className="text-slate-500 hover:text-emerald-600"
                      title="Abrir kiosko en nueva pestaña"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      onClick={() => regenerate(k)}
                      className="text-slate-500 hover:text-amber-500"
                      title="Regenerar token"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => remove(k)}
                      className="text-slate-400 hover:text-red-500"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-slate-400 italic">
        Para usar un kiosko: navega a <code>/kiosk?token=&lt;TOKEN&gt;</code> en el terminal y los
        empleados introducirán su PIN para fichar.
      </p>
    </div>
  );
};

export default Kiosks;
