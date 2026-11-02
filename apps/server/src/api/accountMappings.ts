import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';

const router = Router();

export const MAPPING_KINDS = [
  'sales_revenue',
  'tax_output',
  'customer_receivable',
  'withholding_receivable',
  'purchase_expense',
  'tax_input',
  'supplier_payable',
  'withholding_payable',
  'cash',
  'bank',
  'payroll_gross',
  'payroll_income_tax',
  'payroll_social_employee',
  'payroll_social_employer',
  'payroll_net',
  'retained_earnings',
  'result',
] as const;

// Nombres anteriores: la migración 082 los copió a los neutros y siguen en la
// tabla solo por si hay que volver a la versión anterior del servidor.
const RETIRED_KINDS = new Set([
  'sales_vat_output',
  'purchase_vat_input',
  'payroll_irpf',
  'payroll_ss_employee',
  'payroll_ss_employer',
]);

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.accountMappings)
      .orderBy(asc(schema.accountMappings.kind), asc(schema.accountMappings.key));
    res.json(rows.filter((r: any) => !RETIRED_KINDS.has(r.kind)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kinds', (_req, res) => {
  res.json(MAPPING_KINDS);
});

router.put('/', async (req: any, res) => {
  try {
    const { kind, key, accountId } = req.body;
    if (!kind || !accountId) {
      return res.status(400).json({ error: 'kind y accountId son obligatorios' });
    }
    const useKey = key || 'default';
    const [existing] = await req.tenantClient
      .select()
      .from(schema.accountMappings)
      .where(and(eq(schema.accountMappings.kind, kind), eq(schema.accountMappings.key, useKey)));
    let row;
    if (existing) {
      [row] = await req.tenantClient
        .update(schema.accountMappings)
        .set({ accountId })
        .where(eq(schema.accountMappings.id, existing.id))
        .returning();
    } else {
      [row] = await req.tenantClient
        .insert(schema.accountMappings)
        .values({ id: crypto.randomUUID(), kind, key: useKey, accountId })
        .returning();
    }
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'AccountMapping',
      entityId: row.id,
      action: existing ? 'UPDATE' : 'CREATE',
      newValue: row,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.accountMappings)
      .where(eq(schema.accountMappings.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
