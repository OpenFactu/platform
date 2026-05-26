/**
 * Endpoints de informes. Cada informe tiene dos rutas:
 *   GET /api/reports/<informe>        → JSON con columnas + filas (UI lo pinta).
 *   GET /api/reports/<informe>/pdf    → PDF streaming.
 *
 * Todos los informes contables cuelgan aquí. Gestión, RRHH y stock se
 * añadirán según ola.
 */
import { Router } from 'express';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import {
  renderReportPdf,
  getCompanyHeader,
  type ReportSection,
} from '../core/reports/ReportRenderer';

const router = Router();

function formatPeriodRange(p: any): string {
  if (!p) return '';
  const s = new Date(p.startDate).toLocaleDateString('es-ES');
  const e = new Date(p.endDate).toLocaleDateString('es-ES');
  return `${p.name} (${s} – ${e})`;
}

// ─────────────────────────────────────────────────────────────────
// 1) DIARIO DE ASIENTOS
// ─────────────────────────────────────────────────────────────────

async function queryJournal(
  tenantClient: any,
  filters: { periodId?: string; from?: Date; to?: Date },
) {
  const conds: any[] = [eq(schema.journalEntries.status, 'posted')];
  if (filters.periodId) conds.push(eq(schema.journalEntries.periodId, filters.periodId));
  if (filters.from) conds.push(gte(schema.journalEntries.date, filters.from));
  if (filters.to) conds.push(lte(schema.journalEntries.date, filters.to));

  const rows = await tenantClient
    .select({
      entryId: schema.journalEntries.id,
      number: schema.journalEntries.number,
      date: schema.journalEntries.date,
      description: schema.journalEntries.description,
      source: schema.journalEntries.source,
      lineNumber: schema.journalEntryLines.lineNumber,
      accountCode: schema.chartOfAccounts.code,
      accountName: schema.chartOfAccounts.name,
      debit: schema.journalEntryLines.debit,
      credit: schema.journalEntryLines.credit,
      lineDesc: schema.journalEntryLines.description,
    })
    .from(schema.journalEntries)
    .innerJoin(
      schema.journalEntryLines,
      eq(schema.journalEntryLines.entryId, schema.journalEntries.id),
    )
    .innerJoin(
      schema.chartOfAccounts,
      eq(schema.journalEntryLines.accountId, schema.chartOfAccounts.id),
    )
    .where(and(...conds))
    .orderBy(
      asc(schema.journalEntries.date),
      asc(schema.journalEntries.number),
      asc(schema.journalEntryLines.lineNumber),
    );
  return rows;
}

