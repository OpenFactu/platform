/**
 * Demuestra que el núcleo no conoce ningún país: un paquete inventado, con un
 * impuesto compuesto y un plan contable sin nada en común con el español,
 * funciona solo con los puntos de extensión públicos. El paquete solo existe
 * aquí; no representa la normativa de nadie.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentEngine } from '../../documents/DocumentEngine';
import { JournalEngine } from '../../accounting/JournalEngine';
import { TaxEngine } from '../../tax/TaxEngine';
import { TaxIdValidators } from '../../geo/TaxIdValidators';
import { PayrollCalculators, computeStandardPayroll } from '../../hr/payrollCalculation';
import { TenantPluginCache } from '../../plugins/TenantPluginCache';
import { unregisterPluginContributions } from '../../plugins/TenantScopedRegistry';
import { parseLocalizationPack } from '../packSchema';
import { LocalizationRegistry } from '../LocalizationRegistry';
import { packMatchesCompany } from '../bootstrap';

const engine = DocumentEngine as any;
const PLUGIN = 'test-ruritania';
const TENANT = 'tenant-ruritania';

const PACK = {
  id: 'ruritania',
  name: 'Ruritania',
  version: '3.1.0',
  countries: ['RU'],
  terminology: {
    es: { tax: 'GST', taxId: 'BN' },
    en: { tax: 'GST', taxId: 'Business number' },
  },
  taxes: [{ code: 'GST5', rate: 5, category: 'gst' }],
  accounts: [
    { code: '2100', name: 'Federal tax payable', type: 'liability' as const },
    { code: '2200', name: 'Provincial tax payable', type: 'liability' as const },
  ],
  accountMappings: [
    { kind: 'tax_output', code: '2100' },
    { kind: 'tax_provincial_output', code: '2200' },
  ],
  legalTexts: [{ docTypes: ['SINV'], text: 'Registered for GST.' }],
};

afterEach(() => {
  unregisterPluginContributions(PLUGIN);
  TenantPluginCache.invalidate(TENANT);
});

function activate(t: any, active = true) {
  t.mock.method(TenantPluginCache, 'isActive', (tenantId: string, pluginId: string) => {
    return active && tenantId === TENANT && pluginId === PLUGIN;
  });
}

test('un paquete de datos se valida y trae sus términos y textos legales', (t) => {
  activate(t);
  LocalizationRegistry.register(PLUGIN, PACK);
  assert.equal(LocalizationRegistry.terminologyFor(TENANT, 'es').tax, 'GST');
  assert.equal(LocalizationRegistry.terminologyFor(TENANT, 'en').taxId, 'Business number');
  // Lo que el paquete no define sigue siendo genérico.
  assert.equal(LocalizationRegistry.terminologyFor(TENANT, 'es').withholding, 'Retención');
  assert.deepEqual(LocalizationRegistry.legalTextsFor(TENANT, 'SINV'), ['Registered for GST.']);
  assert.deepEqual(LocalizationRegistry.legalTextsFor(TENANT, 'SO'), []);
});

test('sin el plugin activo en la empresa, nada de su normativa se aplica', (t) => {
  activate(t, false);
  LocalizationRegistry.register(PLUGIN, PACK);
  assert.equal(LocalizationRegistry.terminologyFor(TENANT, 'es').tax, 'Impuesto');
  assert.equal(LocalizationRegistry.terminologyFor('otra', 'es').taxId, 'Identificación fiscal');
  assert.deepEqual(LocalizationRegistry.activeFor(TENANT), []);
});

test('un paquete inválido se rechaza con todos sus errores', () => {
  assert.throws(
    () => parseLocalizationPack({ ...PACK, countries: ['Ruritania'], taxes: [{ code: 'X' }] }),
    /countries[\s\S]*taxes/,
  );
  assert.throws(
    () => parseLocalizationPack({ ...PACK, accountMappings: [{ kind: 'x', code: '9999' }] }),
    /9999/,
  );
});

test('dos plugins no pueden registrar el mismo paquete', () => {
  LocalizationRegistry.register(PLUGIN, PACK);
  assert.throws(() => LocalizationRegistry.register('otro-plugin', PACK), /ya lo registró/);
});

test('adopción: por país o por códigos de impuesto que ya usaba la empresa', () => {
  const pack = parseLocalizationPack({ ...PACK, adoption: { taxCodePrefixes: ['GST'] } });
  assert.equal(packMatchesCompany(pack, 'RU', []), true);
  assert.equal(packMatchesCompany(pack, 'FR', ['GST5']), true);
  assert.equal(packMatchesCompany(pack, 'FR', ['VAT20']), false);
  assert.equal(packMatchesCompany(pack, null, []), false);
});

test('impuesto compuesto: la línea suma ambos y el resto del cálculo no cambia', () => {
  const line = { quantity: 2, price: 50, taxGroupId: 'x', discountRate: 10 };
  const a = engine.computeLineAmounts(line, {}, [
    { code: 'GST5', rate: 5 },
    { code: 'PST7', rate: 7, accountKind: 'tax_provincial_output' },
  ]);
  assert.equal(a.neto, 90);
  assert.equal(Number(a.taxAmount.toFixed(4)), 10.8);
  assert.equal(a.taxRate, 12);
  assert.equal(a.withholding, 0);
});

test('un impuesto con importe y base propios y una retención como componentes', () => {
  const line = { quantity: 1, price: 100, taxGroupId: 'x' };
  const a = engine.computeLineAmounts(line, {}, [
    { code: 'ECO', rate: 0, amount: 3 },
    { code: 'GST5', rate: 5, base: 103 },
    { code: 'WH', rate: 10, isWithholding: true },
  ]);
  assert.equal(Number(a.taxAmount.toFixed(4)), 8.15);
  assert.equal(a.withholding, 10);
});

test('las retenciones de línea y de cabecera siguen ganando sobre los componentes', () => {
  const line = { quantity: 1, price: 100, taxGroupId: 'x', withholdingRate: 15 };
  const a = engine.computeLineAmounts(line, {}, [{ code: 'WH', rate: 10, isWithholding: true }]);
  assert.equal(a.withholding, 15);
  const totals = engine.computePreliminaryTotals(
    { withholdingRate: 20, lines: [{ ...line, withholdingRate: 0 }] },
    {},
    [[{ code: 'WH', rate: 10, isWithholding: true }]],
  );
  assert.equal(totals.docWithholding, 20);
});

test('resolver: solo interviene en empresas con el plugin activo', async (t) => {
  activate(t);
  TaxEngine.registerResolver(PLUGIN, ({ line }) =>
    line.itemId === 'exento' ? null : [{ code: 'GST5', rate: 5 }],
  );
  const empty = { select: () => ({ from: () => ({ where: async () => [] }) }) } as any;
  empty.select = () => ({
    from: () => {
      const rows: any = Promise.resolve([]);
      rows.where = async () => [];
      return rows;
    },
  });
  const request = { partnerId: 'p', lines: [{ itemId: 'a' }, { itemId: 'exento' }] };

  const taxes = await TaxEngine.resolveDocument(empty, TENANT, 'sales', 'salesInvoices', request);
  assert.deepEqual(taxes, [[{ code: 'GST5', rate: 5 }], null]);

  const none = await TaxEngine.resolveDocument(empty, 'otra', 'sales', 'salesInvoices', request);
  assert.equal(none, null);
});

test('asiento con varios impuestos: una línea por cuenta y cuadra', async (t) => {
  const accounts: Record<string, string> = {
    customer_receivable: '1100',
    sales_revenue: '4000',
    tax_output: '2100',
    tax_provincial_output: '2200',
  };
  t.mock.method(JournalEngine, 'resolveAccount', async (_db: any, kind: string, key?: string) =>
    key ? null : (accounts[kind] ?? null),
  );
  const captured: any[] = [];
  t.mock.method(JournalEngine, 'create', async (_db: any, input: any) => {
    JournalEngine.validate(input);
    captured.push(input);
    return { id: 'je' };
  });
  t.mock.method(TaxEngine, 'loadDocumentTaxes', async () => [
    { accountKind: 'tax_output', isWithholding: false, amount: '5.0000' },
    { accountKind: 'tax_provincial_output', isWithholding: false, amount: '7.0000' },
  ]);
  await JournalEngine.createFromSalesInvoice(
    {},
    {
      id: 'f',
      docNum: 1,
      date: new Date(),
      periodId: 'p',
      partnerId: 'bp',
      subtotal: '100',
      taxTotal: '12',
      total: '112',
    },
    [],
  );
  assert.deepEqual(
    captured[0].lines.map((l: any) => [l.accountId, Number(l.debit), Number(l.credit)]),
    [
      ['1100', 112, 0],
      ['4000', 0, 100],
      ['2100', 0, 5],
      ['2200', 0, 7],
    ],
  );
});

test('validador de identificación fiscal por país y empresa', (t) => {
  activate(t);
  TaxIdValidators.register(PLUGIN, 'ru', (value) =>
    value.startsWith('RU') ? null : 'Debe empezar por RU',
  );
  assert.equal(TaxIdValidators.check(TENANT, 'RU', 'RU123'), null);
  assert.equal(TaxIdValidators.check(TENANT, 'RU', '123'), 'Debe empezar por RU');
  assert.equal(TaxIdValidators.check(TENANT, 'FR', '123'), null);
  assert.equal(TaxIdValidators.check('otra', 'RU', '123'), null);
});

test('nómina: el cálculo estándar trabaja por categoría, no por nombre', () => {
  const concepts = [
    { id: 's', kind: 'devengo', calculation: 'fixed' },
    { id: 'i', kind: 'deduccion', calculation: 'percent_of_base', category: 'income_tax' },
    { id: 'c', kind: 'deduccion', calculation: 'percent_of_base', category: 'social_employee' },
  ];
  const lines = [
    { id: '1', conceptId: 's', type: 'earning', amount: '1000' },
    { id: '2', conceptId: 'i', type: 'deduction', rate: '10', amount: '0' },
    { id: '3', conceptId: 'c', type: 'deduction', rate: '5', amount: '0' },
  ];
  const { totals, lineUpdates } = computeStandardPayroll(lines, concepts);
  assert.equal(totals.incomeTax, 100);
  assert.equal(totals.socialEmployee, 50);
  assert.equal(totals.netPay, 850);
  assert.equal(lineUpdates.length, 2);
});

test('nómina: un concepto sin categoría es una deducción más', () => {
  const concepts = [
    { id: 's', kind: 'devengo', calculation: 'fixed' },
    { id: 'x', code: 'IRPF', name: 'Retención IRPF', kind: 'deduccion', calculation: 'fixed' },
  ];
  const lines = [
    { id: '1', conceptId: 's', type: 'earning', amount: '1000' },
    { id: '2', conceptId: 'x', type: 'deduction', amount: '100' },
  ];
  const { totals } = computeStandardPayroll(lines, concepts);
  assert.equal(totals.incomeTax, 0);
  assert.equal(totals.otherDeductions, 100);
  assert.equal(totals.netPay, 900);
});

test('nómina: un calculador de plugin solo cuenta en su empresa', (t) => {
  activate(t);
  PayrollCalculators.register(PLUGIN, () => null);
  assert.equal(PayrollCalculators.activeFor(TENANT).length, 1);
  assert.equal(PayrollCalculators.activeFor('otra').length, 0);
});
