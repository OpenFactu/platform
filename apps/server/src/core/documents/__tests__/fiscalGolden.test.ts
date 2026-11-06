/**
 * Golden del comportamiento fiscal: fija los importes y cuentas que producen
 * el motor de documentos, el de asientos y la nómina para que neutralizar el
 * núcleo no los mueva. Si uno de estos valores cambia, hay un cambio de
 * cálculo, no un refactor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentEngine } from '../DocumentEngine';
import { JournalEngine } from '../../accounting/JournalEngine';
import { recalcPayroll } from '../../../api/hr/payrolls';
import * as schema from '../../../db/schema';

const engine = DocumentEngine as any;

const TAX_RATES = { g0: 0, g4: 4, g10: 10, g21: 21 };

const lineOf = (overrides: Record<string, any>) => ({
  itemId: 'i',
  quantity: 2,
  price: 50,
  taxGroupId: 'g21',
  ...overrides,
});

test('línea: cada tipo del catálogo', () => {
  for (const [group, rate] of Object.entries(TAX_RATES)) {
    const a = engine.computeLineAmounts(lineOf({ taxGroupId: group }), TAX_RATES);
    assert.equal(a.bruto, 100);
    assert.equal(a.neto, 100);
    assert.equal(a.taxRate, rate);
    assert.equal(a.taxAmount, rate);
    assert.equal(a.withholding, 0);
  }
});

test('línea: descuento por porcentaje e importe', () => {
  const byRate = engine.computeLineAmounts(lineOf({ discountRate: 10 }), TAX_RATES);
  assert.equal(byRate.discount, 10);
  assert.equal(byRate.neto, 90);
  assert.equal(byRate.taxAmount, 18.9);

  const byAmount = engine.computeLineAmounts(lineOf({ discountAmount: 25 }), TAX_RATES);
  assert.equal(byAmount.discount, 25);
  assert.equal(byAmount.neto, 75);
  assert.equal(byAmount.taxAmount, 15.75);

  // El importe explícito gana sobre el porcentaje.
  const both = engine.computeLineAmounts(
    lineOf({ discountRate: 10, discountAmount: 25 }),
    TAX_RATES,
  );
  assert.equal(both.discount, 25);
});

test('línea: el taxRate explícito gana sobre el grupo', () => {
  const a = engine.computeLineAmounts(lineOf({ taxRate: 7 }), TAX_RATES);
  assert.equal(a.taxRate, 7);
  assert.equal(a.taxAmount, 7);
});

test('línea: un grupo desconocido tributa a 0', () => {
  const a = engine.computeLineAmounts(lineOf({ taxGroupId: 'nope' }), TAX_RATES);
  assert.equal(a.taxRate, 0);
  assert.equal(a.taxAmount, 0);
});

test('línea: retención por porcentaje e importe', () => {
  const byRate = engine.computeLineAmounts(lineOf({ withholdingRate: 15 }), TAX_RATES);
  assert.equal(byRate.withholding, 15);
  const byAmount = engine.computeLineAmounts(lineOf({ withholdingAmount: 7 }), TAX_RATES);
  assert.equal(byAmount.withholding, 7);
});

test('documento: totales con varios tipos y sin retención', () => {
  const t = engine.computePreliminaryTotals(
    {
      lines: [lineOf({}), lineOf({ taxGroupId: 'g10' }), lineOf({ discountRate: 50 })],
    },
    TAX_RATES,
  );
  assert.equal(t.preliminarySubtotal, 250);
  assert.equal(t.preliminaryTaxTotal, 41.5);
  assert.equal(t.docWithholding, 0);
});

test('documento: la retención de cabecera gana sobre las de línea', () => {
  const t = engine.computePreliminaryTotals(
    { withholdingRate: 15, lines: [lineOf({ withholdingRate: 7 }), lineOf({})] },
    TAX_RATES,
  );
  assert.equal(t.preliminaryWithholding, 7);
  assert.equal(t.docWithholding, 30);
  assert.equal(t.docWhRate, 15);

  const byAmount = engine.computePreliminaryTotals(
    { withholdingAmount: 12, lines: [lineOf({})] },
    TAX_RATES,
  );
  assert.equal(byAmount.docWithholding, 12);
});

test('línea en negativo: el inverso exacto, con descuento y retención', () => {
  const byRate = engine.computeLineAmounts(lineOf({ quantity: -2, discountRate: 10 }), TAX_RATES);
  assert.equal(byRate.bruto, -100);
  assert.equal(byRate.discount, -10);
  assert.equal(byRate.neto, -90);
  assert.equal(byRate.taxAmount, -18.9);

  const byAmount = engine.computeLineAmounts(
    lineOf({ quantity: -2, discountAmount: -25 }),
    TAX_RATES,
  );
  assert.equal(byAmount.neto, -75);
  assert.equal(byAmount.taxAmount, -15.75);

  const withheld = engine.computeLineAmounts(
    lineOf({ quantity: -2, withholdingRate: 15 }),
    TAX_RATES,
  );
  assert.equal(withheld.withholding, -15);
  const withheldByAmount = engine.computeLineAmounts(
    lineOf({ quantity: -2, withholdingAmount: -12 }),
    TAX_RATES,
  );
  assert.equal(withheldByAmount.withholding, -12);
});

test('documento en negativo: la retención de cabecera también va en negativo', () => {
  const byAmount = engine.computePreliminaryTotals(
    { withholdingAmount: -12, lines: [lineOf({ quantity: -2 })] },
    TAX_RATES,
  );
  assert.equal(byAmount.docWithholding, -12);
  const byRate = engine.computePreliminaryTotals(
    { withholdingRate: 15, lines: [lineOf({ quantity: -2 })] },
    TAX_RATES,
  );
  assert.equal(byRate.docWithholding, -15);
});

/**
 * Prepara JournalEngine para un test sin BD: cada kind de mapeo resuelve a una
 * cuenta conocida y `create` valida y captura el asiento en vez de insertarlo.
 */
