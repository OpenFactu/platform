export interface Employee {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  dni: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  iban: string | null;
  kioskPin: string | null;
  departmentId: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  status: 'active' | 'leave' | 'terminated';
  notes: string | null;
  [k: string]: unknown;
}

/** Contrato de un empleado (salario/pagas). Usado para prellenar nóminas. */
export interface Contract {
  id: string;
  employeeId: string;
  isActive: boolean;
  grossSalary: string | number;
  paymentsPerYear: number;
  [key: string]: unknown;
}
