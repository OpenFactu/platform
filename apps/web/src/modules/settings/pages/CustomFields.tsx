import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Card,
  Button,
  Input,
  Textarea,
  Checkbox,
  NumberInput,
  Select,
  SearchableSelect,
  EmptyState,
  Loader,
  PageHeader,
  useToast,
  usePopup,
  Modal,
  Badge,
} from '@openfactu/ui';
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
import { useAuth } from '@/context/AuthContext';
import { usePlugins } from '@/context/PluginContext';
import { useTabs } from '@/context/TabsContext';
import { invalidatePluginFields } from '@/components/plugin-fields';
import { PluginIcon } from '@/components/PluginIcon';
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

const WIDTH_OPTIONS = [
  { value: 'third', label: '1/3' },
  { value: 'half', label: '1/2' },
  { value: 'full', label: 'Completo' },
];

const TABLE_KIND_OPTIONS = [
  { value: 'master', label: 'Maestro' },
  { value: 'document', label: 'Documento' },
];

const MENU_MODULE_OPTIONS = [
  { value: '', label: '(Personalizado — módulo nuevo al final)' },
  { value: 'home', label: 'Inicio' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'sales', label: 'Ventas' },
  { value: 'purchases', label: 'Compras' },
  { value: 'accounting', label: 'Contabilidad' },
  { value: 'hr', label: 'Recursos humanos' },
  { value: 'reports', label: 'Informes' },
  { value: 'configuration', label: 'Configuración' },
];

/** Etiquetas de las superficies donde puede aparecer un campo. */
const VISIBLE_IN_LABELS: Record<string, string> = {
  form: 'Formulario',
  detail: 'Detalle',
  list: 'Listado',
  pdf: 'PDF',
};

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
  // number | null (antes string '') — los cuatro los edita un NumberInput y
  // `null` es «sin límite».
  min: null as number | null,
  max: null as number | null,
  minLength: null as number | null,
  maxLength: null as number | null,
  pattern: '',
  unique: false,
  refTable: '',
  refDisplayField: 'name',
});

