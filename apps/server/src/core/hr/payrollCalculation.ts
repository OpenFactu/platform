/**
 * Cálculo de nómina sin conocer ningún país: devengos, bases y conceptos por
 * categoría (`income_tax`, `social_employee`, `social_employer`). Lo que dependa
 * de una ley concreta lo aporta un plugin con `payroll.registerCalculator`.
 */
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';

export interface PayrollLineUpdate {
  id: string;
  baseAmount: string;
  amount: string;
  rate: string;
}

export interface PayrollTotals {
  gross: number;
  incomeTax: number;
  socialEmployee: number;
  socialEmployer: number;
  otherDeductions: number;
  netPay: number;
}

export interface PayrollCalculation {
  lineUpdates: PayrollLineUpdate[];
  totals: PayrollTotals;
}

export interface PayrollCalculatorInput {
  tenantId: string;
  payrollId: string;
  lines: any[];
  concepts: any[];
  /** El resultado estándar, para ajustarlo sin rehacerlo entero. */
  standard: PayrollCalculation;
}

/** Devuelve el cálculo definitivo, o null para dejar el estándar. */
export type PayrollCalculator = (
  input: PayrollCalculatorInput,
) => PayrollCalculation | null | undefined | Promise<PayrollCalculation | null | undefined>;

const calculators = new TenantScopedRegistry<PayrollCalculator>();

export const PayrollCalculators = {
  register(pluginId: string, calculator: PayrollCalculator): void {
    calculators.add(pluginId, calculator);
  },
  activeFor(tenantId: string | undefined): PayrollCalculator[] {
    return calculators.activeFor(tenantId);
  },
  /** Solo para los tests. */
  clear(): void {
    calculators.clear();
  },
};

function lineAmount(line: any, concept?: any): number {
  // Si la línea tiene amount fijado (>0 o explícito), respeta ese valor.
  if (line.amount != null && line.amount !== '0') return Number(line.amount);
  const calc = concept?.calculation || 'fixed';
  if (calc === 'per_hour' && line.quantity != null && line.rate != null) {
    return Number(line.quantity) * Number(line.rate);
  }
  if (calc === 'percent_of_base' && line.baseAmount != null && line.rate != null) {
    return (Number(line.baseAmount) * Number(line.rate)) / 100;
  }
  return Number(line.amount || 0);
}

function kindOf(line: any, concept?: any): string {
  return (
    concept?.kind ??
    (line.type === 'earning'
      ? 'devengo'
      : line.type === 'employer_cost'
        ? 'aportacion_empresa'
        : 'deduccion')
  );
}

/**
 * Cálculo estándar. Deja los importes actualizados en `lines` y devuelve qué
 * líneas han cambiado para que quien llama las guarde.
 */
export function computeStandardPayroll(lines: any[], concepts: any[]): PayrollCalculation {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const conceptOf = (l: any) => (l.conceptId ? byId.get(l.conceptId) : null);

  // Pass 1 — bases: solo devengos, salvo los marcados como no sujetos.
  let baseIncomeTax = 0;
  let baseSocial = 0;
  let gross = 0;
  for (const l of lines) {
    const c = conceptOf(l);
    if (kindOf(l, c) !== 'devengo') continue;
    const amt = lineAmount(l, c);
    gross += amt;
    if (c?.taxableIncomeTax !== false) baseIncomeTax += amt;
    if (c?.taxableSocial !== false) baseSocial += amt;
  }

  // Pass 2 — deducciones y aportaciones "% de base", sobre la base que les toca.
  const lineUpdates: PayrollLineUpdate[] = [];
  for (const l of lines) {
    const c = conceptOf(l);
    if (!c || c.calculation !== 'percent_of_base') continue;
    if (kindOf(l, c) === 'devengo') continue;
    const base = c.category === 'income_tax' ? baseIncomeTax : baseSocial;
    const rate = Number(l.rate || c.defaultPercent || 0);
    const baseStr = String(base.toFixed(2));
    const amtStr = String(((base * rate) / 100).toFixed(2));
    if (String(l.baseAmount || '') !== baseStr || String(l.amount || '') !== amtStr) {
      lineUpdates.push({ id: l.id, baseAmount: baseStr, amount: amtStr, rate: String(rate) });
      l.baseAmount = baseStr;
      l.amount = amtStr;
    }
  }

  // Pass 3 — sumar deducciones y aportaciones con los importes ya actualizados.
  let incomeTax = 0;
  let socialEmployee = 0;
  let socialEmployer = 0;
  let otherDeductions = 0;
  for (const l of lines) {
    const c = conceptOf(l);
    const k = kindOf(l, c);
    if (k === 'devengo') continue;
    const amt = lineAmount(l, c);
    if (k === 'aportacion_empresa') socialEmployer += amt;
    else if (c?.category === 'income_tax') incomeTax += amt;
    else if (c?.category === 'social_employee') socialEmployee += amt;
    else otherDeductions += amt;
  }

  return {
    lineUpdates,
    totals: {
      gross,
      incomeTax,
      socialEmployee,
      socialEmployer,
      otherDeductions,
      netPay: gross - incomeTax - socialEmployee - otherDeductions,
    },
  };
}

/** Valores que se guardan en la cabecera de la nómina. */
export function payrollTotalsColumns(totals: PayrollTotals) {
  const incomeTaxTotal = String(totals.incomeTax.toFixed(2));
  const socialEmployeeTotal = String(totals.socialEmployee.toFixed(2));
  const socialEmployerTotal = String(totals.socialEmployer.toFixed(2));
  return {
    gross: String(totals.gross.toFixed(2)),
    incomeTaxTotal,
    socialEmployeeTotal,
    socialEmployerTotal,
    netPay: String(totals.netPay.toFixed(2)),
    // Columnas anteriores, hasta retirarlas (ver migración 082).
    irpfAmount: incomeTaxTotal,
    ssEmployee: socialEmployeeTotal,
    ssEmployer: socialEmployerTotal,
  };
}
