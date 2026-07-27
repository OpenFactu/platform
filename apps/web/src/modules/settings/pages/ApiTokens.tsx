/**
 * Gestión de tokens de API para integraciones server-to-server.
 * Al crear un token se muestra una sola vez en claro — el usuario debe copiarlo.
 * Los tokens no caducan automáticamente; se revocan manualmente.
 */
import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Badge,
  Loader,
  Checkbox,
  EmptyState,
  useToast,
  usePopup,
} from '@openfactu/ui';
import { Plus, Trash2, Copy, Key, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const ALL_SCOPES = [
  { id: 'read:logistics', label: 'Leer logística', description: 'GET /api/logistics/*' },
  {
    id: 'write:logistics',
    label: 'Escribir logística',
    description: 'POST/PATCH/DELETE /api/logistics/*',
  },
  {
    id: 'write:ventas',
    label: 'Escribir ventas',
    description:
      'FactuAPI: crear/asentar/cancelar facturas, pedidos y albaranes de venta (SINV/SO/SDN)',
  },
  {
    id: 'write:compras',
    label: 'Escribir compras',
    description:
      'FactuAPI: crear/asentar/cancelar facturas, pedidos y albaranes de compra (PINV/PO/PDN)',
  },
  {
    id: 'read:maestros',
    label: 'Leer maestros',
    description: 'GET clientes/proveedores y artículos (stock, lotes, unidades)',
  },
  {
    id: 'write:maestros',
    label: 'Escribir maestros',
    description: 'Crear/editar/borrar clientes/proveedores y artículos',
  },
  {
    id: 'mcp:read',
    label: 'MCP — lectura',
    description: 'Servidor MCP (Claude Desktop/Code): buscar clientes/artículos, listar documentos',
  },
  {
    id: 'mcp:sql',
    label: 'MCP — SQL de lectura',
    description: 'Además del anterior: consultas SQL de solo lectura sobre todo el esquema',
  },
];

export const ApiTokens: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [rows, setRows] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ name: string; scopes: string[] }>({
    name: '',
    scopes: ['read:logistics'],
  });
  const [created, setCreated] = useState<{ token: string; name: string; scopes: string[] } | null>(
    null,
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    const res = await coreApi.raw('GET', '/api/admin/api-tokens');
    const d = res.ok ? res.data : [];
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const create = async () => {
    if (!form.name.trim()) {
      toast.error('Indica un nombre descriptivo.');
      return;
    }
    if (form.scopes.length === 0) {
      toast.error('Selecciona al menos un scope.');
      return;
    }
    const res = await coreApi.raw('POST', '/api/admin/api-tokens', {
      name: form.name.trim(),
      scopes: form.scopes,
    });
    const d = res.data;
    if (!res.ok) {
      toast.error(d.error || 'Error creando token');
      return;
    }
    setCreated({ token: d.token, name: d.name, scopes: form.scopes });
    setShowCreate(false);
    setForm({ name: '', scopes: ['read:logistics'] });
    load();
  };

  const revoke = async (t: ApiToken) => {
    const ok = await popup.confirm({
      title: 'Revocar token',
      message: `¿Revocar el token "${t.name}"? Las integraciones que lo usen dejarán de funcionar de inmediato.`,
      tone: 'danger',
      confirmLabel: 'Revocar',
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/admin/api-tokens/${t.id}`);
    if (!res.ok) {
      const d = res.data ?? {};
      toast.error(d.error || 'Error al revocar');
      return;
    }
    toast.success('Token revocado');
    load();
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const toggleScope = (id: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(id) ? f.scopes.filter((s) => s !== id) : [...f.scopes, id],
    }));
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-3">
          <Key className="text-blue-600 dark:text-blue-300" size={22} />
          <div>
            <h1 className="text-xl font-black text-fg-default tracking-tight">Tokens de API</h1>
            <p className="text-xs text-fg-muted">
              Credenciales para integraciones server-to-server (plugins, sistemas externos).
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo token
        </Button>
      </header>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="p-0">
          <EmptyState
            icon={<Key size={28} />}
            title="Sin tokens creados"
            hint="Crea una credencial para que un sistema externo consuma la API sin usar tu usuario."
            action={
              <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
                <Plus size={14} /> Nuevo token
              </Button>
            }
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((t) => (
              <li
                key={t.id}
                className={`flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 ${
                  t.revokedAt ? 'opacity-50' : ''
                }`}
              >
                <Badge variant={t.revokedAt ? 'error' : 'success'}>
                  {t.revokedAt ? 'Revocado' : 'Activo'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-fg-default">{t.name}</span>
                    <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                      {t.prefix}…
                    </code>
                  </div>
                  <div className="text-[11px] text-fg-muted mt-0.5 flex gap-3 flex-wrap">
                    <span>Scopes: {t.scopes}</span>
                    <span>Creado: {new Date(t.createdAt).toLocaleDateString('es-ES')}</span>
                    {t.lastUsedAt && (
                      <span>Último uso: {new Date(t.lastUsedAt).toLocaleString('es-ES')}</span>
                    )}
                  </div>
                </div>
                {!t.revokedAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(t)}
                    title="Revocar"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nuevo token de API"
        subtitle="Genera una credencial para que un sistema externo consuma la API de logística."
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <Input
            label="Nombre descriptivo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: webhook SEUR producción"
          />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Scopes
            </label>
            <div className="space-y-2">
              {ALL_SCOPES.map((s) => (
                <label key={s.id} className="flex items-start gap-2 cursor-pointer">
                  <span className="mt-0.5">
                    <Checkbox
                      checked={form.scopes.includes(s.id)}
                      onChange={() => toggleScope(s.id)}
                    />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-fg-default">
                      {s.label}{' '}
                      <code className="px-1 bg-bg-muted text-[10px] font-mono rounded">{s.id}</code>
                    </div>
                    <div className="text-[11px] text-slate-500">{s.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={create}>Crear</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!created} onClose={() => setCreated(null)} title="Token creado" maxWidth="md">
        {created && (
          <div className="space-y-3 pt-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
              <AlertCircle className="text-amber-600 dark:text-amber-300 flex-shrink-0" size={16} />
              <div className="text-[12px] text-amber-800 dark:text-amber-200">
                Guarda este token <b>ahora</b>. No podrá volver a mostrarse. Si lo pierdes, revócalo
                y crea uno nuevo.
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Token ({created.name})
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-bg-muted text-[11px] font-mono rounded break-all">
                  {created.token}
                </code>
                <Button
                  onClick={() => copy(created.token)}
                  className="flex items-center gap-1 !px-2"
                >
                  <Copy size={14} /> Copiar
                </Button>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">
              Úsalo como cabecera HTTP:
              <pre className="mt-1 p-2 bg-bg-muted rounded text-[11px] font-mono">
                Authorization: Bearer {created.token.slice(0, 15)}…
              </pre>
            </div>
            {created.scopes.some((s) => s.startsWith('mcp:')) && (
              <div className="text-[11px] text-slate-500">
                Config de Claude Desktop / Claude Code (servidor MCP remoto vía HTTP):
                <pre className="mt-1 p-2 bg-bg-muted rounded text-[11px] font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      mcpServers: {
                        keirost: {
                          url: `${window.location.origin}/api/mcp`,
                          headers: { Authorization: `Bearer ${created.token}` },
                        },
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t border-border-subtle">
              <Button onClick={() => setCreated(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ApiTokens;