function captureJournal(t: any, accounts: Record<string, string>) {
  const captured: any[] = [];
  t.mock.method(JournalEngine, 'resolveAccount', async (_db: any, kind: string, key?: string) =>
    key ? null : (accounts[kind] ?? null),
  );
  t.mock.method(JournalEngine, 'create', async (_db: any, input: any) => {
    JournalEngine.validate(input);
    captured.push(input);
    return { id: 'je' };
  });
  return captured;
}

const summarize = (entry: any) =>
  entry.lines.map((l: any) => ({
    account: l.accountId,
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
  }));

const ACCOUNTS = {
  customer_receivable: '430000',
  sales_revenue: '700000',
  tax_output: '477000',
  supplier_payable: '400000',
  purchase_expense: '600000',
  tax_input: '472000',
  withholding_receivable: '473000',
  withholding_payable: '4751000',
  bank: '572000',
  cash: '570000',
  payroll_gross: '640000',
  payroll_income_tax: '4751000',
  payroll_social_employee: '476000',
  payroll_social_employer: '642000',
  payroll_net: '465000',
};

/** Una fila por cuenta de impuesto: la entrada del asiento cuando hay desglose. */
const noTaxRows = {
  select: () => ({ from: () => ({ where: async () => [] }) }),
};

const invoice = {
  id: 'f1',
  docNum: 1,
  date: new Date('2026-01-15'),
  periodId: 'p1',
  partnerId: 'bp',
  subtotal: '100.0000',
  taxTotal: '21.0000',
  total: '121.0000',
};

test('asiento de venta sin retención', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromSalesInvoice(noTaxRows, invoice, []);
  assert.deepEqual(summarize(captured[0]), [
    { account: '430000', debit: 121, credit: 0 },
    { account: '700000', debit: 0, credit: 100 },
    { account: '477000', debit: 0, credit: 21 },
  ]);
  assert.equal(captured[0].source, 'sales_invoice');
});

const creditNote = {
  ...invoice,
  subtotal: '-100.0000',
  taxTotal: '-21.0000',
  total: '-121.0000',
};

test('asiento de un abono de venta: el de la factura con los lados cambiados', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromSalesInvoice(noTaxRows, creditNote, []);
  assert.deepEqual(summarize(captured[0]), [
    { account: '430000', debit: 0, credit: 121 },
    { account: '700000', debit: 100, credit: 0 },
    { account: '477000', debit: 21, credit: 0 },
  ]);
  assert.equal(captured[0].source, 'sales_invoice');
});

test('asiento de un abono de compra: el de la factura con los lados cambiados', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromPurchaseInvoice(noTaxRows, creditNote, []);
  assert.deepEqual(summarize(captured[0]), [
    { account: '600000', debit: 0, credit: 100 },
    { account: '400000', debit: 121, credit: 0 },
    { account: '472000', debit: 0, credit: 21 },
  ]);
});

test('asiento de un abono con retención: cuadra con la retención al revés', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromSalesInvoice(
    noTaxRows,
    { ...creditNote, total: '-106.0000', withholdingAmount: '-15.0000' },
    [],
  );
  assert.deepEqual(summarize(captured[0]), [
    { account: '430000', debit: 0, credit: 106 },
    { account: '700000', debit: 100, credit: 0 },
    { account: '477000', debit: 21, credit: 0 },
    { account: '473000', debit: 0, credit: 15 },
  ]);
});

