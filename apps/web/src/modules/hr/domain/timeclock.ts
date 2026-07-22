export interface TimeclockEntry {
  id: string;
  kind: 'in' | 'out' | 'break_start' | 'break_end';
  at: string;
  source: 'web' | 'kiosk' | 'admin';
  employeeId?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface TimeclockMeResponse {
  employee: Record<string, unknown>;
  entries: TimeclockEntry[];
  [key: string]: unknown;
}

/** Fila del export de fichajes (usada por Timeclock.tsx para generar el .xlsx en cliente). */
export interface TimeclockExportRow {
  fecha: string;
  hora: string;
  empleadoCodigo: string;
  empleadoNombre: string;
  tipo: string;
  origen: string;
  notas: string;
  [key: string]: unknown;
}
