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
  state: 'closed' | 'working' | 'on_break';
  allowedActions: TimeclockEntry['kind'][];
  [key: string]: unknown;
}

export interface IdentificationView {
  identificationId: string;
  employeeName: string;
  state: 'closed' | 'working' | 'on_break';
  allowedActions: TimeclockEntry['kind'][];
  expiresAt: string;
}
export const WORK_STATE_LABEL = {
  closed: 'Sin jornada abierta',
  working: 'Trabajando',
  on_break: 'En pausa',
};

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