test('asiento de un abono con varios impuestos: una línea por cuenta', async (t) => {
  const captured = captureJournal(t, { ...ACCOUNTS, tax_reduced: '477100' });
  const rows = [
    { accountKind: 'tax_output', amount: '-21', isWithholding: false },
    { accountKind: 'tax_reduced', amount: '-10', isWithholding: false },
  ];
  const db = { select: () => ({ from: () => ({ where: async () => rows }) }) };
  await JournalEngine.createFromSalesInvoice(
    db,
    { ...creditNote, subtotal: '-200.0000', taxTotal: '-31.0000', total: '-231.0000' },
    [],
  );
  assert.deepEqual(summarize(captured[0]), [
    { account: '430000', debit: 0, credit: 231 },
    { account: '700000', debit: 200, credit: 0 },
    { account: '477000', debit: 21, credit: 0 },
    { account: '477100', debit: 10, credit: 0 },
  ]);
});

test('devolver un cobro: el asiento del cobro con los lados cambiados', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromPayment(
    {},
    { id: 'p1', amount: '-50', date: new Date('2026-01-20'), paymentMethodId: null },
    { id: 'f1', partnerId: 'bp', periodId: 'p1', docNum: 1 },
    'sales',
  );
  const lines = summarize(captured[0]);
  assert.deepEqual(
    lines.map((l: any) => [l.debit, l.credit]),
    [
      [0, 50],
      [50, 0],
    ],
  );
  assert.equal(lines[1].account, '430000');
});

test('asiento de compra sin retención', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromPurchaseInvoice(noTaxRows, invoice, []);
  assert.deepEqual(summarize(captured[0]), [
    { account: '600000', debit: 100, credit: 0 },
    { account: '400000', debit: 0, credit: 121 },
    { account: '472000', debit: 21, credit: 0 },
  ]);
  assert.equal(captured[0].source, 'purchase_invoice');
});

test('asiento de venta y compra sin impuesto no lleva línea de impuesto', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  const exempt = { ...invoice, taxTotal: '0', total: '100.0000' };
  await JournalEngine.createFromSalesInvoice(noTaxRows, exempt, []);
  await JournalEngine.createFromPurchaseInvoice(noTaxRows, exempt, []);
  assert.equal(captured[0].lines.length, 2);
  assert.equal(captured[1].lines.length, 2);
});

test('sin mapeos mínimos no se genera asiento', async (t) => {
  captureJournal(t, {});
  assert.equal(await JournalEngine.createFromSalesInvoice(noTaxRows, invoice, []), null);
  assert.equal(await JournalEngine.createFromPurchaseInvoice(noTaxRows, invoice, []), null);
});

test('asiento de venta con retención: cuadra llevando la retención a su cuenta', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  const withheld = { ...invoice, withholdingAmount: '15.0000', total: '106.0000' };
  await JournalEngine.createFromSalesInvoice(noTaxRows, withheld, []);
  assert.deepEqual(summarize(captured[0]), [
    { account: '430000', debit: 106, credit: 0 },
    { account: '700000', debit: 0, credit: 100 },
    { account: '477000', debit: 0, credit: 21 },
    { account: '473000', debit: 15, credit: 0 },
  ]);
});

test('asiento de compra con retención: cuadra llevando la retención a su cuenta', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  const withheld = { ...invoice, withholdingAmount: '15.0000', total: '106.0000' };
  await JournalEngine.createFromPurchaseInvoice(noTaxRows, withheld, []);
  assert.deepEqual(summarize(captured[0]), [
    { account: '600000', debit: 100, credit: 0 },
    { account: '400000', debit: 0, credit: 106 },
    { account: '472000', debit: 21, credit: 0 },
    { account: '4751000', debit: 0, credit: 15 },
  ]);
});

test('asiento de cobro y de pago', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  const payment = { id: 'pay', amount: '50', date: new Date('2026-02-01') };
  const ref = { id: 'f1', partnerId: 'bp', periodId: 'p1', docNum: 1 };
  await JournalEngine.createFromPayment(noTaxRows, payment, ref, 'sales');
  await JournalEngine.createFromPayment(noTaxRows, payment, ref, 'purchase');
  assert.deepEqual(summarize(captured[0]), [
    { account: '572000', debit: 50, credit: 0 },
    { account: '430000', debit: 0, credit: 50 },
  ]);
  assert.deepEqual(summarize(captured[1]), [
    { account: '400000', debit: 50, credit: 0 },
    { account: '572000', debit: 0, credit: 50 },
  ]);
});

test('asiento de nómina', async (t) => {
  const captured = captureJournal(t, ACCOUNTS);
  await JournalEngine.createFromPayroll(
    noTaxRows,
    {
      id: 'n1',
      employeeId: 'e',
      periodYear: 2026,
      periodMonth: 3,
      gross: '2000',
      incomeTaxTotal: '300',
      socialEmployeeTotal: '127',
      socialEmployerTotal: '598',
      netPay: '1573',
    } as any,
    { id: 'e', costCenterId: null, profitCenterId: null },
    'p1',
  );
  assert.deepEqual(summarize(captured[0]), [
    { account: '640000', debit: 2000, credit: 0 },
    { account: '642000', debit: 598, credit: 0 },
    { account: '4751000', debit: 0, credit: 300 },
    { account: '476000', debit: 0, credit: 127 },
    { account: '476000', debit: 0, credit: 598 },
    { account: '465000', debit: 0, credit: 1573 },
  ]);
});

