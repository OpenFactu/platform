/**
 * Motor contable: crea, valida, postea y reversa asientos.
 *
 * Doble partida: la suma de debe == suma de haber en cada asiento.
 * Un asiento `posted` es inmutable — para corregir se crea un
 * contra-asiento que invierte debe/haber, y el original queda `reversed`.
 *
 * Las fuentes automáticas (facturas, pagos, nóminas) usan `AccountMapping`
 * para decidir qué cuenta usar para cada concepto (cliente, proveedor,
 * IVA, caja, banco, ventas, compras, etc.).
 */
import crypto from 'crypto';
import { and, eq, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed';
export type JournalSource =
  | 'manual'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'payment'
  | 'payroll'
  | 'period_close'
  | 'period_open'
  | 'reversal';

export interface JournalLineInput {
  accountId: string;
  debit?: number | string;
  credit?: number | string;
  description?: string | null;
  costCenterId?: string | null;
  profitCenterId?: string | null;
  internalOrderId?: string | null;
  partnerId?: string | null;
  taxId?: string | null;
  currency?: string;
  exchangeRate?: number | string;
}

export interface JournalEntryInput {
  date: Date | string;
  periodId: string;
  description?: string | null;
  source?: JournalSource;
  sourceDocumentId?: string | null;
  createdBy?: string | null;
  lines: JournalLineInput[];
}

function toNum(v: number | string | undefined | null): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Redondea a 4 decimales — la DB almacena decimal(15,4). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export class JournalEngine {
  /**
   * Valida la cabecera y líneas. Lanza Error con mensaje human-readable.
   */
  static validate(input: JournalEntryInput): void {
    if (!input.periodId) throw new Error('periodId es obligatorio');
    if (!input.lines || input.lines.length < 2) {
      throw new Error('Un asiento requiere al menos 2 líneas');
    }
    let totalDebit = 0;
    let totalCredit = 0;
    for (const [i, l] of input.lines.entries()) {
      if (!l.accountId) throw new Error(`Línea ${i + 1}: accountId obligatorio`);
      const d = toNum(l.debit);
      const c = toNum(l.credit);
      if (d < 0 || c < 0) throw new Error(`Línea ${i + 1}: debe/haber no pueden ser negativos`);
      if (d > 0 && c > 0) throw new Error(`Línea ${i + 1}: no puede tener debe y haber a la vez`);
      if (d === 0 && c === 0) throw new Error(`Línea ${i + 1}: debe o haber tiene que ser > 0`);
      totalDebit += d;
      totalCredit += c;
    }
    // Tolerancia 1 céntimo a nivel total (0.01 €) para redondeos de IVA.
    if (Math.abs(round4(totalDebit) - round4(totalCredit)) > 0.01) {
      throw new Error(
        `Asiento descuadrado: debe=${round4(totalDebit)} ≠ haber=${round4(totalCredit)}`,
      );
    }
  }

  /**
   * Crea un asiento (y sus líneas) en estado draft.
   * No postea — para eso usar `post()`. El número se asigna al postear.
   */
  static async create(db: any, input: JournalEntryInput): Promise<{ id: string }> {
    this.validate(input);
    const id = crypto.randomUUID();
    const entryValues = {
      id,
      // number = 0 hasta que se postee — el número correlativo se asigna ahí.
      number: 0,
      date: typeof input.date === 'string' ? new Date(input.date) : input.date,
      periodId: input.periodId,
      description: input.description ?? null,
      source: input.source ?? 'manual',
      sourceDocumentId: input.sourceDocumentId ?? null,
      status: 'draft' as const,
      createdBy: input.createdBy ?? null,
    };
    await db.insert(schema.journalEntries).values(entryValues);

    const lineValues = input.lines.map((l, idx) => ({
      id: crypto.randomUUID(),
      entryId: id,
      lineNumber: idx + 1,
      accountId: l.accountId,
      debit: String(round4(toNum(l.debit))),
      credit: String(round4(toNum(l.credit))),
      description: l.description ?? null,
      costCenterId: l.costCenterId ?? null,
      profitCenterId: l.profitCenterId ?? null,
      internalOrderId: l.internalOrderId ?? null,
      partnerId: l.partnerId ?? null,
      taxId: l.taxId ?? null,
      currency: l.currency ?? 'EUR',
      exchangeRate: String(toNum(l.exchangeRate ?? 1) || 1),
    }));
    await db.insert(schema.journalEntryLines).values(lineValues);

    return { id };
  }

  /**
   * Postea un asiento draft: asigna número correlativo dentro del período
   * y marca status=posted. Idempotente: si ya está posted devuelve silencio.
   */
  static async post(db: any, entryId: string, userId?: string | null): Promise<void> {
    const [entry] = await db
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, entryId));
    if (!entry) throw new Error(`Asiento ${entryId} no existe`);
    if (entry.status === 'posted') return;
    if (entry.status === 'reversed') {
      throw new Error('No se puede postear un asiento reversado');
    }

    // Revalidar balance en el momento del posteo — las líneas pueden haber
    // cambiado desde create().
    const lines = await db
      .select()
      .from(schema.journalEntryLines)
      .where(eq(schema.journalEntryLines.entryId, entryId));
    let d = 0;
    let c = 0;
    for (const l of lines) {
      d += toNum(l.debit);
      c += toNum(l.credit);
    }
    if (Math.abs(round4(d) - round4(c)) > 0.01) {
      throw new Error(`Asiento ${entryId} descuadrado: debe=${round4(d)} haber=${round4(c)}`);
    }
    if (lines.length < 2) throw new Error(`Asiento ${entryId} tiene menos de 2 líneas`);

    // Número correlativo por período: max(number)+1.
    const [{ maxNumber } = { maxNumber: 0 }] = await db
      .select({ maxNumber: schema.journalEntries.number })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.periodId, entry.periodId),
          eq(schema.journalEntries.status, 'posted'),
        ),
      )
      .orderBy(desc(schema.journalEntries.number))
      .limit(1);
    const nextNumber = (maxNumber || 0) + 1;

    await db
      .update(schema.journalEntries)
      .set({
        status: 'posted',
        number: nextNumber,
        postedAt: new Date(),
        postedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.journalEntries.id, entryId));
  }

  /**
   * Reversa un asiento posted. Crea contra-asiento con debe↔haber intercambiado
   * y marca el original como reversed. Devuelve el id del contra-asiento.
   */
  static async reverse(
    db: any,
    entryId: string,
    userId?: string | null,
    description?: string,
  ): Promise<{ reversalId: string }> {
    const [entry] = await db
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, entryId));
    if (!entry) throw new Error(`Asiento ${entryId} no existe`);
    if (entry.status !== 'posted') {
      throw new Error(`Solo se puede reversar un asiento posted (estado actual: ${entry.status})`);
    }
    const lines = await db
      .select()
      .from(schema.journalEntryLines)
      .where(eq(schema.journalEntryLines.entryId, entryId));

    const reversal = await this.create(db, {
      date: new Date(),
      periodId: entry.periodId,
      description: description || `Reversión de asiento ${entry.number}`,
      source: 'reversal',
      sourceDocumentId: entry.id,
      createdBy: userId,
      lines: lines.map((l: any) => ({
        accountId: l.accountId,
        debit: l.credit, // swap
        credit: l.debit,
        description: l.description,
        costCenterId: l.costCenterId,
        profitCenterId: l.profitCenterId,
        internalOrderId: l.internalOrderId,
        partnerId: l.partnerId,
        taxId: l.taxId,
        currency: l.currency,
        exchangeRate: l.exchangeRate,
      })),
    });
    await this.post(db, reversal.id, userId);

    await db
      .update(schema.journalEntries)
      .set({ status: 'reversed', reversedById: reversal.id, updatedAt: new Date() })
      .where(eq(schema.journalEntries.id, entryId));

    return { reversalId: reversal.id };
  }

  /**
   * Resuelve una cuenta a partir de un `kind` y opcionalmente un `key`.
   * Busca key específica primero, luego 'default'. Null si no hay mapeo.
   */
  static async resolveAccount(db: any, kind: string, key?: string | null): Promise<string | null> {
    if (key) {
      const [m] = await db
        .select()
        .from(schema.accountMappings)
        .where(and(eq(schema.accountMappings.kind, kind), eq(schema.accountMappings.key, key)));
      if (m) return m.accountId;
    }
    const [def] = await db
      .select()
      .from(schema.accountMappings)
      .where(and(eq(schema.accountMappings.kind, kind), eq(schema.accountMappings.key, 'default')));
    return def?.accountId ?? null;
  }

  /**
   * Resuelve con prioridad: docType → partner → default. Orden pensado
   * para el caso típico: un tipo de documento (ej. factura rectificativa)
   * puede forzar cuenta especial; un partner concreto puede tener cuenta
   * propia (clientes extranjeros); si nada coincide, default.
   */
  static async resolveAccountChain(
    db: any,
    kind: string,
    docTypeId?: string | null,
    partnerId?: string | null,
  ): Promise<string | null> {
    if (docTypeId) {
      const hit = await this.resolveAccount(db, kind, `docType:${docTypeId}`);
      if (hit) return hit;
    }
    if (partnerId) {
      const hit = await this.resolveAccount(db, kind, `partner:${partnerId}`);
      if (hit) return hit;
    }
    return this.resolveAccount(db, kind);
  }

  /**
   * Helper para facturas de venta: construye asiento a partir de una
   * SalesInvoice ya cargada. Requiere que existan los mapeos básicos
   * (sales_revenue, sales_vat_output, customer_receivable).
   */
  static async createFromSalesInvoice(
    db: any,
    invoice: any,
    lines: any[],
    userId?: string | null,
  ): Promise<{ id: string } | null> {
    const receivable = await this.resolveAccountChain(
      db,
      'customer_receivable',
      invoice.documentTypeId,
      invoice.partnerId,
    );
    const revenue = await this.resolveAccountChain(
      db,
      'sales_revenue',
      invoice.documentTypeId,
      invoice.partnerId,
    );
    const vatOut = await this.resolveAccountChain(
      db,
      'sales_vat_output',
      invoice.documentTypeId,
      invoice.partnerId,
    );
    if (!receivable || !revenue) {
      // Sin mapeos mínimos no generamos asiento — no es error fatal del posteo
      // del documento; simplemente no se contabiliza todavía.
      return null;
    }

    const subtotal = round4(toNum(invoice.subtotal));
    const taxTotal = round4(toNum(invoice.taxTotal));
    const total = round4(toNum(invoice.total));

    const journalLines: JournalLineInput[] = [
      {
        accountId: receivable,
        debit: total,
        credit: 0,
        partnerId: invoice.partnerId,
        description: `Factura ${invoice.docNum || ''}`,
        costCenterId: invoice.costCenterId || null,
        profitCenterId: invoice.profitCenterId || null,
        internalOrderId: invoice.internalOrderId || null,
      },
      {
        accountId: revenue,
        debit: 0,
        credit: subtotal,
        description: `Ventas factura ${invoice.docNum || ''}`,
        costCenterId: invoice.costCenterId || null,
        profitCenterId: invoice.profitCenterId || null,
        internalOrderId: invoice.internalOrderId || null,
      },
    ];
    if (taxTotal > 0 && vatOut) {
      journalLines.push({
        accountId: vatOut,
        debit: 0,
        credit: taxTotal,
        description: `IVA repercutido factura ${invoice.docNum || ''}`,
      });
    }

    return this.create(db, {
      date: invoice.date,
      periodId: invoice.periodId,
      description: `Factura venta ${invoice.docNum || invoice.id}`,
      source: 'sales_invoice',
      sourceDocumentId: invoice.id,
      createdBy: userId,
      lines: journalLines,
    });
  }

  /**
   * Cobro/pago: genera asiento que mueve saldo entre caja/banco y la
   * cuenta de cliente/proveedor. `kind` indica el sentido:
   *   - 'sales'    → cobro de cliente: debe=caja/banco, haber=cliente
   *   - 'purchase' → pago a proveedor: debe=proveedor, haber=caja/banco
   *
   * El método de pago (efectivo/transferencia/tarjeta) se resuelve vía
   * AccountMapping con kind 'cash' o 'bank' + key `method:<paymentMethodId>`.
   * Si no hay método específico cae al default de 'bank'.
   */
  static async createFromPayment(
    db: any,
    payment: any,
    invoice: { id: string; partnerId: string; periodId: string; docNum?: number },
    direction: 'sales' | 'purchase',
    userId?: string | null,
  ): Promise<{ id: string } | null> {
    const amount = round4(toNum(payment.amount));
    if (amount <= 0) return null;

    // Cuenta de contrapartida (tesorería): caja si método es 'cash', si no banco.
    const methodKey = payment.paymentMethodId ? `method:${payment.paymentMethodId}` : null;
    let treasury =
      (await this.resolveAccount(db, 'bank', methodKey)) ||
      (await this.resolveAccount(db, 'cash', methodKey)) ||
      (await this.resolveAccount(db, 'bank')) ||
      (await this.resolveAccount(db, 'cash'));

    // Cuenta del tercero (cliente o proveedor).
    const counterKind = direction === 'sales' ? 'customer_receivable' : 'supplier_payable';
    const counter =
      (await this.resolveAccount(db, counterKind, `partner:${invoice.partnerId}`)) ||
      (await this.resolveAccount(db, counterKind));

    if (!treasury || !counter) return null;

    const desc =
      direction === 'sales'
        ? `Cobro factura ${invoice.docNum || ''}`.trim()
        : `Pago factura ${invoice.docNum || ''}`.trim();

    const lines: JournalLineInput[] =
      direction === 'sales'
        ? [
            { accountId: treasury, debit: amount, credit: 0, description: desc },
            {
              accountId: counter,
              debit: 0,
              credit: amount,
              partnerId: invoice.partnerId,
              description: desc,
            },
          ]
        : [
            {
              accountId: counter,
              debit: amount,
              credit: 0,
              partnerId: invoice.partnerId,
              description: desc,
            },
            { accountId: treasury, debit: 0, credit: amount, description: desc },
          ];

    return this.create(db, {
      date: payment.date || new Date(),
      periodId: invoice.periodId,
      description: desc,
      source: 'payment',
      sourceDocumentId: payment.id,
      createdBy: userId,
      lines,
    });
  }

  /**
   * Asiento desde una nómina aprobada:
   *   Debe: 640 sueldos brutos, 642 SS empresa
   *   Haber: 465 remuneraciones pendientes (neto), 4751 HP IRPF, 476 SS acreedora
   *
   * Imputación analítica: usa el `costCenterId` del empleado si existe.
   */
  static async createFromPayroll(
    db: any,
    payroll: {
      id: string;
      employeeId: string;
      periodYear: number;
      periodMonth: number;
      gross: number | string;
      irpfAmount: number | string;
      ssEmployee: number | string;
      ssEmployer: number | string;
      netPay: number | string;
    },
    employee: { id: string; costCenterId: string | null; profitCenterId: string | null },
    periodId: string,
    userId?: string | null,
  ): Promise<{ id: string } | null> {
    const gross = round4(toNum(payroll.gross));
    const irpf = round4(toNum(payroll.irpfAmount));
    const ssE = round4(toNum(payroll.ssEmployee));
    const ssEr = round4(toNum(payroll.ssEmployer));
    const net = round4(toNum(payroll.netPay));

    if (gross <= 0) return null;

    const accGross = await this.resolveAccount(db, 'payroll_gross');
    const accIrpf = await this.resolveAccount(db, 'payroll_irpf');
    const accSsE = await this.resolveAccount(db, 'payroll_ss_employee');
    const accSsEr = await this.resolveAccount(db, 'payroll_ss_employer');
    const accNet = await this.resolveAccount(db, 'payroll_net');

    if (!accGross || !accNet) return null;

    const dims = {
      costCenterId: employee.costCenterId,
      profitCenterId: employee.profitCenterId,
    };

    const lines: JournalLineInput[] = [
      {
        accountId: accGross,
        debit: gross,
        credit: 0,
        description: `Sueldo bruto ${payroll.periodYear}/${String(payroll.periodMonth).padStart(2, '0')}`,
        ...dims,
      },
    ];
    if (ssEr > 0 && accSsEr) {
      lines.push({
        accountId: accSsEr,
        debit: ssEr,
        credit: 0,
        description: 'SS empresa',
        ...dims,
      });
    }
    if (irpf > 0 && accIrpf) {
      lines.push({
        accountId: accIrpf,
        debit: 0,
        credit: irpf,
        description: 'HP IRPF',
      });
    }
    if (ssE > 0 && accSsE) {
      lines.push({
        accountId: accSsE,
        debit: 0,
        credit: ssE,
        description: 'SS trabajador',
      });
    }
    if (ssEr > 0 && accSsE) {
      // La SS empresa cruza como acreedora también (misma cuenta 476 por defecto).
      lines.push({
        accountId: accSsE,
        debit: 0,
        credit: ssEr,
        description: 'SS empresa acreedora',
      });
    }
    lines.push({
      accountId: accNet,
      debit: 0,
      credit: net,
      description: 'Remuneración neta a pagar',
    });

    return this.create(db, {
      date: new Date(payroll.periodYear, payroll.periodMonth - 1, 28),
      periodId,
      description: `Nómina ${payroll.periodYear}/${String(payroll.periodMonth).padStart(2, '0')}`,
      source: 'payroll',
      sourceDocumentId: payroll.id,
      createdBy: userId,
      lines,
    });
  }

  /**
   * Equivalente para facturas de compra.
   */
  static async createFromPurchaseInvoice(
    db: any,
    invoice: any,
    lines: any[],
    userId?: string | null,
  ): Promise<{ id: string } | null> {
    const payable = await this.resolveAccountChain(
      db,
      'supplier_payable',
      invoice.documentTypeId,
      invoice.partnerId,
    );
    const expense = await this.resolveAccountChain(
      db,
      'purchase_expense',
      invoice.documentTypeId,
      invoice.partnerId,
    );
    const vatIn = await this.resolveAccountChain(
      db,
      'purchase_vat_input',
      invoice.documentTypeId,
      invoice.partnerId,
    );
    if (!payable || !expense) return null;

    const subtotal = round4(toNum(invoice.subtotal));
    const taxTotal = round4(toNum(invoice.taxTotal));
    const total = round4(toNum(invoice.total));

    const journalLines: JournalLineInput[] = [
      {
        accountId: expense,
        debit: subtotal,
        credit: 0,
        description: `Compra factura ${invoice.docNum || ''}`,
        costCenterId: invoice.costCenterId || null,
        profitCenterId: invoice.profitCenterId || null,
        internalOrderId: invoice.internalOrderId || null,
      },
      {
        accountId: payable,
        debit: 0,
        credit: total,
        partnerId: invoice.partnerId,
        description: `Factura compra ${invoice.docNum || ''}`,
      },
    ];
    if (taxTotal > 0 && vatIn) {
      journalLines.push({
        accountId: vatIn,
        debit: taxTotal,
        credit: 0,
        description: `IVA soportado factura ${invoice.docNum || ''}`,
      });
    }

    return this.create(db, {
      date: invoice.date,
      periodId: invoice.periodId,
      description: `Factura compra ${invoice.docNum || invoice.id}`,
      source: 'purchase_invoice',
      sourceDocumentId: invoice.id,
      createdBy: userId,
      lines: journalLines,
    });
  }
}
