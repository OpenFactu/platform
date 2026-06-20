import { Router } from 'express';
import { and, eq, gte, lte, asc, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

// ── Reglas ─────────────────────────────────────────────────────────
router.get('/rules', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.commissionRules)
      .orderBy(asc(schema.commissionRules.name));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rules', async (req: any, res) => {
  try {
    const { name, scope, basis, kind } = req.body;
    if (!name) return res.status(400).json({ error: 'name obligatorio' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.commissionRules)
      .values({
        id,
        name,
        scope: scope || 'employee',
        employeeId: req.body.employeeId || null,
        departmentId: req.body.departmentId || null,
        basis: basis || 'net_amount',
        kind: kind || 'flat_pct',
        pct: req.body.pct != null ? String(req.body.pct) : '0',
        tiers: req.body.tiers || null,
        payrollConceptId: req.body.payrollConceptId || null,
        validFrom: req.body.validFrom || null,
        validTo: req.body.validTo || null,
        isActive: req.body.isActive ?? true,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/rules/:id', async (req: any, res) => {
  try {
    const allow = [
      'name',
      'scope',
      'employeeId',
      'departmentId',
      'basis',
      'kind',
      'pct',
      'tiers',
      'payrollConceptId',
      'validFrom',
      'validTo',
      'isActive',
    ];
    const patch: any = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    if ('pct' in patch && patch.pct != null) patch.pct = String(patch.pct);
    const [row] = await req.tenantClient
      .update(schema.commissionRules)
      .set(patch)
      .where(eq(schema.commissionRules.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rules/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.commissionRules)
      .where(eq(schema.commissionRules.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Acumulados ────────────────────────────────────────────────────
router.get('/accruals', async (req: any, res) => {
  try {
    const { employeeId, status, year, month } = req.query;
    const conds: any[] = [];
    if (employeeId) conds.push(eq(schema.commissionAccruals.employeeId, String(employeeId)));
    if (status) conds.push(eq(schema.commissionAccruals.status, String(status)));
    if (year) conds.push(eq(schema.commissionAccruals.periodYear, Number(year)));
    if (month) conds.push(eq(schema.commissionAccruals.periodMonth, Number(month)));
    const rows = await req.tenantClient
      .select()
      .from(schema.commissionAccruals)
      .where(conds.length ? and(...conds) : undefined);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Aplica una regla a un importe base.
 */
function applyRule(rule: any, base: number): number {
  if (!rule || base <= 0) return 0;
  if (rule.kind === 'flat_pct') {
    return (base * Number(rule.pct || 0)) / 100;
  }
  if (rule.kind === 'tiered' && Array.isArray(rule.tiers)) {
    let total = 0;
    let remaining = base;
    for (const t of rule.tiers) {
      const from = Number(t.from || 0);
      const to = t.to != null ? Number(t.to) : Infinity;
      const slice = Math.min(remaining, Math.max(0, to - from));
      if (slice <= 0) continue;
      total += (slice * Number(t.pct || 0)) / 100;
      remaining -= slice;
      if (remaining <= 0) break;
    }
    return total;
  }
  return 0;
}

/**
 * POST /recalculate?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Recorre facturas/pedidos/albaranes con `salesAgentId` en el rango y
 * (re)genera filas en `commissionAccruals` para los que estén pending.
 * Idempotente: si ya existía un accrual `pending` para el mismo doc/empleado,
 * lo reemplaza con los nuevos importes; los `paid` se respetan.
 */
router.post('/recalculate', async (req: any, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ error: 'from y to obligatorios' });

    const rules: any[] = await req.tenantClient
      .select()
      .from(schema.commissionRules)
      .where(eq(schema.commissionRules.isActive, true));

    const docs: Array<{
      docType: string;
      docId: string;
      employeeId: string;
      net: number;
      gross: number;
      year: number;
      month: number;
    }> = [];

    const fromDate = new Date(from);
    const toDate = new Date(to + 'T23:59:59');

    const sinvs = await req.tenantClient
      .select({
        id: schema.salesInvoices.id,
        salesAgentId: schema.salesInvoices.salesAgentId,
        subtotal: schema.salesInvoices.subtotal,
        total: schema.salesInvoices.total,
        date: schema.salesInvoices.date,
      })
      .from(schema.salesInvoices)
      .where(and(gte(schema.salesInvoices.date, fromDate), lte(schema.salesInvoices.date, toDate)));
    for (const r of sinvs) {
      if (!r.salesAgentId) continue;
      const d = new Date(r.date as any);
      docs.push({
        docType: 'SINV',
        docId: r.id,
        employeeId: r.salesAgentId,
        net: Number(r.subtotal || 0),
        gross: Number(r.total || 0),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }

    let upserts = 0;
    for (const d of docs) {
      // Empleado/dpto matching: pick the most specific rule first (employee
      // exact match → departamento → all). Si no hay regla, salta.
      const empMatch = rules.find((r) => r.scope === 'employee' && r.employeeId === d.employeeId);
      // departmentId desde la tabla employees
      let rule: any = empMatch;
      if (!rule) {
        const [emp]: any[] = await req.tenantClient
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.id, d.employeeId));
        if (emp?.departmentId) {
          rule = rules.find((r) => r.scope === 'department' && r.departmentId === emp.departmentId);
        }
      }
      if (!rule) rule = rules.find((r) => r.scope === 'all');
      if (!rule) continue;
      const base = rule.basis === 'gross_amount' ? d.gross : d.net;
      const amount = applyRule(rule, base);

      const [existing]: any[] = await req.tenantClient
        .select()
        .from(schema.commissionAccruals)
        .where(
          and(
            eq(schema.commissionAccruals.sourceDocType, d.docType),
            eq(schema.commissionAccruals.sourceDocId, d.docId),
            eq(schema.commissionAccruals.employeeId, d.employeeId),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.status === 'paid') continue;
        await req.tenantClient
          .update(schema.commissionAccruals)
          .set({
            ruleId: rule.id,
            base: String(base.toFixed(2)),
            amount: String(amount.toFixed(2)),
            periodYear: d.year,
            periodMonth: d.month,
          })
          .where(eq(schema.commissionAccruals.id, existing.id));
      } else {
        await req.tenantClient.insert(schema.commissionAccruals).values({
          id: crypto.randomUUID(),
          employeeId: d.employeeId,
          ruleId: rule.id,
          periodYear: d.year,
          periodMonth: d.month,
          sourceDocType: d.docType,
          sourceDocId: d.docId,
          base: String(base.toFixed(2)),
          amount: String(amount.toFixed(2)),
          status: 'pending',
        });
      }
      upserts++;
    }
    res.json({ processed: upserts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /payrolls/:payrollId/import-commissions
 * Toma los accruals `pending` del empleado y mes de la nómina, crea UNA
 * línea de devengo agregada, marca los accruals como `paid`.
 */
router.post('/payrolls/:payrollId/import-commissions', async (req: any, res) => {
  try {
    const [payroll]: any[] = await req.tenantClient
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, req.params.payrollId));
    if (!payroll) return res.status(404).json({ error: 'Nómina no encontrada' });

    const accruals: any[] = await req.tenantClient
      .select()
      .from(schema.commissionAccruals)
      .where(
        and(
          eq(schema.commissionAccruals.employeeId, payroll.employeeId),
          eq(schema.commissionAccruals.periodYear, payroll.periodYear),
          eq(schema.commissionAccruals.periodMonth, payroll.periodMonth),
          eq(schema.commissionAccruals.status, 'pending'),
        ),
      );
    if (!accruals.length) return res.json({ imported: 0, total: 0 });

    const total = accruals.reduce((s, a) => s + Number(a.amount || 0), 0);

    // Concepto destino: el de la primera regla con payrollConceptId, o uno
    // que se llame "Comisiones" en el catálogo, o línea suelta sin conceptId.
    let conceptId: string | null = null;
    let conceptName = 'Comisiones';
    const ruleIds = Array.from(new Set(accruals.map((a) => a.ruleId).filter(Boolean)));
    if (ruleIds.length) {
      const rules: any[] = await req.tenantClient
        .select()
        .from(schema.commissionRules)
        .where(inArray(schema.commissionRules.id, ruleIds as string[]));
      const r = rules.find((x: any) => x.payrollConceptId);
      if (r) conceptId = r.payrollConceptId;
    }
    if (!conceptId) {
      const [c]: any[] = await req.tenantClient
        .select()
        .from(schema.payrollConcepts)
        .where(eq(schema.payrollConcepts.code, 'COMISIONES'))
        .limit(1);
      if (c) {
        conceptId = c.id;
        conceptName = c.name;
      }
    }

    const lineId = crypto.randomUUID();
    await req.tenantClient.insert(schema.payrollLines).values({
      id: lineId,
      payrollId: payroll.id,
      conceptId,
      concept: conceptName,
      type: 'earning',
      amount: String(total.toFixed(2)),
    });

    for (const a of accruals) {
      await req.tenantClient
        .update(schema.commissionAccruals)
        .set({ status: 'paid', payrollLineId: lineId, paidAt: new Date() })
        .where(eq(schema.commissionAccruals.id, a.id));
    }

    res.json({ imported: accruals.length, total: Number(total.toFixed(2)), lineId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
