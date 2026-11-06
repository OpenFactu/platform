import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { logAudit } from '../../utils/audit';
import { LocalizationInstaller } from '../../core/localization/LocalizationInstaller';

const router = Router();

const VALID_KIND = new Set(['devengo', 'deduccion', 'aportacion_empresa']);
const VALID_CALC = new Set(['fixed', 'percent_of_base', 'per_hour']);
const VALID_CATEGORY = new Set(['income_tax', 'social_employee', 'social_employer']);

/** Los dos marcadores de "sujeto a", con su nombre genérico y el anterior. */
function taxableFlags(body: any): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const [neutral, legacy] of [
    ['taxableIncomeTax', 'taxableIrpf'],
    ['taxableSocial', 'taxableSs'],
  ]) {
    const value = body[neutral] ?? body[legacy];
    if (value !== undefined) {
      flags[neutral] = value;
      flags[legacy] = value;
    }
  }
  return flags;
}

/** GET /api/hr/payroll-concepts?activeOnly=true&kind= */
router.get('/', async (req: any, res) => {
  try {
    const { activeOnly, kind } = req.query;
    const conds: any[] = [];
    if (activeOnly === 'true') conds.push(eq(schema.payrollConcepts.isActive, true));
    if (kind) conds.push(eq(schema.payrollConcepts.kind, String(kind)));
    const rows = await req.tenantClient
      .select()
      .from(schema.payrollConcepts)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.payrollConcepts.code));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.payrollConcepts)
      .where(eq(schema.payrollConcepts.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Concepto no encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const {
      code,
      name,
      kind,
      category,
      calculation,
      defaultAmount,
      defaultPercent,
      accountId,
      isActive,
    } = req.body;
    if (!code || !name || !kind) {
      return res.status(400).json({ error: 'code, name y kind son obligatorios' });
    }
    if (!VALID_KIND.has(kind)) {
      return res.status(400).json({ error: `kind inválido: ${kind}` });
    }
    if (calculation && !VALID_CALC.has(calculation)) {
      return res.status(400).json({ error: `calculation inválido: ${calculation}` });
    }
    if (category && !VALID_CATEGORY.has(category)) {
      return res.status(400).json({ error: `category inválido: ${category}` });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.payrollConcepts)
      .values({
        id,
        code,
        name,
        kind,
        category: category || null,
        ...taxableFlags(req.body),
        calculation: calculation || 'fixed',
        defaultAmount: defaultAmount != null ? String(defaultAmount) : null,
        defaultPercent: defaultPercent != null ? String(defaultPercent) : null,
        accountId: accountId || null,
        isActive: isActive ?? true,
      })
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PayrollConcept',
      entityId: id,
      action: 'CREATE',
      newValue: row,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const patch: Record<string, any> = {};
    const allow = [
      'code',
      'name',
      'kind',
      'category',
      'calculation',
      'accountId',
      'isActive',
    ];
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    Object.assign(patch, taxableFlags(req.body));
    if (patch.category === '') patch.category = null;
    if (patch.category && !VALID_CATEGORY.has(patch.category))
      return res.status(400).json({ error: `category inválido: ${patch.category}` });
    if (patch.kind && !VALID_KIND.has(patch.kind))
      return res.status(400).json({ error: `kind inválido: ${patch.kind}` });
    if (patch.calculation && !VALID_CALC.has(patch.calculation))
      return res.status(400).json({ error: `calculation inválido: ${patch.calculation}` });
    if ('defaultAmount' in req.body)
      patch.defaultAmount = req.body.defaultAmount != null ? String(req.body.defaultAmount) : null;
    if ('defaultPercent' in req.body)
      patch.defaultPercent =
        req.body.defaultPercent != null ? String(req.body.defaultPercent) : null;
    patch.updatedAt = new Date();
    const [row] = await req.tenantClient
      .update(schema.payrollConcepts)
      .set(patch)
      .where(eq(schema.payrollConcepts.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Concepto no encontrado' });
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PayrollConcept',
      entityId: req.params.id,
      action: 'UPDATE',
      newValue: row,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    // Soft-delete: marcar inactivo. Si nunca se ha usado, se borra de verdad.
    const used = await req.tenantClient
      .select({ id: schema.payrollLines.id })
      .from(schema.payrollLines)
      .where(eq(schema.payrollLines.conceptId, req.params.id))
      .limit(1);
    if (used.length) {
      const [row] = await req.tenantClient
        .update(schema.payrollConcepts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.payrollConcepts.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: 'Concepto no encontrado' });
      return res.json({ success: true, softDeleted: true });
    }
    const [row] = await req.tenantClient
      .delete(schema.payrollConcepts)
      .where(eq(schema.payrollConcepts.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Concepto no encontrado' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/hr/payroll-concepts/seed-defaults
 * Crea (idempotente) el catálogo de conceptos de los paquetes de localización
 * activos. Sólo inserta los códigos que aún no existen.
 */
router.post('/seed-defaults', async (req: any, res) => {
  try {
    res.json(await LocalizationInstaller.applyPayrollCatalog(req.tenantId, req.tenantClient));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
