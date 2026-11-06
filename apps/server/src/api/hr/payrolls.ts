import { Router } from 'express';
import { and, eq, asc, desc, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { logAudit } from '../../utils/audit';
import { JournalEngine } from '../../core/accounting/JournalEngine';
import {
  PayrollCalculators,
  computeStandardPayroll,
  payrollTotalsColumns,
} from '../../core/hr/payrollCalculation';

const router = Router();

const VALID_LINE_TYPE = new Set(['earning', 'deduction', 'employer_cost']);

// ── Helpers de cálculo ──────────────────────────────────────────────
type LineRow = typeof schema.payrollLines.$inferSelect;
type ConceptRow = typeof schema.payrollConcepts.$inferSelect;

export async function recalcPayroll(client: any, payrollId: string, tenantId?: string) {
  const lines: LineRow[] = await client
    .select()
    .from(schema.payrollLines)
    .where(eq(schema.payrollLines.payrollId, payrollId));
  const conceptIds = lines.map((l) => l.conceptId).filter(Boolean) as string[];
  const concepts: ConceptRow[] = conceptIds.length
    ? await client
        .select()
        .from(schema.payrollConcepts)
        .where(inArray(schema.payrollConcepts.id, conceptIds))
    : [];

  let result = computeStandardPayroll(lines, concepts);
  for (const calculator of PayrollCalculators.activeFor(tenantId)) {
    const answer = await calculator({
      tenantId: tenantId ?? '',
      payrollId,
      lines,
      concepts,
      standard: result,
    });
    if (answer) {
      result = answer;
      break;
    }
  }

  for (const update of result.lineUpdates) {
    await client
      .update(schema.payrollLines)
      .set({ baseAmount: update.baseAmount, amount: update.amount, rate: update.rate })
      .where(eq(schema.payrollLines.id, update.id));
  }
  await client
    .update(schema.payrolls)
    .set(payrollTotalsColumns(result.totals))
    .where(eq(schema.payrolls.id, payrollId));
}

// ── Endpoints de nómina ─────────────────────────────────────────────

router.get('/', async (req: any, res) => {
  try {
    const { year, month, employeeId } = req.query;
    const conds: any[] = [];
    if (year) conds.push(eq(schema.payrolls.periodYear, Number(year)));
    if (month) conds.push(eq(schema.payrolls.periodMonth, Number(month)));
    if (employeeId) conds.push(eq(schema.payrolls.employeeId, employeeId));
    const rows = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.payrolls.periodYear), desc(schema.payrolls.periodMonth));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Nómina no encontrada' });
    const lines = await req.tenantClient
      .select()
      .from(schema.payrollLines)
      .where(eq(schema.payrollLines.payrollId, row.id));
    res.json({ ...row, lines });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { employeeId, contractId, periodYear, periodMonth } = req.body;
    if (!employeeId || !periodYear || !periodMonth) {
      return res
        .status(400)
        .json({ error: 'employeeId, periodYear y periodMonth son obligatorios' });
    }

    // Comprobación previa para devolver un mensaje claro si ya existe la
    // nómina de ese empleado/periodo (la BD tiene un unique constraint).
    const [exists] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(
        and(
          eq(schema.payrolls.employeeId, employeeId),
          eq(schema.payrolls.periodYear, Number(periodYear)),
          eq(schema.payrolls.periodMonth, Number(periodMonth)),
        ),
      )
      .limit(1);
    if (exists) {
      return res.status(409).json({
        error: `Ya existe una nómina para este empleado en ${periodMonth}/${periodYear}.`,
        existingId: exists.id,
      });
    }

    const id = crypto.randomUUID();
    const gross = Number(req.body.gross || 0);
    // Los nombres antiguos se siguen aceptando para quien use ya esta API.
    const incomeTax = Number(req.body.incomeTaxTotal ?? req.body.irpfAmount ?? 0);
    const socialE = Number(req.body.socialEmployeeTotal ?? req.body.ssEmployee ?? 0);
    const socialEr = Number(req.body.socialEmployerTotal ?? req.body.ssEmployer ?? 0);
    const netPay = req.body.netPay != null ? Number(req.body.netPay) : gross - incomeTax - socialE;

    const [row] = await req.tenantClient
      .insert(schema.payrolls)
      .values({
        id,
        employeeId,
        contractId: contractId || null,
        periodYear,
        periodMonth,
        gross: String(gross),
        incomeTaxTotal: String(incomeTax),
        socialEmployeeTotal: String(socialE),
        socialEmployerTotal: String(socialEr),
        irpfAmount: String(incomeTax),
        ssEmployee: String(socialE),
        ssEmployer: String(socialEr),
        netPay: String(netPay),
        status: 'draft',
        notes: req.body.notes || null,
      })
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Payroll',
      entityId: id,
      action: 'CREATE',
      newValue: row,
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Ya existe una nómina para este empleado en ese periodo.',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /:id — actualiza notas / overrides manuales en cabecera. */
router.patch('/:id', async (req: any, res) => {
  try {
    const [current] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.id));
    if (!current) return res.status(404).json({ error: 'Nómina no encontrada' });
    if (current.status !== 'draft')
      return res.status(400).json({ error: 'Solo se pueden editar nóminas en borrador' });
    const patch: Record<string, any> = {};
    for (const k of ['gross', 'netPay'] as const) {
      if (k in req.body) patch[k] = String(req.body[k] ?? 0);
    }
    // Cada total genérico con su columna anterior, hasta retirarlas.
    for (const [neutral, legacy] of [
      ['incomeTaxTotal', 'irpfAmount'],
      ['socialEmployeeTotal', 'ssEmployee'],
      ['socialEmployerTotal', 'ssEmployer'],
    ] as const) {
      const value = req.body[neutral] ?? req.body[legacy];
      if (neutral in req.body || legacy in req.body) {
        patch[neutral] = String(value ?? 0);
        patch[legacy] = String(value ?? 0);
      }
    }
    if ('notes' in req.body) patch.notes = req.body.notes;
    if ('contractId' in req.body) patch.contractId = req.body.contractId || null;
    const [row] = await req.tenantClient
      .update(schema.payrolls)
      .set(patch)
      .where(eq(schema.payrolls.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Líneas ──────────────────────────────────────────────────────────

router.post('/:id/lines', async (req: any, res) => {
  try {
    const { conceptId, concept, type, quantity, rate, baseAmount, amount, accountId } = req.body;
    if (!type || !VALID_LINE_TYPE.has(type))
      return res.status(400).json({ error: `type inválido (${type})` });
    let conceptName = concept;
    let conceptType = type;
    let resolvedAccount = accountId;
    if (conceptId) {
      const [c] = await req.tenantClient
        .select()
        .from(schema.payrollConcepts)
        .where(eq(schema.payrollConcepts.id, conceptId));
      if (!c) return res.status(400).json({ error: 'Concepto no encontrado' });
      conceptName = conceptName || c.name;
      if (!resolvedAccount) resolvedAccount = c.accountId || null;
    }
    if (!conceptName) return res.status(400).json({ error: 'concept o conceptId obligatorio' });

    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.payrollLines)
      .values({
        id,
        payrollId: req.params.id,
        conceptId: conceptId || null,
        concept: conceptName,
        type: conceptType,
        quantity: quantity != null ? String(quantity) : null,
        rate: rate != null ? String(rate) : null,
        baseAmount: baseAmount != null ? String(baseAmount) : null,
        amount: amount != null ? String(amount) : '0',
        accountId: resolvedAccount || null,
      })
      .returning();
    await recalcPayroll(req.tenantClient, req.params.id, req.tenantId);
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/lines/:lineId', async (req: any, res) => {
  try {
    const allow = [
      'conceptId',
      'concept',
      'type',
      'quantity',
      'rate',
      'baseAmount',
      'amount',
      'accountId',
    ] as const;
    const patch: Record<string, any> = {};
    for (const k of allow) {
      if (k in req.body) {
        if (['quantity', 'rate', 'baseAmount', 'amount'].includes(k)) {
          patch[k] = req.body[k] != null ? String(req.body[k]) : null;
        } else {
          patch[k] = req.body[k];
        }
      }
    }
    if (patch.type && !VALID_LINE_TYPE.has(patch.type))
      return res.status(400).json({ error: `type inválido` });
    const [row] = await req.tenantClient
      .update(schema.payrollLines)
      .set(patch)
      .where(
        and(
          eq(schema.payrollLines.id, req.params.lineId),
          eq(schema.payrollLines.payrollId, req.params.id),
        ),
      )
      .returning();
    if (!row) return res.status(404).json({ error: 'Línea no encontrada' });
    await recalcPayroll(req.tenantClient, req.params.id, req.tenantId);
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/lines/:lineId', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.payrollLines)
      .where(
        and(
          eq(schema.payrollLines.id, req.params.lineId),
          eq(schema.payrollLines.payrollId, req.params.id),
        ),
      );
    await recalcPayroll(req.tenantClient, req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/auto-deductions — añade automáticamente las líneas de retención y
 * cotizaciones a partir del catálogo (primer concepto activo de cada categoría con
 * cálculo % de base). Útil para no obligar al usuario a meterlas a mano cada
 * vez que crea una nómina.
 */
router.post('/:id/auto-deductions', async (req: any, res) => {
  try {
    const concepts: ConceptRow[] = await req.tenantClient
      .select()
      .from(schema.payrollConcepts)
      .where(eq(schema.payrollConcepts.isActive, true));
    const incomeTax = concepts.find(
      (c) =>
        c.kind === 'deduccion' &&
        c.category === 'income_tax' &&
        c.calculation === 'percent_of_base',
    );
    const socialE = concepts.find(
      (c) =>
        c.kind === 'deduccion' &&
        c.category === 'social_employee' &&
        c.calculation === 'percent_of_base',
    );
    const socialEr = concepts.find(
      (c) => c.kind === 'aportacion_empresa' && c.calculation === 'percent_of_base',
    );

    const existing: LineRow[] = await req.tenantClient
      .select()
      .from(schema.payrollLines)
      .where(eq(schema.payrollLines.payrollId, req.params.id));
    const hasConcept = (id?: string | null) => !!id && existing.some((l) => l.conceptId === id);

    const toCreate: ConceptRow[] = [];
    if (incomeTax && !hasConcept(incomeTax.id)) toCreate.push(incomeTax);
    if (socialE && !hasConcept(socialE.id)) toCreate.push(socialE);
    if (socialEr && !hasConcept(socialEr.id)) toCreate.push(socialEr);

    for (const c of toCreate) {
      await req.tenantClient.insert(schema.payrollLines).values({
        id: crypto.randomUUID(),
        payrollId: req.params.id,
        conceptId: c.id,
        type: c.kind === 'aportacion_empresa' ? 'employer_cost' : 'deduction',
        concept: c.name,
        rate: c.defaultPercent ? String(c.defaultPercent) : '0',
        amount: '0',
      });
    }
    await recalcPayroll(req.tenantClient, req.params.id, req.tenantId);
    res.json({ created: toCreate.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/recalc', async (req: any, res) => {
  try {
    await recalcPayroll(req.tenantClient, req.params.id, req.tenantId);
    const [row] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.id));
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Aprobación / borrado ────────────────────────────────────────────

router.post('/:id/approve', async (req: any, res) => {
  try {
    const [payroll] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.id));
    if (!payroll) return res.status(404).json({ error: 'Nómina no encontrada' });
    if (payroll.status !== 'draft') {
      return res.status(400).json({ error: 'Solo se pueden aprobar nóminas en borrador' });
    }

    const [employee] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, payroll.employeeId));
    if (!employee) return res.status(400).json({ error: 'Empleado no encontrado' });

    let periodId: string | null = req.body?.periodId || null;
    if (!periodId) {
      const [open] = await req.tenantClient
        .select()
        .from(schema.accountingPeriods)
        .where(eq(schema.accountingPeriods.status, 'O'))
        .orderBy(asc(schema.accountingPeriods.endDate))
        .limit(1);
      periodId = open?.id || null;
    }
    if (!periodId)
      return res
        .status(400)
        .json({ error: 'No hay período contable abierto para asentar la nómina' });

    let journalEntryId: string | null = null;
    try {
      const entry = await JournalEngine.createFromPayroll(
        req.tenantClient,
        {
          id: payroll.id,
          employeeId: payroll.employeeId,
          periodYear: payroll.periodYear,
          periodMonth: payroll.periodMonth,
          gross: payroll.gross,
          incomeTaxTotal: payroll.incomeTaxTotal,
          socialEmployeeTotal: payroll.socialEmployeeTotal,
          socialEmployerTotal: payroll.socialEmployerTotal,
          netPay: payroll.netPay,
        },
        {
          id: employee.id,
          costCenterId: employee.costCenterId,
          profitCenterId: employee.profitCenterId,
        },
        periodId,
        req.user?.id,
      );
      if (entry) {
        await JournalEngine.post(req.tenantClient, entry.id, req.user?.id);
        journalEntryId = entry.id;
      }
    } catch (err: any) {
      return res.status(400).json({ error: `No se pudo generar asiento: ${err.message}` });
    }

    const [row] = await req.tenantClient
      .update(schema.payrolls)
      .set({
        status: 'approved',
        journalEntryId,
        approvedAt: new Date(),
        approvedBy: req.user?.id,
      })
      .where(eq(schema.payrolls.id, req.params.id))
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Payroll',
      entityId: req.params.id,
      action: 'APPROVE',
      newValue: row,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    if (row.status !== 'draft')
      return res.status(400).json({ error: 'Solo se pueden eliminar nóminas en borrador' });
    await req.tenantClient.delete(schema.payrolls).where(eq(schema.payrolls.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