router.get('/journal', async (req: any, res) => {
  try {
    const rows = await queryJournal(req.tenantClient, {
      periodId: req.query.periodId,
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/journal/pdf', async (req: any, res) => {
  try {
    const rows = await queryJournal(req.tenantClient, {
      periodId: req.query.periodId,
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
    });
    const period = req.query.periodId
      ? (
          await req.tenantClient
            .select()
            .from(schema.accountingPeriods)
            .where(eq(schema.accountingPeriods.id, req.query.periodId))
        )[0]
      : null;

    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.debit += Number(r.debit);
        acc.credit += Number(r.credit);
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    const company = await getCompanyHeader(req.tenantClient);
    const pdf = await renderReportPdf({
      title: 'Diario de asientos',
      subtitle: period ? formatPeriodRange(period) : undefined,
      filters: period ? [{ label: 'Período', value: period.code }] : [],
      orientation: 'landscape',
      sections: [
        {
          columns: [
            { key: 'number', label: 'Nº', format: 'integer', width: '5%' },
            { key: 'date', label: 'Fecha', format: 'date', width: '10%' },
            { key: 'lineNumber', label: '#', format: 'integer', width: '3%' },
            { key: 'accountCode', label: 'Cuenta', width: '10%' },
            { key: 'accountName', label: 'Denominación' },
            { key: 'lineDesc', label: 'Descripción', width: '25%' },
            { key: 'debit', label: 'Debe', format: 'money', align: 'right', width: '12%' },
            { key: 'credit', label: 'Haber', format: 'money', align: 'right', width: '12%' },
          ],
          rows,
          totals: {
            label: 'TOTAL',
            values: { debit: totals.debit, credit: totals.credit },
          },
        },
      ],
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="diario.pdf"');
    res.send(pdf);
  } catch (e: any) {
    console.error('[reports/journal/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 2) LIBRO MAYOR (una cuenta, con saldo corriente)
// ─────────────────────────────────────────────────────────────────

async function queryLedger(
  tenantClient: any,
  filters: { accountId: string; periodId?: string; from?: Date; to?: Date },
) {
  const conds: any[] = [
    eq(schema.journalEntries.status, 'posted'),
    eq(schema.journalEntryLines.accountId, filters.accountId),
  ];
  if (filters.periodId) conds.push(eq(schema.journalEntries.periodId, filters.periodId));
  if (filters.from) conds.push(gte(schema.journalEntries.date, filters.from));
  if (filters.to) conds.push(lte(schema.journalEntries.date, filters.to));

  const rows = await tenantClient
    .select({
      entryNumber: schema.journalEntries.number,
      date: schema.journalEntries.date,
      description: schema.journalEntries.description,
      lineDesc: schema.journalEntryLines.description,
      debit: schema.journalEntryLines.debit,
      credit: schema.journalEntryLines.credit,
    })
    .from(schema.journalEntryLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalEntryLines.entryId, schema.journalEntries.id),
    )
    .where(and(...conds))
    .orderBy(asc(schema.journalEntries.date), asc(schema.journalEntries.number));

  let running = 0;
  return rows.map((r: any) => {
    running += Number(r.debit) - Number(r.credit);
    return { ...r, balance: running };
  });
}

router.get('/ledger', async (req: any, res) => {
  try {
    if (!req.query.accountId) return res.status(400).json({ error: 'accountId obligatorio' });
    const rows = await queryLedger(req.tenantClient, {
      accountId: req.query.accountId,
      periodId: req.query.periodId,
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
    });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/ledger/pdf', async (req: any, res) => {
  try {
    if (!req.query.accountId) return res.status(400).json({ error: 'accountId obligatorio' });
    const [account] = await req.tenantClient
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.id, req.query.accountId));
    if (!account) return res.status(404).json({ error: 'Cuenta no existe' });

    const rows = await queryLedger(req.tenantClient, {
      accountId: req.query.accountId,
      periodId: req.query.periodId,
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
    });

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.debit), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.credit), 0);
    const company = await getCompanyHeader(req.tenantClient);
    const pdf = await renderReportPdf({
      title: `Libro mayor`,
      subtitle: `${account.code} · ${account.name}`,
      filters: [{ label: 'Cuenta', value: `${account.code} ${account.name}` }],
      sections: [
        {
          columns: [
            { key: 'date', label: 'Fecha', format: 'date', width: '14%' },
            { key: 'entryNumber', label: 'Asiento', format: 'integer', width: '10%' },
            { key: 'description', label: 'Concepto', width: '36%' },
            { key: 'debit', label: 'Debe', format: 'money', align: 'right', width: '13%' },
            { key: 'credit', label: 'Haber', format: 'money', align: 'right', width: '13%' },
            { key: 'balance', label: 'Saldo', format: 'money', align: 'right', width: '14%' },
          ],
          rows,
          totals: {
            label: 'TOTALES',
            values: {
              debit: totalDebit,
              credit: totalCredit,
              balance: totalDebit - totalCredit,
            },
          },
        },
      ],
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e: any) {
    console.error('[reports/ledger/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 3) BALANCE DE SUMAS Y SALDOS
// ─────────────────────────────────────────────────────────────────

async function queryTrialBalance(tenantClient: any, periodId: string) {
  const rows = await tenantClient
    .select({
      code: schema.chartOfAccounts.code,
      name: schema.chartOfAccounts.name,
      type: schema.chartOfAccounts.type,
      debit: sql<string>`COALESCE(SUM(${schema.journalEntryLines.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${schema.journalEntryLines.credit}), 0)`,
    })
    .from(schema.journalEntryLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalEntryLines.entryId, schema.journalEntries.id),
    )
    .innerJoin(
      schema.chartOfAccounts,
      eq(schema.journalEntryLines.accountId, schema.chartOfAccounts.id),
    )
    .where(
      and(eq(schema.journalEntries.periodId, periodId), eq(schema.journalEntries.status, 'posted')),
    )
    .groupBy(schema.chartOfAccounts.code, schema.chartOfAccounts.name, schema.chartOfAccounts.type)
    .orderBy(asc(schema.chartOfAccounts.code));

  return rows.map((r: any) => ({
    ...r,
    debit: Number(r.debit),
    credit: Number(r.credit),
    balance: Number(r.debit) - Number(r.credit),
  }));
}

router.get('/trial-balance', async (req: any, res) => {
  try {
    if (!req.query.periodId) return res.status(400).json({ error: 'periodId obligatorio' });
    res.json(await queryTrialBalance(req.tenantClient, req.query.periodId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/trial-balance/pdf', async (req: any, res) => {
  try {
    if (!req.query.periodId) return res.status(400).json({ error: 'periodId obligatorio' });
    const [period] = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, req.query.periodId));
    const rows = await queryTrialBalance(req.tenantClient, req.query.periodId);
    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.debit += r.debit;
        acc.credit += r.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );
    const company = await getCompanyHeader(req.tenantClient);
    const pdf = await renderReportPdf({
      title: 'Balance de sumas y saldos',
      subtitle: period ? formatPeriodRange(period) : undefined,
      sections: [
        {
          columns: [
            { key: 'code', label: 'Cuenta', width: '12%' },
            { key: 'name', label: 'Denominación' },
            { key: 'debit', label: 'Debe', format: 'money', align: 'right', width: '15%' },
            { key: 'credit', label: 'Haber', format: 'money', align: 'right', width: '15%' },
            { key: 'balance', label: 'Saldo', format: 'money', align: 'right', width: '15%' },
          ],
          rows,
          totals: {
            label: 'TOTALES',
            values: {
              debit: totals.debit,
              credit: totals.credit,
              balance: totals.debit - totals.credit,
            },
          },
        },
      ],
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e: any) {
    console.error('[reports/trial-balance/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 4) CUENTA DE PÉRDIDAS Y GANANCIAS (P&L)
// ─────────────────────────────────────────────────────────────────

async function queryPL(tenantClient: any, periodId: string) {
  const tb = await queryTrialBalance(tenantClient, periodId);
  const income = tb.filter((r: any) => r.type === 'income');
  const expense = tb.filter((r: any) => r.type === 'expense');
  // Ingresos: saldo acreedor (credit - debit positivo).
  const incomeRows = income.map((r: any) => ({
    code: r.code,
    name: r.name,
    amount: r.credit - r.debit,
  }));
  const expenseRows = expense.map((r: any) => ({
    code: r.code,
    name: r.name,
    amount: r.debit - r.credit,
  }));
  const totalIncome = incomeRows.reduce((s: number, r: any) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s: number, r: any) => s + r.amount, 0);
  return {
    incomeRows,
    expenseRows,
    totalIncome,
    totalExpense,
    result: totalIncome - totalExpense,
  };
}

router.get('/pl', async (req: any, res) => {
  try {
    if (!req.query.periodId) return res.status(400).json({ error: 'periodId obligatorio' });
    res.json(await queryPL(req.tenantClient, req.query.periodId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pl/pdf', async (req: any, res) => {
  try {
    if (!req.query.periodId) return res.status(400).json({ error: 'periodId obligatorio' });
    const [period] = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, req.query.periodId));
    const pl = await queryPL(req.tenantClient, req.query.periodId);
    const company = await getCompanyHeader(req.tenantClient);
    const sections: ReportSection[] = [
      {
        title: 'Ingresos (grupo 7)',
        columns: [
          { key: 'code', label: 'Cuenta', width: '15%' },
          { key: 'name', label: 'Denominación' },
          { key: 'amount', label: 'Importe', format: 'money', align: 'right', width: '20%' },
        ],
        rows: pl.incomeRows,
        totals: {
          label: 'TOTAL INGRESOS',
          values: { amount: pl.totalIncome },
        },
      },
      {
        title: 'Gastos (grupo 6)',
        columns: [
          { key: 'code', label: 'Cuenta', width: '15%' },
          { key: 'name', label: 'Denominación' },
          { key: 'amount', label: 'Importe', format: 'money', align: 'right', width: '20%' },
        ],
        rows: pl.expenseRows,
        totals: {
          label: 'TOTAL GASTOS',
          values: { amount: pl.totalExpense },
        },
      },
      {
        title: pl.result >= 0 ? 'Beneficio del ejercicio' : 'Pérdida del ejercicio',
        columns: [
          { key: 'label', label: '', width: '80%' },
          { key: 'amount', label: 'Resultado', format: 'money', align: 'right', width: '20%' },
        ],
        rows: [{ label: 'Ingresos − Gastos', amount: pl.result }],
      },
    ];
    const pdf = await renderReportPdf({
      title: 'Cuenta de Pérdidas y Ganancias',
      subtitle: period ? formatPeriodRange(period) : undefined,
      sections,
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e: any) {
    console.error('[reports/pl/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 5) BALANCE DE SITUACIÓN
// ─────────────────────────────────────────────────────────────────

async function queryBalanceSheet(tenantClient: any, periodId: string) {
  const tb = await queryTrialBalance(tenantClient, periodId);
  const asset = tb
    .filter((r: any) => r.type === 'asset')
    .map((r: any) => ({ code: r.code, name: r.name, amount: r.debit - r.credit }));
  const liability = tb
    .filter((r: any) => r.type === 'liability')
    .map((r: any) => ({ code: r.code, name: r.name, amount: r.credit - r.debit }));
  const equity = tb
    .filter((r: any) => r.type === 'equity')
    .map((r: any) => ({ code: r.code, name: r.name, amount: r.credit - r.debit }));
  return {
    asset,
    liability,
    equity,
    totalAsset: asset.reduce((s: number, r: any) => s + r.amount, 0),
    totalLiability: liability.reduce((s: number, r: any) => s + r.amount, 0),
    totalEquity: equity.reduce((s: number, r: any) => s + r.amount, 0),
  };
}

router.get('/balance-sheet', async (req: any, res) => {
  try {
    if (!req.query.periodId) return res.status(400).json({ error: 'periodId obligatorio' });
    res.json(await queryBalanceSheet(req.tenantClient, req.query.periodId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/balance-sheet/pdf', async (req: any, res) => {
  try {
    if (!req.query.periodId) return res.status(400).json({ error: 'periodId obligatorio' });
    const [period] = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, req.query.periodId));
    const bs = await queryBalanceSheet(req.tenantClient, req.query.periodId);
    const company = await getCompanyHeader(req.tenantClient);
    const col = (label: string) => [
      { key: 'code', label: 'Cuenta', width: '15%' },
      { key: 'name', label: 'Denominación' },
      { key: 'amount', label, format: 'money' as const, align: 'right' as const, width: '20%' },
    ];
    const pdf = await renderReportPdf({
      title: 'Balance de Situación',
      subtitle: period ? formatPeriodRange(period) : undefined,
      sections: [
        {
          title: 'Activo',
          columns: col('Importe'),
          rows: bs.asset,
          totals: { label: 'TOTAL ACTIVO', values: { amount: bs.totalAsset } },
        },
        {
          title: 'Pasivo',
          columns: col('Importe'),
          rows: bs.liability,
          totals: { label: 'TOTAL PASIVO', values: { amount: bs.totalLiability } },
        },
        {
          title: 'Patrimonio Neto',
          columns: col('Importe'),
          rows: bs.equity,
          totals: { label: 'TOTAL PATRIMONIO', values: { amount: bs.totalEquity } },
        },
      ],
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e: any) {
    console.error('[reports/balance-sheet/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 6) LIBRO DE IVA (modelo 303)
// ─────────────────────────────────────────────────────────────────

async function queryVat(
  tenantClient: any,
  filters: { from?: Date; to?: Date; kind: 'output' | 'input' },
) {
  const table = filters.kind === 'output' ? schema.salesInvoices : schema.purchaseInvoices;
  const conds: any[] = [eq(table.status, 'O')];
  if (filters.from) conds.push(gte(table.date, filters.from));
  if (filters.to) conds.push(lte(table.date, filters.to));
  const rows = await tenantClient
    .select({
      id: table.id,
      docNum: table.docNum,
      date: table.date,
      partnerId: table.partnerId,
      partnerName: schema.businessPartners.name,
      partnerNif: schema.businessPartners.nif,
      subtotal: table.subtotal,
      taxTotal: table.taxTotal,
      total: table.total,
      prefix: schema.documentSeries.prefix,
      periodCode: schema.accountingPeriods.code,
    })
    .from(table)
    .leftJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
    .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
    .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
    .where(and(...conds))
    .orderBy(asc(table.date));
  return rows.map((r: any) => ({
    date: r.date,
    code: `${r.prefix || ''}-${r.periodCode || ''}-${String(r.docNum).padStart(6, '0')}`,
    partnerNif: r.partnerNif || '',
    partnerName: r.partnerName || '',
    base: Number(r.subtotal),
    tax: Number(r.taxTotal),
    total: Number(r.total),
  }));
}

router.get('/vat', async (req: any, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : undefined;
    const to = req.query.to ? new Date(req.query.to) : undefined;
    const [output, input] = await Promise.all([
      queryVat(req.tenantClient, { from, to, kind: 'output' }),
      queryVat(req.tenantClient, { from, to, kind: 'input' }),
    ]);
    res.json({ output, input });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/vat/pdf', async (req: any, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : undefined;
    const to = req.query.to ? new Date(req.query.to) : undefined;
    const [output, input] = await Promise.all([
      queryVat(req.tenantClient, { from, to, kind: 'output' }),
      queryVat(req.tenantClient, { from, to, kind: 'input' }),
    ]);
    const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);
    const company = await getCompanyHeader(req.tenantClient);
    const filters: Array<{ label: string; value: string }> = [];
    if (from) filters.push({ label: 'Desde', value: from.toLocaleDateString('es-ES') });
    if (to) filters.push({ label: 'Hasta', value: to.toLocaleDateString('es-ES') });
    const cols = [
      { key: 'date', label: 'Fecha', format: 'date' as const, width: '10%' },
      { key: 'code', label: 'Nº Factura', width: '14%' },
      { key: 'partnerNif', label: 'NIF', width: '12%' },
      { key: 'partnerName', label: 'Cliente/Proveedor' },
      {
        key: 'base',
        label: 'Base',
        format: 'money' as const,
        align: 'right' as const,
        width: '12%',
      },
      {
        key: 'tax',
        label: 'Cuota IVA',
        format: 'money' as const,
        align: 'right' as const,
        width: '12%',
      },
      {
        key: 'total',
        label: 'Total',
        format: 'money' as const,
        align: 'right' as const,
        width: '12%',
      },
    ];
    const pdf = await renderReportPdf({
      title: 'Libro de IVA',
      subtitle: 'IVA repercutido y soportado',
      filters,
      orientation: 'landscape',
      sections: [
        {
          title: 'IVA Repercutido (ventas)',
          columns: cols,
          rows: output,
          totals: {
            label: 'TOTAL REPERCUTIDO',
            values: {
              base: sum(output, 'base'),
              tax: sum(output, 'tax'),
              total: sum(output, 'total'),
            },
          },
        },
        {
          title: 'IVA Soportado (compras)',
          columns: cols,
          rows: input,
          totals: {
            label: 'TOTAL SOPORTADO',
            values: {
              base: sum(input, 'base'),
              tax: sum(input, 'tax'),
              total: sum(input, 'total'),
            },
          },
        },
        {
          title: 'Resultado',
          columns: [
            { key: 'label', label: '', width: '80%' },
            { key: 'amount', label: 'Importe', format: 'money', align: 'right', width: '20%' },
          ],
          rows: [
            { label: 'IVA Repercutido', amount: sum(output, 'tax') },
            { label: 'IVA Soportado', amount: -sum(input, 'tax') },
            { label: 'A ingresar / (a compensar)', amount: sum(output, 'tax') - sum(input, 'tax') },
          ],
        },
      ],
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e: any) {
    console.error('[reports/vat/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// OLA 3 — INFORMES DE GESTIÓN
// ═══════════════════════════════════════════════════════════════════

// 7. Rentabilidad por cliente
router.get('/profit-customer', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        id: schema.businessPartners.id,
        code: schema.businessPartners.code,
        name: schema.businessPartners.name,
        total: sql<string>`COALESCE(SUM(${schema.salesInvoices.subtotal}), 0)`,
        count: sql<string>`COUNT(DISTINCT ${schema.salesInvoices.id})`,
      })
      .from(schema.salesInvoices)
      .innerJoin(
        schema.businessPartners,
        eq(schema.salesInvoices.partnerId, schema.businessPartners.id),
      )
      .where(req.query.periodId ? eq(schema.salesInvoices.periodId, req.query.periodId) : sql`TRUE`)
      .groupBy(
        schema.businessPartners.id,
        schema.businessPartners.code,
        schema.businessPartners.name,
      )
      .orderBy(sql`COALESCE(SUM(${schema.salesInvoices.subtotal}), 0) DESC`)
      .limit(100);
    res.json(rows.map((r: any) => ({ ...r, total: Number(r.total), count: Number(r.count) })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Rentabilidad por producto
router.get('/profit-item', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        id: schema.items.id,
        code: schema.items.code,
        name: schema.items.name,
        qty: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.quantity}), 0)`,
        revenue: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.lineTotal}), 0)`,
      })
      .from(schema.salesInvoiceLines)
      .innerJoin(
        schema.salesInvoices,
        eq(schema.salesInvoiceLines.invoiceId, schema.salesInvoices.id),
      )
      .innerJoin(schema.items, eq(schema.salesInvoiceLines.itemId, schema.items.id))
      .where(req.query.periodId ? eq(schema.salesInvoices.periodId, req.query.periodId) : sql`TRUE`)
      .groupBy(schema.items.id, schema.items.code, schema.items.name)
      .orderBy(sql`COALESCE(SUM(${schema.salesInvoiceLines.lineTotal}), 0) DESC`)
      .limit(200);
    res.json(rows.map((r: any) => ({ ...r, qty: Number(r.qty), revenue: Number(r.revenue) })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 9. Rentabilidad por proyecto (orden interna)
router.get('/profit-project', async (req: any, res) => {
  try {
    const income = await req.tenantClient
      .select({
        internalOrderId: schema.salesInvoiceLines.internalOrderId,
        amount: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.lineTotal}), 0)`,
      })
      .from(schema.salesInvoiceLines)
      .where(sql`${schema.salesInvoiceLines.internalOrderId} IS NOT NULL`)
      .groupBy(schema.salesInvoiceLines.internalOrderId);
    const expense = await req.tenantClient
      .select({
        internalOrderId: schema.purchaseInvoiceLines.internalOrderId,
        amount: sql<string>`COALESCE(SUM(${schema.purchaseInvoiceLines.lineTotal}), 0)`,
      })
      .from(schema.purchaseInvoiceLines)
      .where(sql`${schema.purchaseInvoiceLines.internalOrderId} IS NOT NULL`)
      .groupBy(schema.purchaseInvoiceLines.internalOrderId);

    const projects = await req.tenantClient.select().from(schema.internalOrders);
    const incMap = new Map<string, number>(
      income.map((r: any) => [r.internalOrderId as string, Number(r.amount)]),
    );
    const expMap = new Map<string, number>(
      expense.map((r: any) => [r.internalOrderId as string, Number(r.amount)]),
    );
    const rows = projects.map((p: any) => {
      const ing = incMap.get(p.id) || 0;
      const gas = expMap.get(p.id) || 0;
      const budget = Number(p.budgetAmount || 0);
      return {
        code: p.code,
        name: p.name,
        budget,
        income: ing,
        expense: gas,
        margin: Number(ing) - Number(gas),
        deviation: budget > 0 ? ((Number(gas) - budget) / budget) * 100 : 0,
      };
    });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 10. Rentabilidad por centro de coste
router.get('/profit-cost-center', async (req: any, res) => {
  try {
    const income = await req.tenantClient
      .select({
        id: schema.salesInvoiceLines.costCenterId,
        amount: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.lineTotal}), 0)`,
      })
      .from(schema.salesInvoiceLines)
      .where(sql`${schema.salesInvoiceLines.costCenterId} IS NOT NULL`)
      .groupBy(schema.salesInvoiceLines.costCenterId);
    const expense = await req.tenantClient
      .select({
        id: schema.purchaseInvoiceLines.costCenterId,
        amount: sql<string>`COALESCE(SUM(${schema.purchaseInvoiceLines.lineTotal}), 0)`,
      })
      .from(schema.purchaseInvoiceLines)
      .where(sql`${schema.purchaseInvoiceLines.costCenterId} IS NOT NULL`)
      .groupBy(schema.purchaseInvoiceLines.costCenterId);
    const ccs = await req.tenantClient.select().from(schema.costCenters);
    const incMap = new Map<string, number>(
      income.map((r: any) => [r.id as string, Number(r.amount)]),
    );
    const expMap = new Map<string, number>(
      expense.map((r: any) => [r.id as string, Number(r.amount)]),
    );
    const rows = ccs.map((c: any) => {
      const ing = incMap.get(c.id) || 0;
      const gas = expMap.get(c.id) || 0;
      return {
        code: c.code,
        name: c.name,
        income: Number(ing),
        expense: Number(gas),
        margin: Number(ing) - Number(gas),
      };
    });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 11. Informe ejecutivo
router.get('/executive', async (req: any, res) => {
  try {
    const pid = req.query.periodId;
    if (!pid) return res.status(400).json({ error: 'periodId obligatorio' });
    const [period] = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, pid));
    const [si] = await req.tenantClient
      .select({
        total: sql<string>`COALESCE(SUM(${schema.salesInvoices.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(schema.salesInvoices)
      .where(eq(schema.salesInvoices.periodId, pid));
    const [pi] = await req.tenantClient
      .select({
        total: sql<string>`COALESCE(SUM(${schema.purchaseInvoices.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(schema.purchaseInvoices)
      .where(eq(schema.purchaseInvoices.periodId, pid));
    res.json({
      period,
      sales: { total: Number(si?.total || 0), count: Number(si?.count || 0) },
      purchases: { total: Number(pi?.total || 0), count: Number(pi?.count || 0) },
      margin: Number(si?.total || 0) - Number(pi?.total || 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 12-13. Aging cobros/pagos
async function queryAging(tenantClient: any, table: any) {
  const today = new Date();
  const rows = await tenantClient
    .select({
      id: table.id,
      docNum: table.docNum,
      date: table.date,
      dueDate: table.dueDate,
      total: table.total,
      amountPaid: table.amountPaid,
      partnerName: schema.businessPartners.name,
      prefix: schema.documentSeries.prefix,
      periodCode: schema.accountingPeriods.code,
    })
    .from(table)
    .leftJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
    .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
    .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
    .where(and(eq(table.status, 'O'), sql`${table.total} > COALESCE(${table.amountPaid}, 0)`));
  return rows.map((r: any) => {
    const pending = Number(r.total) - Number(r.amountPaid || 0);
    const due = r.dueDate ? new Date(r.dueDate) : new Date(r.date);
    const days = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
    let bucket = 'No vencido';
    if (days > 90) bucket = '+90';
    else if (days > 60) bucket = '61-90';
    else if (days > 30) bucket = '31-60';
    else if (days > 0) bucket = '0-30';
    return {
      code: `${r.prefix || ''}-${r.periodCode || ''}-${String(r.docNum).padStart(6, '0')}`,
      date: r.date,
      dueDate: r.dueDate,
      partnerName: r.partnerName || '',
      pending,
      days: days > 0 ? days : 0,
      bucket,
    };
  });
}

router.get('/aging-receivables', async (req: any, res) => {
  try {
    res.json(await queryAging(req.tenantClient, schema.salesInvoices));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/aging-payables', async (req: any, res) => {
  try {
    res.json(await queryAging(req.tenantClient, schema.purchaseInvoices));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 14. Cash-flow últimos N días
router.get('/cashflow', async (req: any, res) => {
  try {
    const days = Number(req.query.days || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const inflow = await req.tenantClient.execute(
      sql.raw(`
      SELECT to_char("date", 'YYYY-MM-DD') AS day, COALESCE(SUM("amount"::numeric), 0)::float AS total
      FROM "Payment"
      WHERE "salesInvoiceId" IS NOT NULL AND "date" >= '${since}'::date
      GROUP BY 1 ORDER BY 1
    `),
    );
    const outflow = await req.tenantClient.execute(
      sql.raw(`
      SELECT to_char("date", 'YYYY-MM-DD') AS day, COALESCE(SUM("amount"::numeric), 0)::float AS total
      FROM "Payment"
      WHERE "purchaseInvoiceId" IS NOT NULL AND "date" >= '${since}'::date
      GROUP BY 1 ORDER BY 1
    `),
    );
    const inRows: any[] = inflow.rows || inflow;
    const outRows: any[] = outflow.rows || outflow;
    const inMap = new Map(inRows.map((r: any) => [r.day, Number(r.total)]));
    const outMap = new Map(outRows.map((r: any) => [r.day, Number(r.total)]));
    const out: any[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      out.push({
        day: d,
        inflow: inMap.get(d) || 0,
        outflow: outMap.get(d) || 0,
        net: (inMap.get(d) || 0) - (outMap.get(d) || 0),
      });
    }
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// OLA 4 — INFORMES RRHH
// ═══════════════════════════════════════════════════════════════════

// 15. Recibo de nómina
router.get('/payslip/:payrollId/pdf', async (req: any, res) => {
  try {
    const [p] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.payrollId));
    if (!p) return res.status(404).json({ error: 'Nómina no encontrada' });
    const [emp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, p.employeeId));
    const months = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const company = await getCompanyHeader(req.tenantClient);
    const gross = Number(p.gross);
    const irpf = Number(p.irpfAmount);
    const ssE = Number(p.ssEmployee);
    const ssEr = Number(p.ssEmployer);
    const net = Number(p.netPay);

    // Líneas reales para mostrar el desglose completo (pluses, conceptos…).
    const lines: any[] = await req.tenantClient
      .select()
      .from(schema.payrollLines)
      .where(eq(schema.payrollLines.payrollId, p.id));
    const earnings = lines.filter((l) => l.type === 'earning');
    const deductions = lines.filter((l) => l.type === 'deduction');
    const employerCosts = lines.filter((l) => l.type === 'employer_cost');

    const moneyCols: any[] = [
      { key: 'label', label: 'Concepto', width: '50%' },
      { key: 'qty', label: 'Cant.', align: 'right', width: '10%' },
      { key: 'rate', label: '€/%', align: 'right', width: '15%' },
      { key: 'amount', label: 'Importe', format: 'money', align: 'right', width: '25%' },
    ];

    const earningRows = earnings.length
      ? earnings.map((l) => ({
          label: l.concept,
          qty: l.quantity ? Number(l.quantity).toFixed(2) : '',
          rate: l.rate ? Number(l.rate).toFixed(2) : '',
          amount: Number(l.amount || 0),
        }))
      : [{ label: 'Salario bruto', qty: '', rate: '', amount: gross }];

    const deductionRows = deductions.length
      ? deductions.map((l) => ({
          label: l.concept,
          qty: l.quantity ? Number(l.quantity).toFixed(2) : '',
          rate: l.rate ? Number(l.rate).toFixed(2) + ' %' : '',
          amount: -Number(l.amount || 0),
        }))
      : [
          { label: 'Retención IRPF', qty: '', rate: '', amount: -irpf },
          { label: 'Seguridad Social trabajador', qty: '', rate: '', amount: -ssE },
        ];

    const employerRows = employerCosts.length
      ? employerCosts.map((l) => ({
          label: l.concept,
          qty: l.quantity ? Number(l.quantity).toFixed(2) : '',
          rate: l.rate ? Number(l.rate).toFixed(2) + ' %' : '',
          amount: Number(l.amount || 0),
        }))
      : [{ label: 'Seguridad Social a cargo de la empresa', qty: '', rate: '', amount: ssEr }];

    const totalDeductions = deductionRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalEmployer = employerRows.reduce((s, r) => s + Number(r.amount || 0), 0);

    const pdf = await renderReportPdf({
      title: `Recibo de nómina — ${months[p.periodMonth - 1]} ${p.periodYear}`,
      subtitle: emp ? `${emp.firstName} ${emp.lastName} (${emp.code})` : '',
      sections: [
        {
          title: 'Devengos',
          columns: moneyCols,
          rows: earningRows,
          totals: { label: 'TOTAL DEVENGOS', values: { amount: gross } },
        },
        {
          title: 'Deducciones',
          columns: moneyCols,
          rows: deductionRows,
          totals: { label: 'TOTAL DEDUCCIONES', values: { amount: totalDeductions } },
        },
        {
          title: 'Coste empresa',
          columns: moneyCols,
          rows: employerRows,
          totals: { label: 'TOTAL COSTE EMPRESA', values: { amount: totalEmployer } },
        },
        {
          title: 'Líquido a percibir',
          columns: [
            { key: 'label', label: '', width: '70%' },
            { key: 'amount', label: 'Neto', format: 'money', align: 'right', width: '30%' },
          ],
          rows: [{ label: 'Transferencia al trabajador', amount: net }],
        },
      ],
      ...company,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e: any) {
    console.error('[payslip]', e);
    res.status(500).json({ error: e.message });
  }
});

// 16. Costes laborales
router.get('/labor-cost', async (req: any, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const rows = await req.tenantClient
      .select({
        month: schema.payrolls.periodMonth,
        gross: sql<string>`COALESCE(SUM(${schema.payrolls.gross}), 0)`,
        ssEmployer: sql<string>`COALESCE(SUM(${schema.payrolls.ssEmployer}), 0)`,
        irpf: sql<string>`COALESCE(SUM(${schema.payrolls.irpfAmount}), 0)`,
        netPay: sql<string>`COALESCE(SUM(${schema.payrolls.netPay}), 0)`,
      })
      .from(schema.payrolls)
      .where(and(eq(schema.payrolls.periodYear, year), eq(schema.payrolls.status, 'approved')))
      .groupBy(schema.payrolls.periodMonth)
      .orderBy(asc(schema.payrolls.periodMonth));
    res.json(
      rows.map((r: any) => ({
        month: r.month,
        gross: Number(r.gross),
        ssEmployer: Number(r.ssEmployer),
        irpf: Number(r.irpf),
        netPay: Number(r.netPay),
        totalCost: Number(r.gross) + Number(r.ssEmployer),
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 17. Plantilla actual
router.get('/headcount', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        code: schema.employees.code,
        firstName: schema.employees.firstName,
        lastName: schema.employees.lastName,
        hireDate: schema.employees.hireDate,
        terminationDate: schema.employees.terminationDate,
        status: schema.employees.status,
        departmentName: schema.departments.name,
      })
      .from(schema.employees)
      .leftJoin(schema.departments, eq(schema.employees.departmentId, schema.departments.id))
      .orderBy(asc(schema.employees.code));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// OLA 5 — INFORMES STOCK
// ═══════════════════════════════════════════════════════════════════

// 18. Valoración de inventario
router.get('/stock-valuation', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        code: schema.items.code,
        name: schema.items.name,
        stock: schema.items.stock,
        basePrice: schema.items.basePrice,
      })
      .from(schema.items)
      .where(sql`${schema.items.stock} > 0`)
      .orderBy(asc(schema.items.code));
    res.json(
      rows.map((r: any) => ({
        code: r.code,
        name: r.name,
        stock: Number(r.stock),
        unitPrice: Number(r.basePrice),
        value: Number(r.stock) * Number(r.basePrice),
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 19. Rotación
router.get('/stock-rotation', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        id: schema.items.id,
        code: schema.items.code,
        name: schema.items.name,
        stock: schema.items.stock,
        soldQty: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.quantity}), 0)`,
      })
      .from(schema.items)
      .leftJoin(schema.salesInvoiceLines, eq(schema.salesInvoiceLines.itemId, schema.items.id))
      .groupBy(schema.items.id, schema.items.code, schema.items.name, schema.items.stock)
      .orderBy(sql`COALESCE(SUM(${schema.salesInvoiceLines.quantity}), 0) DESC`)
      .limit(200);
    res.json(
      rows.map((r: any) => {
        const stock = Number(r.stock);
        const sold = Number(r.soldQty);
        const daysOfStock = sold > 0 ? (stock / sold) * 365 : null;
        return {
          code: r.code,
          name: r.name,
          stock,
          sold,
          daysOfStock: daysOfStock != null ? Math.round(daysOfStock) : null,
        };
      }),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 20. Movimientos de stock
router.get('/stock-movements', async (req: any, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : undefined;
    const to = req.query.to ? new Date(req.query.to) : undefined;

    const outCond: any[] = [eq(schema.salesDeliveryNotes.status, 'O')];
    if (from) outCond.push(gte(schema.salesDeliveryNotes.date, from));
    if (to) outCond.push(lte(schema.salesDeliveryNotes.date, to));

    const outgoing = await req.tenantClient
      .select({
        date: schema.salesDeliveryNotes.date,
        itemCode: schema.items.code,
        itemName: schema.items.name,
        qty: schema.salesDeliveryNoteLines.quantity,
        partnerName: schema.businessPartners.name,
      })
      .from(schema.salesDeliveryNoteLines)
      .innerJoin(
        schema.salesDeliveryNotes,
        eq(schema.salesDeliveryNoteLines.deliveryId, schema.salesDeliveryNotes.id),
      )
      .leftJoin(schema.items, eq(schema.salesDeliveryNoteLines.itemId, schema.items.id))
      .leftJoin(
        schema.businessPartners,
        eq(schema.salesDeliveryNotes.partnerId, schema.businessPartners.id),
      )
      .where(and(...outCond));

    const inCond: any[] = [eq(schema.purchaseDeliveryNotes.status, 'O')];
    if (from) inCond.push(gte(schema.purchaseDeliveryNotes.date, from));
    if (to) inCond.push(lte(schema.purchaseDeliveryNotes.date, to));

    const incoming = await req.tenantClient
      .select({
        date: schema.purchaseDeliveryNotes.date,
        itemCode: schema.items.code,
        itemName: schema.items.name,
        qty: schema.purchaseDeliveryNoteLines.quantity,
        partnerName: schema.businessPartners.name,
      })
      .from(schema.purchaseDeliveryNoteLines)
      .innerJoin(
        schema.purchaseDeliveryNotes,
        eq(schema.purchaseDeliveryNoteLines.deliveryId, schema.purchaseDeliveryNotes.id),
      )
      .leftJoin(schema.items, eq(schema.purchaseDeliveryNoteLines.itemId, schema.items.id))
      .leftJoin(
        schema.businessPartners,
        eq(schema.purchaseDeliveryNotes.partnerId, schema.businessPartners.id),
      )
      .where(and(...inCond));

    const mov = [
      ...incoming.map((r: any) => ({
        date: r.date,
        type: 'IN',
        itemCode: r.itemCode,
        itemName: r.itemName,
        qty: Number(r.qty),
        partnerName: r.partnerName,
      })),
      ...outgoing.map((r: any) => ({
        date: r.date,
        type: 'OUT',
        itemCode: r.itemCode,
        itemName: r.itemName,
        qty: -Number(r.qty),
        partnerName: r.partnerName,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(mov);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
//  RRHH AVANZADO+ — Rendimientos y coste laboral
// ============================================================

/**
 * GET /hr/productivity?from=&to=&employeeId?=&departmentId?=
 * Por empleado: horas planificadas vs fichadas vs contratadas, % cumplimiento,
 * horas extra, mapa de incidencias.
 */
router.get('/hr/productivity', async (req: any, res) => {
  try {
    const { from, to, employeeId, departmentId } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ error: 'from y to obligatorios' });
    const fromDate = new Date(from);
    const toDate = new Date(to + 'T23:59:59');

    let employees = await req.tenantClient.select().from(schema.employees);
    if (employeeId) employees = employees.filter((e: any) => e.id === employeeId);
    if (departmentId) employees = employees.filter((e: any) => e.departmentId === departmentId);
    employees = employees.filter((e: any) => e.status === 'active');

    const out: any[] = [];
    for (const emp of employees) {
      // Horas planificadas
      const shifts: any[] = await req.tenantClient
        .select()
        .from(schema.shiftAssignments)
        .where(
          and(
            eq(schema.shiftAssignments.employeeId, emp.id),
            gte(schema.shiftAssignments.date, from),
            lte(schema.shiftAssignments.date, to),
          ),
        );
      const hoursPlanned = shifts
        .filter((s: any) => s.status !== 'cancelled')
        .reduce((acc: number, s: any) => {
          const ms = new Date(s.endAt).getTime() - new Date(s.startAt).getTime();
          return acc + Math.max(0, ms / 3_600_000 - (s.breakMinutes || 0) / 60);
        }, 0);

      // Horas fichadas (pares in/out)
      const entries: any[] = await req.tenantClient
        .select()
        .from(schema.timeclockEntries)
        .where(
          and(
            eq(schema.timeclockEntries.employeeId, emp.id),
            gte(schema.timeclockEntries.at, fromDate),
            lte(schema.timeclockEntries.at, toDate),
          ),
        )
        .orderBy(asc(schema.timeclockEntries.at));
      let hoursClocked = 0;
      let lastIn: Date | null = null;
      let breakStart: Date | null = null;
      let breakAccum = 0;
      for (const e of entries) {
        const at = new Date(e.at);
        if (e.kind === 'in') {
          lastIn = at;
          breakAccum = 0;
        } else if (e.kind === 'break_start' && lastIn) {
          breakStart = at;
        } else if (e.kind === 'break_end' && breakStart) {
          breakAccum += (at.getTime() - breakStart.getTime()) / 3_600_000;
          breakStart = null;
        } else if (e.kind === 'out' && lastIn) {
          hoursClocked += (at.getTime() - lastIn.getTime()) / 3_600_000 - breakAccum;
          lastIn = null;
          breakAccum = 0;
        }
      }
      hoursClocked = Math.max(0, hoursClocked);

      // Horas contratadas en el rango (semana × días/7)
      const contracts: any[] = await req.tenantClient
        .select()
        .from(schema.contracts)
        .where(eq(schema.contracts.employeeId, emp.id));
      const active =
        contracts.find((c: any) => c.isActive) || contracts[contracts.length - 1] || null;
      const weekly = active ? Number(active.workHoursPerWeek || 40) : 40;
      const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
      const ratio = active?.isPartTime ? Number(active.partTimeRatio || 1) : 1;
      const hoursContracted = ((weekly * days) / 7) * ratio;

      // Incidencias por tipo en el rango
      const incidents: any[] = await req.tenantClient
        .select()
        .from(schema.incidents)
        .where(
          and(
            eq(schema.incidents.employeeId, emp.id),
            gte(schema.incidents.startAt, fromDate),
            lte(schema.incidents.startAt, toDate),
          ),
        );
      const types: any[] = await req.tenantClient.select().from(schema.incidentTypes);
      const typeById = new Map(types.map((t: any) => [t.id, t]));
      const incidentsByType: Record<string, number> = {};
      let absenceDays = 0;
      for (const inc of incidents) {
        if (inc.status === 'rejected') continue;
        const t: any = typeById.get(inc.incidentTypeId);
        const k = t?.code || t?.name || 'Otros';
        incidentsByType[k] = (incidentsByType[k] || 0) + 1;
        if (t?.affectsPayroll || t?.consumesLeaveBalance) {
          const start = new Date(inc.startAt);
          const end = inc.endAt ? new Date(inc.endAt) : start;
          absenceDays += Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        }
      }

      const compliancePct = hoursContracted > 0 ? (hoursClocked / hoursContracted) * 100 : 0;
      const hoursOvertime = Math.max(0, hoursClocked - hoursContracted);

      out.push({
        employeeId: emp.id,
        code: emp.code,
        name: `${emp.firstName} ${emp.lastName}`,
        departmentId: emp.departmentId,
        hoursContracted: Number(hoursContracted.toFixed(2)),
        hoursPlanned: Number(hoursPlanned.toFixed(2)),
        hoursClocked: Number(hoursClocked.toFixed(2)),
        hoursOvertime: Number(hoursOvertime.toFixed(2)),
        compliancePct: Number(compliancePct.toFixed(2)),
        incidentsByType,
        absenceDays,
      });
    }
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /hr/labor-cost?from=&to=&groupBy=employee|department|project|costCenter
 */
router.get('/hr/labor-cost', async (req: any, res) => {
  try {
    const { from, to, groupBy = 'employee' } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ error: 'from y to obligatorios' });
    const fy = new Date(from).getFullYear();
    const fm = new Date(from).getMonth() + 1;
    const ty = new Date(to).getFullYear();
    const tm = new Date(to).getMonth() + 1;

    const payrolls: any[] = await req.tenantClient.select().from(schema.payrolls);
    const inRange = payrolls.filter((p: any) => {
      const k = p.periodYear * 100 + p.periodMonth;
      return k >= fy * 100 + fm && k <= ty * 100 + tm;
    });
    const employees = await req.tenantClient.select().from(schema.employees);
    const empById = new Map(employees.map((e: any) => [e.id, e]));
    const departments = await req.tenantClient.select().from(schema.departments);
    const depById = new Map(departments.map((d: any) => [d.id, d]));

    const groups: Record<
      string,
      { label: string; gross: number; ssEr: number; total: number; count: number }
    > = {};
    for (const p of inRange) {
      const emp: any = empById.get(p.employeeId);
      let key = 'sin asignar';
      let label = key;
      if (groupBy === 'employee') {
        key = p.employeeId;
        label = emp ? `${emp.firstName} ${emp.lastName}` : key;
      } else if (groupBy === 'department') {
        key = emp?.departmentId || 'sin departamento';
        const d: any = depById.get(key);
        label = d?.name || key;
      } else if (groupBy === 'costCenter') {
        key = emp?.costCenterId || 'sin centro';
        label = key;
      } else if (groupBy === 'project') {
        // Por proyecto no hay relación directa con payroll → atribuimos al
        // departamento del empleado y dejamos pendiente para futuro.
        key = emp?.departmentId || 'sin asignar';
        const d2: any = depById.get(key);
        label = d2?.name || key;
      }
      const gross = Number(p.gross || 0);
      const ssEr = Number(p.ssEmployer || 0);
      const cur = groups[key] || { label, gross: 0, ssEr: 0, total: 0, count: 0 };
      cur.gross += gross;
      cur.ssEr += ssEr;
      cur.total += gross + ssEr;
      cur.count += 1;
      groups[key] = cur;
    }
    const rows = Object.entries(groups).map(([key, v]) => ({ key, ...v }));
    rows.sort((a, b) => b.total - a.total);
    res.json({
      rows,
      totals: rows.reduce(
        (s, r) => ({ gross: s.gross + r.gross, ssEr: s.ssEr + r.ssEr, total: s.total + r.total }),
        { gross: 0, ssEr: 0, total: 0 },
      ),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /hr/commissions?from=&to=&employeeId? — ranking de comerciales.
 */
router.get('/hr/commissions', async (req: any, res) => {
  try {
    const { from, to, employeeId } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ error: 'from y to obligatorios' });
    const fy = new Date(from).getFullYear();
    const fm = new Date(from).getMonth() + 1;
    const ty = new Date(to).getFullYear();
    const tm = new Date(to).getMonth() + 1;
    let accruals: any[] = await req.tenantClient.select().from(schema.commissionAccruals);
    accruals = accruals.filter((a: any) => {
      const k = a.periodYear * 100 + a.periodMonth;
      return k >= fy * 100 + fm && k <= ty * 100 + tm;
    });
    if (employeeId) accruals = accruals.filter((a: any) => a.employeeId === employeeId);
    const employees = await req.tenantClient.select().from(schema.employees);
    const byEmp = new Map<
      string,
      { employeeId: string; name: string; base: number; amount: number; count: number }
    >();
    for (const a of accruals) {
      const emp: any = employees.find((e: any) => e.id === a.employeeId);
      const cur = byEmp.get(a.employeeId) || {
        employeeId: a.employeeId,
        name: emp ? `${emp.firstName} ${emp.lastName}` : a.employeeId,
        base: 0,
        amount: 0,
        count: 0,
      };
      cur.base += Number(a.base || 0);
      cur.amount += Number(a.amount || 0);
      cur.count += 1;
      byEmp.set(a.employeeId, cur);
    }
    const rows = Array.from(byEmp.values()).sort((a, b) => b.amount - a.amount);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
