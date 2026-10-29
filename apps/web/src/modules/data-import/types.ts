/** Tipos del importador de datos, espejo de `core/dataimport` en el server. */

export type ImportMode = 'insert' | 'update' | 'upsert';

export type ImportFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'ref';

export interface ImportField {
  key: string;
  label: string;
  type: ImportFieldType;
  required?: boolean | 'onInsert';
  enumValues?: string[];
  example?: string;
  help?: string;
  ref?: { table: string; matchBy: string[]; label: string };
}

export interface ImportNaturalKey {
  key: string;
  column: string;
  label: string;
  unique?: boolean;
}

export type ImportGroup = 'maestros' | 'stock' | 'documentos' | 'contabilidad' | 'rrhh' | 'crm';

export interface ImportObject {
  id: string;
  label: string;
  description?: string;
  group: ImportGroup;
  modulePath: string;
  naturalKeys: ImportNaturalKey[];
  supportsUpdate: boolean;
  supportsUndo: boolean;
  dependsOn: string[];
  fields: ImportField[];
  lines: { label: string; groupBy: string; fields: ImportField[] } | null;
}

export interface AutomapEntry {
  column: string;
  field: string | null;
  confidence: 'exact' | 'synonym' | 'partial' | null;
}

export interface UploadedSheet {
  name: string;
  headers: string[];
  totalRows: number;
  preview: Array<Record<string, unknown>>;
  automap: AutomapEntry[];
  mapping: Record<string, string>;
}

export interface UploadResult {
  uploadId: string;
  fileName: string;
  sheets: UploadedSheet[];
}

export type JobStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'error' | 'undone';

export interface ImportJob {
  id: string;
  objectId: string;
  mode: ImportMode;
  dryRun: boolean;
  fileName: string;
  sheetName: string | null;
  mapping: Record<string, string>;
  matchBy: string | null;
  status: JobStatus;
  totalRows: number;
  processedRows: number;
  okRows: number;
  errorRows: number;
  skippedRows: number;
  error: string | null;
  createdBy: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  undoneAt: string | null;
}

export interface ImportJobRow {
  id: string;
  jobId: string;
  rowNum: number;
  status: 'ok' | 'error' | 'skipped' | 'undone';
  action: 'created' | 'updated' | null;
  entityId: string | null;
  entityCode: string | null;
  message: string | null;
  raw: Record<string, unknown> | null;
}

export interface SavedMapping {
  id: string;
  objectId: string;
  name: string;
  mapping: Record<string, string>;
  mode: ImportMode | null;
  matchBy: string | null;
}

/** Payload de los eventos `dataImport.progress` / `dataImport.finished`. */
export interface ImportProgressEvent {
  jobId: string;
  objectId: string;
  objectLabel: string;
  mode: ImportMode;
  dryRun: boolean;
  status: JobStatus | 'undoing';
  total: number;
  processed: number;
  ok: number;
  errors: number;
  skipped: number;
  error?: string;
}
