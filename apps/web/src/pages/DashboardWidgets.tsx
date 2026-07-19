import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Loader,
  useToast,
  Modal,
  Badge,
  SearchableSelect,
} from '@openfactu/ui';
import { LayoutGrid, Plus, Trash2, Edit2, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WidgetCodeEditorModal } from '../components/dashboard/WidgetCodeEditorModal';

const PLUGIN_SNIPPET = `// plugins/<mi-plugin>/index.ts
export const init = async ({ widgets }: PluginContext) => {
  widgets.registerDashboard({
    id: 'mi-widget',
    title: 'Mi Widget',
    component: 'ui/MyComponent.tsx', // componente React propio del plugin
    size: 'md',   // sm | md | lg | full
    order: 100,
  });
};`;

interface MetricOption {
  key: string;
  label: string;
}

const WIDGET_SIZE_OPTIONS = [
  { value: 'sm', label: 'Pequeño (1/4)' },
  { value: 'md', label: 'Mediano (2/4)' },
  { value: 'lg', label: 'Grande (3/4)' },
  { value: 'full', label: 'Completo' },
];

interface WidgetRow {
  id: string;
  title: string;
  subtitle: string | null;
  kind: 'metric' | 'code' | 'query';
  metricKey: string | null;
  metricLabel: string | null;
  size: 'sm' | 'md' | 'lg' | 'full';
  displayOrder: number;
  value: number | null;
}

const defaultForm = () => ({
  title: '',
  subtitle: '',
  kind: 'metric' as 'metric' | 'code' | 'query',
  metricKey: '',
  sourceCode: '',
  size: 'md' as 'sm' | 'md' | 'lg' | 'full',
  displayOrder: 100,
});

