export interface CollectiveAgreement {
  id: string;
  code: string;
  name: string;
  sector: string | null;
  validFrom: string | null;
  validTo: string | null;
  baseSalary: string | null;
  vacationDays: number | null;
  weeklyHours: string | null;
  documentUrl: string | null;
  notes: string | null;
  isActive: boolean;
  [key: string]: unknown;
}