export const CustomFields: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        coreApi.raw('GET', '/api/custom-fields'),
        coreApi.raw('GET', '/api/custom-fields/allowed-tables'),
        coreApi.raw('GET', '/api/custom-fields/packs'),
        coreApi.raw('GET', '/api/user-tables'),
      ]);
      const r = rRes.data;
      const t = tRes.data;
      const p = pRes.data;
      const ut = utRes.data;
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
      min: r.validation?.min ?? null,
      max: r.validation?.max ?? null,
      minLength: r.validation?.minLength ?? null,
      maxLength: r.validation?.maxLength ?? null,
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
    if (form.min !== null) validation.min = form.min;
    if (form.max !== null) validation.max = form.max;
    if (form.minLength !== null) validation.minLength = form.minLength;
    if (form.maxLength !== null) validation.maxLength = form.maxLength;
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
      const res = await coreApi.raw('POST', '/api/custom-fields', body);
      const data = res.data;
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
    const ok = await popup.confirm({
      title: 'Eliminar campo',
      message: `Se eliminará "${row.fieldName}" de ${row.tableName} y se perderán los datos ya guardados en esa columna.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/custom-fields/${row.id}`);
    if (!res.ok) {
      const err = res.data ?? {};
      toast.error(err.error || 'Error al eliminar');
      return;
    }
    toast.success('Campo eliminado');
    invalidatePluginFields();
    load();
  };

  const clone = async (row: FieldRow) => {
    // Antes era un window.prompt pidiendo el nombre de la tabla a mano; ahora
    // se elige de la lista real de tablas permitidas.
    const target = await popup.show<string>({
      title: `Clonar "${row.fieldName}"`,
      subtitle: 'Elige la tabla destino. El campo se creará allí con la misma definición.',
      maxWidth: 'sm',
      render: (close) => (
        <CloneTargetForm
          tables={allowedTables.filter((t) => t !== row.tableName)}
          onCancel={() => close()}
          onConfirm={(t) => close(t)}
        />
      ),
    });
    if (!target) return;
    const res = await coreApi.raw('POST', `/api/custom-fields/${row.id}/clone`, {
      targetTable: target,
    });
    if (!res.ok) {
      const err = res.data ?? {};
      toast.error(err.error || 'Error al clonar');
      return;
    }
    toast.success('Campo clonado');
    invalidatePluginFields();
    load();
  };

  const exportAll = async () => {
    let blob: Blob;
    try {
      ({ blob } = await coreApi.getBlob('/api/custom-fields/export'));
    } catch {
      toast.error('Error al exportar');
      return;
    }
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
      const res = await coreApi.raw('POST', '/api/custom-fields/import', payload);
      const data = res.data;
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
    const res = await coreApi.raw(isEdit ? 'PATCH' : 'POST', url, tableForm);
    const data = res.data;
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
    const ok = await popup.confirm({
      title: 'Eliminar tabla',
      message: `Se eliminará "${ut.label || ut.tableName}" con todos sus registros y campos. No hay marcha atrás.`,
      tone: 'danger',
      confirmLabel: 'Eliminar tabla',
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/user-tables/${ut.tableName}`);
    if (!res.ok) {
      const err = res.data ?? {};
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
    const res = await coreApi.raw('POST', `/api/custom-fields/packs/${id}/install`);
    const data = res.data;
    if (!res.ok) {
      toast.error(data?.error || 'Error');
      return;
    }
    toast.success(`${data.installed} campos instalados`);
    setShowPacksModal(false);
    invalidatePluginFields();
    load();
  };

  // Decimales admitidos por los límites min/max según el tipo del campo.
  const boundPrecision = form.fieldType === 'INTEGER' ? 0 : form.fieldType === 'PERCENT' ? 2 : 4;

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Campos personalizados"
        subtitle="Añade campos propios a cualquier tabla sin escribir código. Aparecen en form, detalle y PDF."
        icon={<Wrench size={18} />}
        size="sm"
        divider
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              onClick={openCreateTable}
              className="flex items-center gap-2"
            >
              <TableIcon size={14} /> Nueva tabla
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPacksModal(true)}
              className="flex items-center gap-2"
            >
              <Package size={14} /> Packs
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={exportAll}
              className="flex items-center gap-2"
            >
              <Download size={14} /> Exportar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2"
            >
              <Upload size={14} /> Importar
            </Button>
            {/* SE UTILIZA PARA EL INPUT DE ARCHIVO */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.currentTarget.value = '';
              }}
            />
            <Button type="button" onClick={openCreate} className="flex items-center gap-2">
              <Plus size={14} /> Nuevo campo
            </Button>
          </div>
        }
      />

      {/* ── Tablas de usuario ─────────────────────────────────────────── */}
      <Card bodyClassName="p-0">
        <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon size={14} className="text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-fg-body">
              Tablas de usuario
            </span>
            <span className="text-[10px] text-fg-subtle font-semibold">
              {userTables.length} {userTables.length === 1 ? 'tabla' : 'tablas'}
            </span>
          </div>
          <Button size="sm" onClick={openCreateTable} className="flex items-center gap-1">
            <Plus size={12} /> Nueva tabla
          </Button>
        </div>
        {userTables.length === 0 ? (
          <EmptyState
            icon={<TableIcon size={18} />}
            title="Aún no has creado tablas propias"
            hint="Crea una para tener una entidad nueva con listado, formulario y menú."
            action={
              <Button size="sm" onClick={openCreateTable} className="flex items-center gap-1">
                <Plus size={12} /> Nueva tabla
              </Button>
            }
          />
        ) : (
          <ul>
            {userTables.map((ut) => {
              const count = rows.filter((r) => r.tableName === ut.tableName).length;
              const pathName = ut.tableName.replace(/^pt_/, '');
              return (
                <li
                  key={ut.id}
                  className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-0 hover:bg-bg-hover"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                    <PluginIcon iconName={ut.iconName || 'Table'} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openTab(`/u/${pathName}`)}
                        className="font-semibold text-sm text-fg-default hover:text-blue-600 text-left"
                      >
                        {ut.label || pathName}
                      </button>
                      <code className="px-1.5 py-0.5 bg-bg-muted font-mono text-[10px] text-fg-muted rounded">
                        {ut.tableName}
                      </code>
                      <Badge variant={ut.kind === 'document' ? 'info' : 'neutral'}>
                        {ut.kind === 'document' ? 'Documento' : 'Maestro'}
                      </Badge>
                      {ut.menuModule && (
                        <span className="text-[10px] text-fg-subtle">menú: {ut.menuModule}</span>
                      )}
                      <span className="text-[10px] text-fg-subtle">
                        {count} {count === 1 ? 'campo' : 'campos'}
                      </span>
                    </div>
                    {ut.description && (
                      <div className="text-[11px] text-fg-muted truncate">{ut.description}</div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addFieldTo(ut)}
                    title="Añadir campo"
                  >
                    <Plus size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openTab(`/u/${pathName}`)}
                    title="Abrir"
                  >
                    <ExternalLink size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditTable(ut)}
                    title="Editar"
                  >
                    <Edit2 size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTable(ut)}
                    title="Eliminar tabla"
                  >
                    <Trash2 size={13} />
                  </Button>
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
        <Card bodyClassName="p-0">
          <EmptyState
            icon={<Wrench size={18} />}
            title="Aún no has creado ningún campo personalizado"
            hint="Crea uno a medida o instala un pack de campos ya preparados."
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowPacksModal(true)}
                  className="flex items-center gap-2"
                >
                  <Package size={14} /> Packs
                </Button>
                <Button onClick={openCreate} className="flex items-center gap-2">
                  <Plus size={14} /> Nuevo campo
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([tbl, list]) => (
            <Card key={tbl} bodyClassName="p-0">
              <div className="px-4 py-2 border-b border-border-subtle text-[11px] font-black uppercase tracking-widest text-fg-body flex items-center gap-2">
                {tbl}
                <span className="text-[10px] text-fg-subtle font-semibold">
                  {list.length} campos
                </span>
              </div>
              <ul>
                {list.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-0"
                  >
                    <code className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[11px] rounded">
                      {r.fieldName}
                    </code>
                    <button
                      onClick={() => openEdit(r)}
                      className="text-sm font-semibold text-fg-body flex-1 truncate text-left hover:text-blue-600"
                    >
                      {r.label}
                      {r.section && (
                        <span className="ml-2 text-[10px] text-fg-subtle font-medium uppercase tracking-wider">
                          · {r.section}
                        </span>
                      )}
                    </button>
                    <Badge variant="neutral">{r.fieldType}</Badge>
                    {r.required && <Badge variant="warning">Obligatorio</Badge>}
                    {r.readOnly && <Badge variant="info">Solo lectura</Badge>}
                    {r.showInList && <Badge variant="success">En listado</Badge>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => clone(r)}
                      title="Clonar a otra tabla"
                    >
                      <Copy size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(r)}
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </Button>
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
                {/* Lista de servidor y potencialmente larga → SearchableSelect. */}
                <SearchableSelect
                  options={allowedTables.map((t) => ({ value: t, label: t }))}
                  value={form.tableName}
                  onChange={(v) => setForm({ ...form, tableName: v })}
                  disabled={!!editingId}
                  placeholder="(elige una)"
                />
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
                {/* 16 tipos → SearchableSelect; el `hint` de cada uno se usa
                    como etiqueta secundaria en el listado. */}
                <SearchableSelect
                  options={TYPE_OPTIONS.map((t) => ({
                    value: t.value,
                    label: t.label,
                    secondaryLabel: t.hint,
                  }))}
                  value={form.fieldType}
                  onChange={(v) => setForm({ ...form, fieldType: v })}
                  disabled={!!editingId}
                />
                <div className="text-[11px] text-fg-muted mt-1">
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
              <Textarea
                value={form.optionsRaw}
                onChange={(e) => setForm({ ...form, optionsRaw: e.target.value })}
                rows={5}
                placeholder={'low|Baja\nnormal|Normal\nhigh|Alta'}
                className="font-mono"
              />
            </Section>
          )}

          {form.fieldType === 'REFERENCE' && (
            <Section title="Referencia">
              <Row>
                <Field label="Tabla destino">
                  <SearchableSelect
                    options={allowedTables.map((t) => ({ value: t, label: t }))}
                    value={form.refTable}
                    onChange={(v) => setForm({ ...form, refTable: v })}
                    placeholder="(elige una)"
                    clearable
                  />
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
                <Select
                  ariaLabel="Anchura"
                  options={WIDTH_OPTIONS}
                  value={form.width}
                  onChange={(v) => setForm({ ...form, width: v as any })}
                />
              </Field>
              <Field label="Orden">
                <NumberInput
                  value={form.displayOrder}
                  onChange={(v) => setForm({ ...form, displayOrder: v ?? 0 })}
                  emptyValue="zero"
                  thousandSeparator={false}
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
                {Object.entries(VISIBLE_IN_LABELS).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.visibleIn.includes(v)}
                      onChange={(checked) =>
                        setForm({
                          ...form,
                          visibleIn: checked
                            ? [...form.visibleIn, v]
                            : form.visibleIn.filter((x) => x !== v),
                        })
                      }
                    />
                    {label}
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
                {/* Los límites se guardan con los decimales que admite el tipo:
                    entero 0, porcentaje 2, decimal/moneda 4 (como DECIMAL(15,4)). */}
                <Field label="Mínimo">
                  <NumberInput
                    value={form.min}
                    onChange={(v) => setForm({ ...form, min: v })}
                    precision={boundPrecision}
                    placeholder="sin límite"
                  />
                </Field>
                <Field label="Máximo">
                  <NumberInput
                    value={form.max}
                    onChange={(v) => setForm({ ...form, max: v })}
                    precision={boundPrecision}
                    placeholder="sin límite"
                  />
                </Field>
              </Row>
            )}
            {['TEXT', 'URL', 'EMAIL', 'PHONE'].includes(form.fieldType) && (
              <>
                <Row>
                  <Field label="Longitud mín.">
                    <NumberInput
                      value={form.minLength}
                      onChange={(v) => setForm({ ...form, minLength: v })}
                      min={0}
                      allowNegative={false}
                      placeholder="sin límite"
                    />
                  </Field>
                  <Field label="Longitud máx.">
                    <NumberInput
                      value={form.maxLength}
                      onChange={(v) => setForm({ ...form, maxLength: v })}
                      min={0}
                      allowNegative={false}
                      placeholder="sin límite"
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

          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
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
                <div className="font-bold text-fg-default">{p.label}</div>
                <div className="text-xs text-fg-muted mt-0.5">
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
              <Select
                ariaLabel="Tipo de tabla"
                options={TABLE_KIND_OPTIONS}
                value={tableForm.kind}
                onChange={(v) => setTableForm({ ...tableForm, kind: v as 'master' | 'document' })}
              />
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
            <Select
              ariaLabel="Módulo del menú"
              options={MENU_MODULE_OPTIONS}
              value={tableForm.menuModule}
              onChange={(v) => setTableForm({ ...tableForm, menuModule: v })}
            />
          </Field>
          <Field label="Descripción">
            <Input
              value={tableForm.description}
              onChange={(e) => setTableForm({ ...tableForm, description: e.target.value })}
              placeholder="Opcional"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
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
    <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle border-b border-border-subtle pb-1">
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
  // Checkbox y no Switch: forma parte del formulario del campo, se persiste al
  // pulsar «Crear campo» / «Guardar cambios».
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <Checkbox checked={checked} onChange={onChange} />
    <span className="text-sm text-fg-body">{label}</span>
  </label>
);

/**
 * Cuerpo del popup «clonar campo a otra tabla». Sustituye al window.prompt que
 * pedía el nombre de la tabla a mano.
 */
const CloneTargetForm: React.FC<{
  tables: string[];
  onCancel: () => void;
  onConfirm: (table: string) => void;
}> = ({ tables, onCancel, onConfirm }) => {
  const [target, setTarget] = useState(tables[0] || '');
  return (
    <div className="space-y-4">
      <Field label="Tabla destino">
        <SearchableSelect
          options={tables.map((t) => ({ value: t, label: t }))}
          value={target}
          onChange={setTarget}
          placeholder="(elige una)"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => onConfirm(target)} disabled={!target}>
          Clonar
        </Button>
      </div>
    </div>
  );
};

export default CustomFields;
