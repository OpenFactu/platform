export interface CommissionRule {
  id: string;
  name: string;
  scope: 'employee' | 'department' | 'all';
  employeeId: string | null;
  departmentId: string | null;
  basis: 'net_amount' | 'gross_amount' | 'margin';
  kind: 'flat_pct' | 'tiered';
  pct: string;
  tiers: unknown;
  payrollConceptId: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

export interface CommissionAccrual {
  id: string;
  employeeId: string;
  ruleId: string | null;
  periodYear: number;
  periodMonth: number;
  sourceDocType: string;
  sourceDocId: string;
  base: string;
  amount: string;
  status: 'pending' | 'paid' | 'cancelled';
  payrollLineId: string | null;
  [key: string]: unknown;
}