export const DashboardWidgets: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WidgetRow[]>([]);
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showPluginWay, setShowPluginWay] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    try {
      const [wRes, mRes] = await Promise.all([
        fetch('/api/dashboard-widgets', { headers }),
        fetch('/api/dashboard-widgets/metrics', { headers }),
      ]);
      const w = await wRes.json();
      const m = await mRes.json();
      setRows(Array.isArray(w) ? w : []);
      setMetrics(Array.isArray(m) ? m : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm(), metricKey: metrics[0]?.key || '' });
    setShowModal(true);
  };

  const openEdit = async (r: WidgetRow) => {
    setEditingId(r.id);
    let sourceCode = '';
    if (r.kind === 'code') {
      try {
        const res = await fetch(`/api/dashboard-widgets/${r.id}`, { headers });
        const full = await res.json();
        sourceCode = full?.sourceCode || '';
      } catch {
        /* se abre igual, con el editor vacío */
      }
    }
    setForm({
      title: r.title,
      subtitle: r.subtitle || '',
      kind: r.kind,
      metricKey: r.metricKey || '',
      sourceCode,
      size: r.size,
      displayOrder: r.displayOrder,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    if (form.kind === 'metric' && !form.metricKey) {
      toast.error('Elige una métrica');
      return;
    }
    if (form.kind === 'code' && !form.sourceCode.trim()) {
      toast.error('Escribí el código del componente (botón "Editar código")');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/dashboard-widgets/${editingId}` : '/api/dashboard-widgets';
      // Los widgets 'query' se crean desde el chat de IA — desde aquí solo se
      // edita título/subtítulo/tamaño/orden, sin tocar `kind` ni `queryConfig`.
      const body =
        form.kind === 'query'
          ? {
              title: form.title,
              subtitle: form.subtitle,
              size: form.size,
              displayOrder: form.displayOrder,
            }
          : form;
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Error al guardar');
        return;
      }
      toast.success(editingId ? 'Widget actualizado' : 'Widget creado');
      setShowModal(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: WidgetRow) => {
    if (!confirm(`¿Eliminar el widget "${row.title}"?`)) return;
    const res = await fetch(`/api/dashboard-widgets/${row.id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Error al eliminar');
      return;
    }
    toast.success('Widget eliminado');
    load();
  };

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <LayoutGrid className="text-blue-600 dark:text-blue-300" size={22} />
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Widgets de dashboard
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Elegí una métrica del catálogo o escribí tu propio componente React, sin necesidad de
              un plugin.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo widget
        </Button>
      </header>

      <Card bodyClassName="p-0">
        <button
          onClick={() => setShowPluginWay((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Code2 size={15} className="text-slate-400" />
            Avanzado: registrar el widget desde un plugin (código en disco)
          </span>
          {showPluginWay ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>
        {showPluginWay && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Si preferís empaquetar el widget como parte de un plugin instalable (en vez de
              guardarlo acá), desde el <code>init()</code> del plugin (
              <code>plugins/&lt;mi-plugin&gt;/index.ts</code>):
            </p>
            <pre className="bg-slate-900 text-slate-100 text-[11px] leading-relaxed rounded-lg p-3 overflow-x-auto font-mono">
              <code>{PLUGIN_SNIPPET}</code>
            </pre>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aún no has creado ningún widget.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Pulsa "Nuevo widget" para añadir uno al Dashboard.
          </p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                      {r.title}
                    </span>
                    {r.kind === 'code' ? (
                      <Badge variant="info">Componente React</Badge>
                    ) : r.kind === 'query' ? (
                      <Badge variant="info">Widget IA</Badge>
                    ) : (
                      <Badge variant="info">{r.metricLabel}</Badge>
                    )}
                    <Badge variant="neutral">{r.size}</Badge>
                  </div>
                  {r.subtitle && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {r.subtitle}
                    </div>
                  )}
                </div>
                {r.kind === 'metric' && (
                  <span className="font-black tabular-nums text-slate-700 dark:text-slate-200 text-sm">
                    {r.value ?? '—'}
                  </span>
                )}
                <button
                  onClick={() => openEdit(r)}
                  title="Editar"
                  className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-primary hover:bg-primary/10 rounded"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => remove(r)}
                  title="Eliminar"
                  className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar widget' : 'Nuevo widget'}
        subtitle="Elegí una métrica del catálogo, o escribí tu propio componente React."
        maxWidth="md"
      >
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Tipo de widget
            </label>
            {form.kind === 'query' ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                Este widget lo creó el asistente de IA a partir de una consulta. Desde aquí puedes
                editar título, subtítulo, tamaño y orden; para cambiar la consulta, pídeselo al
                asistente en el chat.
              </p>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.kind === 'metric' ? 'primary' : 'outline'}
                  onClick={() => setForm({ ...form, kind: 'metric' })}
                >
                  Métrica
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.kind === 'code' ? 'primary' : 'outline'}
                  onClick={() => setForm({ ...form, kind: 'code' })}
                >
                  Componente React
                </Button>
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Título
            </label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Artículos en catálogo"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Subtítulo (opcional)
            </label>
            <Input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </div>
          {form.kind === 'metric' ? (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Métrica
              </label>
              <SearchableSelect
                value={form.metricKey}
                onChange={(value) => setForm({ ...form, metricKey: value })}
                placeholder="Elige una métrica"
                options={metrics.map((m) => ({ value: m.key, label: m.label }))}
              />
            </div>
          ) : form.kind === 'code' ? (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Componente
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCodeEditor(true)}
                  className="flex items-center gap-2"
                >
                  <Code2 size={13} /> Editar código
                </Button>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {form.sourceCode.trim() ? 'Código guardado ✓' : 'Sin código todavía'}
                </span>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Tamaño
              </label>
              <SearchableSelect
                value={form.size}
                onChange={(value) => setForm({ ...form, size: value as typeof form.size })}
                options={WIDGET_SIZE_OPTIONS}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Orden
              </label>
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={submitting}>
              {submitting ? (
                <Loader size="sm" variant="white" />
              ) : editingId ? (
                'Guardar cambios'
              ) : (
                'Crear widget'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <WidgetCodeEditorModal
        open={showCodeEditor}
        initialCode={form.sourceCode || null}
        token={token}
        onClose={() => setShowCodeEditor(false)}
        onSave={(code) => setForm({ ...form, sourceCode: code })}
      />
    </div>
  );
};

export default DashboardWidgets;
