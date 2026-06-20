import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Loader, useToast, Modal, Badge } from '@openfactu/ui';
import {
  Plus,
  Trash2,
  Wrench,
  Copy,
  Download,
  Upload,
  Package,
  Table as TableIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlugins } from '../context/PluginContext';
import { useTabs } from '../context/TabsContext';
import { invalidatePluginFields } from '../components/plugin-fields';
import { PluginIcon } from '../components/PluginIcon';
import { ExternalLink, Edit2 } from 'lucide-react';

interface FieldRow {
  id: string;
  tableName: string;
  fieldName: string;
  fieldType: string;
  label: string;
  required: boolean;
  readOnly: boolean;
  showInList: boolean;
  width: 'full' | 'half' | 'third';
  displayOrder: number;
  section: string | null;
  helpText: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  options: Array<{ value: string; label: string }> | null;
  visibleIn: string[] | null;
  readRoles: string[] | null;
  writeRoles: string[] | null;
  validation: any;
  refTable: string | null;
  refDisplayField: string | null;
}

interface PackInfo {
  id: string;
  label: string;
  count: number;
  fields: any[];
}

const TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'TEXT', label: 'Texto', hint: 'Cualquier texto libre.' },
  { value: 'INTEGER', label: 'Número entero', hint: 'Enteros sin decimales.' },
  { value: 'DECIMAL', label: 'Número decimal', hint: 'Número con decimales (15,4).' },
  { value: 'CURRENCY', label: 'Moneda', hint: 'Importe con 4 decimales, formateado.' },
  { value: 'PERCENT', label: 'Porcentaje', hint: 'Decimal con sufijo %.' },
  { value: 'BOOLEAN', label: 'Sí / No', hint: 'Checkbox binario.' },
  { value: 'DATE', label: 'Fecha', hint: 'Una fecha (sin hora).' },
  { value: 'URL', label: 'URL', hint: 'Enlace http(s).' },
  { value: 'EMAIL', label: 'Email', hint: 'Dirección de correo válida.' },
  { value: 'PHONE', label: 'Teléfono', hint: 'Admite +, dígitos, espacios y paréntesis.' },
  { value: 'COLOR', label: 'Color', hint: 'Color picker, se guarda en hex.' },
  { value: 'ENUM', label: 'Lista (combobox)', hint: 'Elige entre opciones predefinidas.' },
  { value: 'MULTISELECT', label: 'Multi-selección', hint: 'Varias opciones.' },
  {
    value: 'REFERENCE',
    label: 'Referencia a maestro',
    hint: 'Selector que busca en otra tabla (p.ej. partner, artículo).',
  },
  { value: 'FILE', label: 'Fichero / imagen', hint: 'URL o id de adjunto.' },
  { value: 'JSONB', label: 'JSON', hint: 'Datos estructurados arbitrarios.' },
];

const ROLE_OPTIONS = ['SUPERUSER', 'ADMIN', 'USER'];

const defaultForm = () => ({
  tableName: '',
  fieldName: '',
  fieldType: 'TEXT',
  label: '',
  required: false,
  readOnly: false,
  showInList: false,
  width: 'half' as 'full' | 'half' | 'third',
  displayOrder: 0,
  section: '',
  helpText: '',
  placeholder: '',
  defaultValue: '',
  optionsRaw: '', // "value|label" per line
  visibleIn: ['form', 'detail', 'list', 'pdf'] as string[],
  readRolesRaw: '',
  writeRolesRaw: '',
  min: '' as string,
  max: '' as string,
  minLength: '' as string,
  maxLength: '' as string,
  pattern: '',
  unique: false,
  refTable: '',
  refDisplayField: 'name',
});

