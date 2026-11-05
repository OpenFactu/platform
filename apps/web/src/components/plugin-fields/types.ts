/** Definición canónica de un campo personalizado (plugin o user field).
 *  Es lo que devuelve `/api/plugins/fields/:tableName`. */
export interface PluginFieldDef {
  id: string;
  pluginId: string;
  tenantId?: string | null;
  tableName: string;
  /** Incluye el prefijo `p_`. */
  fieldName: string;
  fieldType:
    | 'TEXT'
    | 'INTEGER'
    | 'DECIMAL'
    | 'BOOLEAN'
    | 'DATE'
    | 'JSONB'
    | 'ENUM'
    | 'MULTISELECT'
    | 'CURRENCY'
    | 'PERCENT'
    | 'URL'
    | 'EMAIL'
    | 'PHONE'
    | 'COLOR'
    | 'REFERENCE'
    | 'FILE';
  label: string;
  options?: Array<{ value: string; label: string }> | null;
  required?: boolean;
  readOnly?: boolean;
  helpText?: string | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  width?: 'full' | 'half' | 'third';
  displayOrder?: number;
  section?: string | null;
  visibleIn?: string[] | null;
  showInList?: boolean;
  readRoles?: string[] | null;
  writeRoles?: string[] | null;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    unique?: boolean;
  } | null;
  /** El objeto del sistema de un campo enlazado (`/api/linked-objects`). */
  refObject?: string | null;
  refTable?: string | null;
  refDisplayField?: string | null;
}

export type FieldSurface = 'form' | 'detail' | 'list' | 'pdf';
