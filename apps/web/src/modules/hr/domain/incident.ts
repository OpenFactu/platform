export interface IncidentType {
  id: string;
  code: string;
  name: string;
  requiresSubstitution: boolean;
  affectsPayroll: boolean;
  consumesLeaveBalance: boolean;
  requiresDocument: boolean;
  paid: boolean;
  color: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

export interface Incident {
  id: string;
  employeeId: string;
  incidentTypeId: string;
  startAt: string;
  endAt: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'covered';
  notes: string | null;
  [key: string]: unknown;
}

/** Candidato a sustituto sugerido para cubrir una incidencia. */
export interface SubstituteCandidate {
  id: string;
  code?: string;
  firstName: string;
  lastName: string;
  [key: string]: unknown;
}
