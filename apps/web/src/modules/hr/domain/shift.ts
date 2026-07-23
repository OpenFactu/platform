export interface ShiftTemplate {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  secondStartTime: string | null;
  secondEndTime: string | null;
  color: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

export interface ShiftPatternSlot {
  week: number;
  dayOfWeek: number;
  shiftTemplateId: string;
}

export interface ShiftPatternAssignment {
  id: string;
  patternId: string;
  employeeId: string;
  weekOffset: number;
  validFrom: string;
  validTo: string | null;
  [key: string]: unknown;
}

export interface ShiftPattern {
  id: string;
  name: string;
  cycleWeeks: number;
  slots: ShiftPatternSlot[];
  isActive: boolean;
  assignments?: ShiftPatternAssignment[];
  [key: string]: unknown;
}

/** Turno materializado (asignación real de un empleado a un día concreto). */
export interface ShiftAssignment {
  id: string;
  employeeId: string;
  date: string;
  startAt: string;
  endAt: string;
  status: 'scheduled' | 'cancelled' | 'substituted';
  shiftTemplateId: string | null;
  breakMinutes: number;
  notes: string | null;
  [key: string]: unknown;
}