/** Cliente mínimo para recalcPayroll: lee filas por tabla y registra updates. */
function fakePayrollClient(lines: any[], concepts: any[]) {
  const payrollUpdates: any[] = [];
  const rowsFor = (table: any) =>
    table === schema.payrollLines ? lines : table === schema.payrollConcepts ? concepts : [];
  return {
    payrollUpdates,
    select: () => ({ from: (table: any) => ({ where: async () => rowsFor(table) }) }),
    update: (table: any) => ({
      set: (values: any) => ({
        where: async () => {
          if (table === schema.payrolls) payrollUpdates.push(values);
        },
      }),
    }),
  };
}

const concept = (overrides: Record<string, any>) => ({
  calculation: 'fixed',
  taxableIncomeTax: true,
  taxableSocial: true,
  defaultPercent: null,
  category: null,
  ...overrides,
});

const payrollLine = (overrides: Record<string, any>) => ({
  quantity: null,
  rate: null,
  baseAmount: null,
  amount: '0',
  ...overrides,
});

test('nómina: bases, retención y cotizaciones', async () => {
  const concepts = [
    concept({ id: 'sb', code: 'SB', name: 'Salario base', kind: 'devengo' }),
    concept({
      id: 'plus',
      code: 'PLUS_TRANSP',
      name: 'Plus transporte',
      kind: 'devengo',
      taxableIncomeTax: false,
      taxableSocial: false,
    }),
    concept({
      id: 'dietas',
      code: 'DIETAS_X',
      name: 'Dieta sujeta solo a renta',
      kind: 'devengo',
      taxableSocial: false,
    }),
    concept({
      id: 'irpf',
      code: 'IRPF',
      name: 'Retención IRPF',
      kind: 'deduccion',
      calculation: 'percent_of_base',
      category: 'income_tax',
    }),
    concept({
      id: 'ss',
      code: 'SS_EMP',
      name: 'Seguridad Social Empleado',
      kind: 'deduccion',
      calculation: 'percent_of_base',
      category: 'social_employee',
    }),
    concept({
      id: 'antic',
      code: 'ANTICIPO',
      name: 'Anticipo',
      kind: 'deduccion',
    }),
    concept({
      id: 'sse',
      code: 'SS_EMPRESA',
      name: 'Seguridad Social Empresa',
      kind: 'aportacion_empresa',
      calculation: 'percent_of_base',
      category: 'social_employer',
    }),
  ];
  const lines = [
    payrollLine({ id: '1', conceptId: 'sb', type: 'earning', amount: '2000.00' }),
    payrollLine({ id: '2', conceptId: 'plus', type: 'earning', amount: '100.00' }),
    payrollLine({ id: '3', conceptId: 'dietas', type: 'earning', amount: '200.00' }),
    payrollLine({ id: '4', conceptId: 'irpf', type: 'deduction', rate: '15' }),
    payrollLine({ id: '5', conceptId: 'ss', type: 'deduction', rate: '6.35' }),
    payrollLine({ id: '6', conceptId: 'antic', type: 'deduction', amount: '50.00' }),
    payrollLine({ id: '7', conceptId: 'sse', type: 'employer_cost', rate: '29.9' }),
  ];
  const client = fakePayrollClient(lines, concepts);
  await recalcPayroll(client, 'n1');

  // Base renta = 2000 + 200; base social = 2000. El plus exento no entra en ninguna.
  assert.equal(lines[3].baseAmount, '2200.00');
  assert.equal(lines[3].amount, '330.00');
  assert.equal(lines[4].baseAmount, '2000.00');
  assert.equal(lines[4].amount, '127.00');
  assert.equal(lines[6].baseAmount, '2000.00');
  assert.equal(lines[6].amount, '598.00');

  const totals = client.payrollUpdates.at(-1);
  assert.equal(totals.gross, '2300.00');
  assert.equal(totals.netPay, '1793.00');
  assert.equal(totals.incomeTaxTotal, '330.00');
  assert.equal(totals.socialEmployeeTotal, '127.00');
  assert.equal(totals.socialEmployerTotal, '598.00');
  // Durante la transición, las columnas anteriores llevan lo mismo.
  assert.equal(totals.irpfAmount, '330.00');
  assert.equal(totals.ssEmployee, '127.00');
  assert.equal(totals.ssEmployer, '598.00');
});
