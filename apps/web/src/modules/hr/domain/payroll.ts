export interface Payroll {
  id: string;
  employeeId: string;
  periodYear: number;
  periodMonth: number;
  gross: string;
  irpfAmount: string;
  ssEmployee: string;
  ssEmployer: string;
  netPay: string;
  status: 'draft' | 'approved' | 'paid';
  journalEntryId: string | null;
  lines?: PayrollLine[];
  [key: string]: unknown;
}

export interface PayrollLine {
  id: string;
  conceptId?: string | null;
  concept: string;
  type: 'earning' | 'deduction' | 'employer_cost';
  quantity?: number | string | null;
  rate?: number | string | null;
  baseAmount?: number | string | null;
  amount: number | string;
  [key: string]: unknown;
}

export interface PayrollConcept {
  id: string;
  code: string;
  name: string;
  kind: 'devengo' | 'deduccion' | 'aportacion_empresa';
  taxableIrpf: boolean;
  taxableSs: boolean;
  calculation: 'fixed' | 'percent_of_base' | 'per_hour';
  defaultAmount: string | null;
  defaultPercent: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

/**
 * Respuesta del POST de creación de nómina. Puede ser la nómina creada o,
 * en 409, `{existingId, error}` — de ahí que los campos de Payroll sean
 * parciales aquí (ver payrollsApi.createSafe).
 */
export interface PayrollCreateResponse extends Partial<Payroll> {
  id?: string;
  existingId?: string;
  error?: string;
  [key: string]: unknown;
}
