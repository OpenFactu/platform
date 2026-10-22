import { writeEmployeeWithPin } from '../../core/hr/timeclockCredentials';
import { Router } from 'express';
import { eq, asc, desc, like } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { logAudit } from '../../utils/audit';
import { validateIban, normalizeIban } from '../../utils/ibanValidation';

const router = Router();
const auditEmployee = (row: any) => {
  if (!row) return row;
  const { kioskPin, ...safe } = row;
  return safe;
};

const ALLOWED_STATUS = new Set(['active', 'leave', 'terminated']);
const ALLOWED_FIELDS = [
  'code',
  'firstName',
  'lastName',
  'dni',
  'email',
  'phone',
  'birthDate',
  'hireDate',
  'terminationDate',
  'address',
  'iban',
  'departmentId',
  'costCenterId',
  'profitCenterId',
  'status',
  'userId',
  'kioskPin',
  'notes',
];

function coerce(body: any) {
  const out: any = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) out[k] = body[k] === '' ? null : body[k];
  }
  return out;
}

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.employees)
      .orderBy(asc(schema.employees.code));
    res.json(rows);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Empleado no encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/** Genera el siguiente código secuencial EMP-NNNNN a partir del máximo actual. */
async function nextEmployeeCode(tenantClient: any): Promise<string> {
  const rows = await tenantClient
    .select({ code: schema.employees.code })
    .from(schema.employees)
    .where(like(schema.employees.code, 'EMP-%'))
    .orderBy(desc(schema.employees.code))
    .limit(1);
  let max = 0;
  const last = rows[0]?.code as string | undefined;
  if (last) {
    const n = parseInt(last.split('-')[1] || '0', 10);
    if (!Number.isNaN(n)) max = n;
  }
  return `EMP-${String(max + 1).padStart(5, '0')}`;
}

router.post('/', async (req: any, res) => {
  try {
    const payload = coerce(req.body);
    if (!payload.firstName || !payload.lastName) {
      return res.status(400).json({ error: 'firstName y lastName son obligatorios' });
    }
    if (payload.status && !ALLOWED_STATUS.has(payload.status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    if (payload.iban) {
      const check = validateIban(payload.iban);
      if (!check.ok) return res.status(400).json({ error: `IBAN inválido: ${check.reason}` });
      payload.iban = normalizeIban(payload.iban);
    }
    // Código automático si no viene o está vacío.
    if (!payload.code) {
      payload.code = await nextEmployeeCode(req.tenantClient);
    }
    const id = crypto.randomUUID();
    const [row] = await writeEmployeeWithPin(req.tenantClient, id, payload, (tx) =>
      tx
        .insert(schema.employees)
        .values({ id, status: 'active', ...payload })
        .returning(),
    );
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Employee',
      entityId: id,
      action: 'CREATE',
      newValue: auditEmployee(row),
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, id));
    if (!old) return res.status(404).json({ error: 'Empleado no encontrado' });
    const payload: any = coerce(req.body);
    if (payload.status && !ALLOWED_STATUS.has(payload.status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    if (payload.iban) {
      const check = validateIban(payload.iban);
      if (!check.ok) return res.status(400).json({ error: `IBAN inválido: ${check.reason}` });
      payload.iban = normalizeIban(payload.iban);
    }
    payload.updatedAt = new Date();
    const [row] = await writeEmployeeWithPin(req.tenantClient, id, payload, (tx) =>
      tx.update(schema.employees).set(payload).where(eq(schema.employees.id, id)).returning(),
    );
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Employee',
      entityId: id,
      action: 'UPDATE',
      oldValue: auditEmployee(old),
      newValue: auditEmployee(row),
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, id));
    await req.tenantClient.delete(schema.employees).where(eq(schema.employees.id, id));
    res.json({ success: true });
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'Employee',
        entityId: id,
        action: 'DELETE',
        oldValue: auditEmployee(old),
      });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