export const CustomFields: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [allowedTables, setAllowedTables] = useState<string[]>([]);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [userTables, setUserTables] = useState<
    Array<{
      id: string;
      tableName: string;
      label: string | null;
      kind: string;
      iconName: string | null;
      menuModule: string | null;
      description: string | null;
    }>
  >([]);
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const { reloadUserTables } = usePlugins();
  const { openTab } = useTabs();
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPacksModal, setShowPacksModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableForm, setTableForm] = useState({
    name: '',
    label: '',
    kind: 'master' as 'master' | 'document',
    iconName: 'Table',
    menuModule: '',
    description: '',
  });
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
      const [rRes, tRes, pRes, utRes] = await Promise.all([
        fetch('/api/custom-fields', { headers }),
        fetch('/api/custom-fields/allowed-tables', { headers }),
        fetch('/api/custom-fields/packs', { headers }),
        fetch('/api/user-tables', { headers }),
      ]);
      const r = await rRes.json();
      const t = await tRes.json();
      const p = await pRes.json();
      const ut = await utRes.json();
      setRows(Array.isArray(r) ? r : []);
      setAllowedTables(Array.isArray(t) ? t : []);
      setPacks(Array.isArray(p) ? p : []);
      setUserTables(Array.isArray(ut) ? ut : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, FieldRow[]>();
    for (const r of rows) {
      if (q && !`${r.tableName} ${r.fieldName} ${r.label}`.toLowerCase().includes(q)) continue;
      if (!map.has(r.tableName)) map.set(r.tableName, []);
      map.get(r.tableName)!.push(r);
    }
    return Array.from(map.entries())
      .map(
        ([t, list]) =>
          [t, list.sort((a, b) => a.displayOrder - b.displayOrder)] as [string, FieldRow[]],
      )
      .sort(([a], [b]) => a.localeCompare(b));
  }, [rows, filter]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm(), tableName: allowedTables[0] || '' });
    setShowModal(true);
  };

  const openEdit = (r: FieldRow) => {
    setEditingId(r.id);
    setForm({
      tableName: r.tableName,
      fieldName: r.fieldName.replace(/^p_/, ''),
      fieldType: r.fieldType,
      label: r.label,
      required: r.required,
      readOnly: r.readOnly,
      showInList: r.showInList,
      width: r.width,
      displayOrder: r.displayOrder,
      section: r.section || '',
      helpText: r.helpText || '',
      placeholder: r.placeholder || '',
      defaultValue: r.defaultValue || '',
      optionsRaw: (r.options || []).map((o) => `${o.value}|${o.label}`).join('\n'),
      visibleIn: r.visibleIn || ['form', 'detail', 'pdf'],
      readRolesRaw: (r.readRoles || []).join(','),
      writeRolesRaw: (r.writeRoles || []).join(','),
      min: r.validation?.min?.toString() || '',
      max: r.validation?.max?.toString() || '',
      minLength: r.validation?.minLength?.toString() || '',
      maxLength: r.validation?.maxLength?.toString() || '',
      pattern: r.validation?.pattern || '',
      unique: !!r.validation?.unique,
      refTable: r.refTable || '',
      refDisplayField: r.refDisplayField || 'name',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.tableName || !form.fieldName || !form.fieldType) {
      toast.error('Tabla, nombre y tipo son obligatorios');
      return;
    }
    let options: any = null;
    if (['ENUM', 'MULTISELECT'].includes(form.fieldType)) {
      options = form.optionsRaw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [value, lbl] = l.split('|').map((s) => s.trim());
          return { value, label: lbl || value };
        });
      if (options.length === 0) {
        toast.error('Añade al menos una opción.');
        return;
      }
    }
    if (form.fieldType === 'REFERENCE' && !form.refTable) {
      toast.error('Elige la tabla destino para el campo referencia.');
      return;
    }
    const readRoles = form.readRolesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const writeRoles = form.writeRolesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const validation: any = {};
    if (form.min !== '') validation.min = Number(form.min);
    if (form.max !== '') validation.max = Number(form.max);
    if (form.minLength !== '') validation.minLength = Number(form.minLength);
    if (form.maxLength !== '') validation.maxLength = Number(form.maxLength);
    if (form.pattern) validation.pattern = form.pattern;
    if (form.unique) validation.unique = true;

    const body = {
      tableName: form.tableName,
      fieldName: form.fieldName,
      fieldType: form.fieldType,
      label: form.label || form.fieldName,
      required: form.required,
      readOnly: form.readOnly,
      showInList: form.showInList,
      width: form.width,
      displayOrder: Number(form.displayOrder || 0),
      section: form.section || null,
      helpText: form.helpText || null,
      placeholder: form.placeholder || null,
      defaultValue: form.defaultValue || null,
      options,
      visibleIn: form.visibleIn,
      readRoles: readRoles.length ? readRoles : null,
      writeRoles: writeRoles.length ? writeRoles : null,
      validation: Object.keys(validation).length ? validation : null,
      refTable: form.fieldType === 'REFERENCE' ? form.refTable : null,
      refDisplayField: form.fieldType === 'REFERENCE' ? form.refDisplayField : null,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Error al guardar');
        return;
      }
      toast.success(editingId ? 'Campo actualizado' : `Campo "${data.fieldName}" creado`);
      setShowModal(false);
      invalidatePluginFields();
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: FieldRow) => {
    if (
      !confirm(`¿Eliminar "${row.fieldName}" de ${row.tableName}? Se perderán los datos asociados.`)
    )
      return;
    const res = await fetch(`/api/custom-fields/${row.id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Error al eliminar');
      return;
    }
    toast.success('Campo eliminado');
    invalidatePluginFields();
    load();
  };

  const clone = async (row: FieldRow) => {
    const target = window.prompt(
      `Clonar "${row.fieldName}" a otra tabla.\nTabla destino:`,
      allowedTables[0] || '',
    );
    if (!target) return;
    const res = await fetch(`/api/custom-fields/${row.id}/clone`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetTable: target }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Error al clonar');
      return;
    }
    toast.success('Campo clonado');
    invalidatePluginFields();
    load();
  };

  const exportAll = async () => {
    const res = await fetch('/api/custom-fields/export', { headers });
    if (!res.ok) {
      toast.error('Error al exportar');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-fields.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      const res = await fetch('/api/custom-fields/import', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Error al importar');
        return;
      }
      toast.success(`Importados ${data.created} campos (${data.skipped} omitidos)`);
      invalidatePluginFields();
      load();
    } catch {
      toast.error('JSON inválido');
    }
  };

  const saveTable = async () => {
    if (!tableForm.name) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const isEdit = !!editingTable;
    const url = isEdit ? `/api/user-tables/${editingTable}` : '/api/user-tables';
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(tableForm),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || 'Error al guardar tabla');
      return;
    }
    toast.success(isEdit ? 'Tabla actualizada' : `Tabla "${data.tableName}" creada`);
    setShowTableModal(false);
    setEditingTable(null);
    setTableForm({
      name: '',
      label: '',
      kind: 'master',
      iconName: 'Table',
      menuModule: '',
      description: '',
    });
    invalidatePluginFields();
    reloadUserTables();
    await load();
  };

  const openEditTable = (ut: (typeof userTables)[number]) => {
    setEditingTable(ut.tableName);
    setTableForm({
      name: ut.tableName.replace(/^pt_/, ''),
      label: ut.label || '',
      kind: (ut.kind as 'master' | 'document') || 'master',
      iconName: ut.iconName || 'Table',
      menuModule: ut.menuModule || '',
      description: ut.description || '',
    });
    setShowTableModal(true);
  };

  const openCreateTable = () => {
    setEditingTable(null);
    setTableForm({
      name: '',
      label: '',
      kind: 'master',
      iconName: 'Table',
      menuModule: '',
      description: '',
    });
    setShowTableModal(true);
  };

  const removeTable = async (ut: (typeof userTables)[number]) => {
    if (
      !confirm(
        `¿Eliminar la tabla "${ut.label || ut.tableName}"?\nSe perderán todos sus registros y campos.`,
      )
    )
      return;
    const res = await fetch(`/api/user-tables/${ut.tableName}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Error al eliminar');
      return;
    }
    toast.success('Tabla eliminada');
    invalidatePluginFields();
    reloadUserTables();
    load();
  };

  const addFieldTo = (ut: (typeof userTables)[number]) => {
    setEditingId(null);
    setForm({ ...defaultForm(), tableName: ut.tableName });
    setShowModal(true);
  };

  const installPack = async (id: string) => {
    const res = await fetch(`/api/custom-fields/packs/${id}/install`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || 'Error');
      return;
    }
    toast.success(`${data.installed} campos instalados`);
    setShowPacksModal(false);
    invalidatePluginFields();
    load();
  };

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Wrench className="text-blue-600 dark:text-blue-300" size={22} />
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Campos personalizados
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Añade campos propios a cualquier tabla sin escribir código. Aparecen en form, detalle
              y PDF.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={openCreateTable} className="flex items-center gap-2">
            <TableIcon size={14} /> Nueva tabla
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowPacksModal(true)}
            className="flex items-center gap-2"
          >
            <Package size={14} /> Packs
          </Button>
          <Button variant="secondary" onClick={exportAll} className="flex items-center gap-2">
            <Download size={14} /> Exportar
          </Button>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <Upload size={14} /> Importar
            <input
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={14} /> Nuevo campo
          </Button>
        </div>
      </header>

      {/* ── Tablas de usuario ─────────────────────────────────────────── */}
      <Card bodyClassName="p-0">
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon size={14} className="text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
              Tablas de usuario
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
              {userTables.length} {userTables.length === 1 ? 'tabla' : 'tablas'}
            </span>
          </div>
          <Button size="sm" onClick={openCreateTable} className="flex items-center gap-1">
            <Plus size={12} /> Nueva tabla
          </Button>
        </div>
        {userTables.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Aún no has creado tablas propias. Crea una para tener una entidad nueva con listado,
            form y menú.
          </div>
        ) : (
          <ul>
            {userTables.map((ut) => {
              const count = rows.filter((r) => r.tableName === ut.tableName).length;
              const pathName = ut.tableName.replace(/^pt_/, '');
              return (
                <li
                  key={ut.id}
                  className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                    <PluginIcon iconName={ut.iconName || 'Table'} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openTab(`/u/${pathName}`)}
                        className="font-semibold text-sm text-slate-800 dark:text-slate-100 hover:text-blue-600 text-left"
                      >
                        {ut.label || pathName}
                      </button>
                      <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500 dark:text-slate-400 rounded">
                        {ut.tableName}
                      </code>
                      <Badge variant={ut.kind === 'document' ? 'info' : 'neutral'}>
                        {ut.kind === 'document' ? 'Documento' : 'Maestro'}
                      </Badge>
                      {ut.menuModule && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          menú: {ut.menuModule}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {count} {count === 1 ? 'campo' : 'campos'}
                      </span>
                    </div>
                    {ut.description && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {ut.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addFieldTo(ut)}
                    title="Añadir campo"
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-primary hover:bg-primary/10 rounded"
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    onClick={() => openTab(`/u/${pathName}`)}
                    title="Abrir"
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-primary hover:bg-primary/10 rounded"
                  >
                    <ExternalLink size={13} />
                  </button>
                  <button
                    onClick={() => openEditTable(ut)}
                    title="Editar"
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-primary hover:bg-primary/10 rounded"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => removeTable(ut)}
                    title="Eliminar tabla"
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card bodyClassName="p-3">
        <Input
          placeholder="Filtrar por tabla, nombre o etiqueta..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </Card>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : grouped.length === 0 ? (
        <Card bodyClassName="py-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aún no has creado ningún campo personalizado.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Pulsa "Nuevo campo" o instala un pack.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([tbl, list]) => (
            <Card key={tbl} bodyClassName="p-0">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
                {tbl}
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                  {list.length} campos
                </span>
              </div>
              <ul>
                {list.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                  >
                    <code className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[11px] rounded">
                      {r.fieldName}
                    </code>
                    <button
                      onClick={() => openEdit(r)}
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1 truncate text-left hover:text-blue-600"
                    >
                      {r.label}
                      {r.section && (
                        <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
                          · {r.section}
                        </span>
                      )}
                    </button>
                    <Badge variant="neutral">{r.fieldType}</Badge>
                    {r.required && <Badge variant="warning">Obligatorio</Badge>}
                    {r.readOnly && <Badge variant="info">Solo lectura</Badge>}
                    {r.showInList && <Badge variant="success">En listado</Badge>}
                    <button
                      onClick={() => clone(r)}
                      title="Clonar a otra tabla"
                      className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-primary hover:bg-primary/10 rounded"
                    >
                      <Copy size={13} />
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
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar campo' : 'Nuevo campo personalizado'}
        subtitle="Se creará como columna en el schema del tenant."
        maxWidth="2xl"
      >
        <div className="space-y-6 pt-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Identidad */}
          <Section title="Identidad">
            <Row>
              <Field label="Tabla">
                <select
                  value={form.tableName}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, tableName: e.target.value })}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="">(elige una)</option>
                  {allowedTables.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre técnico">
                <Input
                  value={form.fieldName}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, fieldName: e.target.value })}
                  placeholder="projectCode"
                />
              </Field>
            </Row>
            <Row>
              <Field label="Etiqueta visible">
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={form.fieldType}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {TYPE_OPTIONS.find((t) => t.value === form.fieldType)?.hint}
                </div>
              </Field>
            </Row>
          </Section>

          {/* Opciones por tipo */}
          {['ENUM', 'MULTISELECT'].includes(form.fieldType) && (
            <Section title="Opciones">
              <div className="text-[11px] text-slate-500 mb-1">
                Una línea por opción — formato <code>value|label</code>.
              </div>
              <textarea
                value={form.optionsRaw}
                onChange={(e) => setForm({ ...form, optionsRaw: e.target.value })}
                rows={5}
                placeholder={'low|Baja\nnormal|Normal\nhigh|Alta'}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 font-mono"
              />
            </Section>
          )}

          {form.fieldType === 'REFERENCE' && (
            <Section title="Referencia">
              <Row>
                <Field label="Tabla destino">
                  <select
                    value={form.refTable}
                    onChange={(e) => setForm({ ...form, refTable: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                  >
                    <option value="">(elige una)</option>
                    {allowedTables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Campo a mostrar">
                  <Input
                    value={form.refDisplayField}
                    onChange={(e) => setForm({ ...form, refDisplayField: e.target.value })}
                    placeholder="name"
                  />
                </Field>
              </Row>
            </Section>
          )}

          {/* Apariencia */}
          <Section title="Apariencia">
            <Row>
              <Field label="Sección (opcional)">
                <Input
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  placeholder="p.ej. Logística"
                />
              </Field>
              <Field label="Anchura">
                <select
                  value={form.width}
                  onChange={(e) => setForm({ ...form, width: e.target.value as any })}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="third">1/3</option>
                  <option value="half">1/2</option>
                  <option value="full">Completo</option>
                </select>
              </Field>
              <Field label="Orden">
                <Input
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Placeholder">
                <Input
                  value={form.placeholder}
                  onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                />
              </Field>
              <Field label="Valor por defecto">
                <Input
                  value={form.defaultValue}
                  onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
                  placeholder="(opcional)"
                />
              </Field>
            </Row>
            <Field label="Texto de ayuda">
              <Input
                value={form.helpText}
                onChange={(e) => setForm({ ...form, helpText: e.target.value })}
                placeholder="Breve descripción que aparece bajo el input"
              />
            </Field>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Visible en
              </label>
              <div className="flex gap-3 flex-wrap">
                {['form', 'detail', 'list', 'pdf'].map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.visibleIn.includes(v)}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          visibleIn: e.target.checked
                            ? [...form.visibleIn, v]
                            : form.visibleIn.filter((x) => x !== v),
                        });
                      }}
                    />
                    {v === 'form'
                      ? 'Formulario'
                      : v === 'detail'
                        ? 'Detalle'
                        : v === 'list'
                          ? 'Listado'
                          : 'PDF'}
                  </label>
                ))}
              </div>
            </div>
            <Row>
              <Toggle
                label="Obligatorio al guardar"
                checked={form.required}
                onChange={(v) => setForm({ ...form, required: v })}
              />
              <Toggle
                label="Solo lectura"
                checked={form.readOnly}
                onChange={(v) => setForm({ ...form, readOnly: v })}
              />
              <Toggle
                label="Columna en listado"
                checked={form.showInList}
                onChange={(v) => setForm({ ...form, showInList: v })}
              />
            </Row>
          </Section>

          {/* Validaciones */}
          <Section title="Validación">
            {['INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENT'].includes(form.fieldType) && (
              <Row>
                <Field label="Mínimo">
                  <Input
                    type="number"
                    value={form.min}
                    onChange={(e) => setForm({ ...form, min: e.target.value })}
                  />
                </Field>
                <Field label="Máximo">
                  <Input
                    type="number"
                    value={form.max}
                    onChange={(e) => setForm({ ...form, max: e.target.value })}
                  />
                </Field>
              </Row>
            )}
            {['TEXT', 'URL', 'EMAIL', 'PHONE'].includes(form.fieldType) && (
              <>
                <Row>
                  <Field label="Longitud mín.">
                    <Input
                      type="number"
                      value={form.minLength}
                      onChange={(e) => setForm({ ...form, minLength: e.target.value })}
                    />
                  </Field>
                  <Field label="Longitud máx.">
                    <Input
                      type="number"
                      value={form.maxLength}
                      onChange={(e) => setForm({ ...form, maxLength: e.target.value })}
                    />
                  </Field>
                </Row>
                <Field label="Patrón (regex)">
                  <Input
                    value={form.pattern}
                    onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                    placeholder="^[A-Z]{3}-\\d+$"
                  />
                </Field>
              </>
            )}
            <Toggle
              label="Único por tenant"
              checked={form.unique}
              onChange={(v) => setForm({ ...form, unique: v })}
            />
          </Section>

          {/* Permisos */}
          <Section title="Permisos">
            <Row>
              <Field label={`Puede leer (CSV de roles: ${ROLE_OPTIONS.join(', ')})`}>
                <Input
                  value={form.readRolesRaw}
                  onChange={(e) => setForm({ ...form, readRolesRaw: e.target.value })}
                  placeholder="ADMIN,SUPERUSER"
                />
              </Field>
              <Field label="Puede escribir">
                <Input
                  value={form.writeRolesRaw}
                  onChange={(e) => setForm({ ...form, writeRolesRaw: e.target.value })}
                  placeholder="ADMIN"
                />
              </Field>
            </Row>
            <div className="text-[11px] text-slate-500">
              Vacío = todos los roles. Si pones solo "ADMIN" en escritura, un USER no podrá
              modificarlo (aunque envíe el valor se descarta).
            </div>
          </Section>

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
                'Crear campo'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showPacksModal}
        onClose={() => setShowPacksModal(false)}
        title="Packs de campos predefinidos"
        subtitle="Añade de golpe varios campos relacionados."
        maxWidth="xl"
      >
        <div className="space-y-3 pt-4">
          {packs.map((p) => (
            <Card key={p.id} bodyClassName="p-4 flex items-start gap-4">
              <Package className="text-blue-500 mt-0.5" size={18} />
              <div className="flex-1">
                <div className="font-bold text-slate-800 dark:text-slate-100">{p.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {p.count} campos:{' '}
                  {p.fields.map((f: any) => `${f.tableName}.${f.fieldName}`).join(', ')}
                </div>
              </div>
              <Button onClick={() => installPack(p.id)}>Instalar</Button>
            </Card>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={showTableModal}
        onClose={() => {
          setShowTableModal(false);
          setEditingTable(null);
        }}
        title={editingTable ? 'Editar tabla' : 'Nueva tabla'}
        subtitle={
          editingTable
            ? 'No puedes cambiar el nombre técnico. Para moverla a otro nombre, creas una nueva y migras los datos.'
            : 'Crea una entidad nueva con listado y form auto-generados. Después añade sus campos desde esta misma página.'
        }
        maxWidth="md"
      >
        <div className="space-y-4 pt-4">
          <Row>
            <Field label="Nombre técnico">
              <Input
                value={tableForm.name}
                onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })}
                placeholder="visitas"
                disabled={!!editingTable}
              />
            </Field>
            <Field label="Etiqueta visible">
              <Input
                value={tableForm.label}
                onChange={(e) => setTableForm({ ...tableForm, label: e.target.value })}
                placeholder="Visitas comerciales"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Tipo">
              <select
                value={tableForm.kind}
                onChange={(e) =>
                  setTableForm({ ...tableForm, kind: e.target.value as 'master' | 'document' })
                }
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
              >
                <option value="master">Maestro</option>
                <option value="document">Documento</option>
              </select>
            </Field>
            <Field label="Icono (lucide-react)">
              <Input
                value={tableForm.iconName}
                onChange={(e) => setTableForm({ ...tableForm, iconName: e.target.value })}
                placeholder="Users, Package, FileText..."
              />
            </Field>
          </Row>
          <Field label="Módulo del menú">
            <select
              value={tableForm.menuModule}
              onChange={(e) => setTableForm({ ...tableForm, menuModule: e.target.value })}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">(Personalizado — módulo nuevo al final)</option>
              <option value="home">Inicio</option>
              <option value="inventory">Inventario</option>
              <option value="sales">Ventas</option>
              <option value="purchases">Compras</option>
              <option value="accounting">Contabilidad</option>
              <option value="hr">Recursos humanos</option>
              <option value="reports">Informes</option>
              <option value="configuration">Configuración</option>
            </select>
          </Field>
          <Field label="Descripción">
            <Input
              value={tableForm.description}
              onChange={(e) => setTableForm({ ...tableForm, description: e.target.value })}
              placeholder="Opcional"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowTableModal(false)}>
              Cancelar
            </Button>
            <Button onClick={saveTable}>{editingTable ? 'Guardar cambios' : 'Crear tabla'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1">
      {title}
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
      {label}
    </label>
    {children}
  </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4"
    />
    <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
  </label>
);

export default CustomFields;
