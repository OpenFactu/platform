/** Datos de tablas y campos, y el paso entre lo que guarda el servidor y los formularios. */

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldRow {
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
  options: FieldOption[] | null;
  visibleIn: string[] | null;
  readRoles: string[] | null;
  writeRoles: string[] | null;
  validation: any;
  refObject: string | null;
  refTable: string | null;
  refDisplayField: string | null;
}

export interface UserTableRow {
  id: string;
  tableName: string;
  label: string | null;
  kind: string;
  iconName: string | null;
  menuModule: string | null;
  description: string | null;
  displayField: string | null;
}

export interface PackInfo {
  id: string;
  label: string;
  count: number;
  fields: any[];
}

/** Claves i18n del nombre y la explicación de cada tipo de campo. */
export const FIELD_TYPES: { value: string; key: string }[] = [
  { value: 'TEXT', key: 'text' },
  { value: 'INTEGER', key: 'integer' },
  { value: 'DECIMAL', key: 'decimal' },
  { value: 'CURRENCY', key: 'currency' },
  { value: 'PERCENT', key: 'percent' },
  { value: 'BOOLEAN', key: 'boolean' },
  { value: 'DATE', key: 'date' },
  { value: 'URL', key: 'url' },
  { value: 'EMAIL', key: 'email' },
  { value: 'PHONE', key: 'phone' },
  { value: 'COLOR', key: 'color' },
  { value: 'ENUM', key: 'enum' },
  { value: 'MULTISELECT', key: 'multiselect' },
  { value: 'REFERENCE', key: 'reference' },
  { value: 'FILE', key: 'file' },
  { value: 'JSONB', key: 'json' },
];

export const NUMERIC_TYPES = ['INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENT'];
export const TEXT_TYPES = ['TEXT', 'URL', 'EMAIL', 'PHONE'];
export const OPTION_TYPES = ['ENUM', 'MULTISELECT'];
export const ROLE_OPTIONS = ['SUPERUSER', 'ADMIN', 'USER', 'DRIVER'];
export const SURFACES = ['form', 'detail', 'list', 'pdf'];

export const MENU_MODULES = [
  'home',
  'inventory',
  'sales',
  'purchases',
  'accounting',
  'hr',
  'reports',
  'configuration',
];

/** Iconos que se ofrecen para una tabla: nombres de lucide-react. */
export const TABLE_ICONS = [
  'Table',
  'FileText',
  'ClipboardList',
  'Receipt',
  'Folder',
  'BookOpen',
  'Users',
  'Briefcase',
  'Building2',
  'Package',
  'Truck',
  'Car',
  'Wrench',
  'Calendar',
  'MapPin',
  'Tag',
  'Star',
  'Phone',
  'Mail',
  'ShieldCheck',
];

/** Nombre técnico a partir del texto que escribe el usuario: `Teléfono móvil` → `telefono_movil`. */
export function technicalNameFrom(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, 41);
  return slug.replace(/_+$/, '');
}

export const defaultFieldForm = (tableName = '', displayOrder = 0) => ({
  tableName,
  fieldName: '',
  /** El nombre técnico sigue a la etiqueta hasta que alguien lo escribe a mano. */
  fieldNameTouched: false,
  fieldType: 'TEXT',
  label: '',
  required: false,
  readOnly: false,
  showInList: false,
  width: 'half' as FieldRow['width'],
  displayOrder,
  section: '',
  helpText: '',
  placeholder: '',
  defaultValue: '',
  options: [] as FieldOption[],
  visibleIn: [...SURFACES],
  readRoles: [] as string[],
  writeRoles: [] as string[],
  min: null as number | null,
  max: null as number | null,
  minLength: null as number | null,
  maxLength: null as number | null,
  pattern: '',
  unique: false,
  refObject: '',
});

export type FieldForm = ReturnType<typeof defaultFieldForm>;

export function fieldFormFromRow(r: FieldRow): FieldForm {
  return {
    tableName: r.tableName,
    fieldName: r.fieldName.replace(/^p_/, ''),
    fieldNameTouched: true,
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
    options: r.options || [],
    visibleIn: r.visibleIn || [...SURFACES],
    readRoles: r.readRoles || [],
    writeRoles: r.writeRoles || [],
    min: r.validation?.min ?? null,
    max: r.validation?.max ?? null,
    minLength: r.validation?.minLength ?? null,
    maxLength: r.validation?.maxLength ?? null,
    pattern: r.validation?.pattern || '',
    unique: !!r.validation?.unique,
    refObject: r.refObject || '',
  };
}

/** Opciones listas para guardar: sin filas vacías y con valor aunque solo se escribiera el texto. */
export function cleanOptions(options: FieldOption[]): FieldOption[] {
  return options
    .map((o) => {
      const label = o.label.trim();
      const value = o.value.trim() || technicalNameFrom(label) || label;
      return { value, label: label || value };
    })
    .filter((o) => o.value);
}

/** Clave i18n de lo que impide guardar el campo; `null` si está bien. */
export function fieldFormError(form: FieldForm): string | null {
  if (!form.tableName || !form.fieldName || !form.fieldType) return 'requiredFields';
  if (OPTION_TYPES.includes(form.fieldType) && cleanOptions(form.options).length === 0) {
    return 'optionRequired';
  }
  if (form.fieldType === 'REFERENCE' && !form.refObject) return 'refObjectRequired';
  return null;
}

export function fieldFormToBody(form: FieldForm) {
  const validation: Record<string, unknown> = {};
  if (form.min !== null) validation.min = form.min;
  if (form.max !== null) validation.max = form.max;
  if (form.minLength !== null) validation.minLength = form.minLength;
  if (form.maxLength !== null) validation.maxLength = form.maxLength;
  if (form.pattern) validation.pattern = form.pattern;
  if (form.unique) validation.unique = true;
  return {
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
    options: OPTION_TYPES.includes(form.fieldType) ? cleanOptions(form.options) : null,
    visibleIn: form.visibleIn,
    readRoles: form.readRoles.length ? form.readRoles : null,
    writeRoles: form.writeRoles.length ? form.writeRoles : null,
    validation: Object.keys(validation).length ? validation : null,
    refObject: form.fieldType === 'REFERENCE' ? form.refObject : null,
  };
}

export const defaultTableForm = () => ({
  name: '',
  nameTouched: false,
  label: '',
  kind: 'master' as 'master' | 'document',
  iconName: 'Table',
  menuModule: '',
  description: '',
  displayField: '',
});

export type TableForm = ReturnType<typeof defaultTableForm>;

export function tableFormFromRow(t: UserTableRow): TableForm {
  return {
    name: t.tableName.replace(/^pt_/, ''),
    nameTouched: true,
    label: t.label || '',
    kind: t.kind === 'document' ? 'document' : 'master',
    iconName: t.iconName || 'Table',
    menuModule: t.menuModule || '',
    description: t.description || '',
    displayField: t.displayField || '',
  };
}
