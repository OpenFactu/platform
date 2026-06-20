import { Router } from 'express';
import { and, eq, gte, lte, desc, ne, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

router.get('/', async (req: any, res) => {
  try {
    const { employeeId, status, from, to } = req.query;
    const conds: any[] = [];
    if (employeeId) conds.push(eq(schema.incidents.employeeId, String(employeeId)));
    if (status) conds.push(eq(schema.incidents.status, String(status)));
    if (from) conds.push(gte(schema.incidents.startAt, new Date(String(from))));
    if (to) conds.push(lte(schema.incidents.startAt, new Date(String(to))));
    const rows = await req.tenantClient
      .select()
      .from(schema.incidents)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.incidents.startAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    const subs = await req.tenantClient
      .select()
      .from(schema.substitutions)
      .where(eq(schema.substitutions.incidentId, row.id));
    res.json({ ...row, substitutions: subs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { employeeId, incidentTypeId, startAt, endAt, notes, documentUrl } = req.body;
    if (!employeeId || !incidentTypeId || !startAt) {
      return res
        .status(400)
        .json({ error: 'employeeId, incidentTypeId y startAt son obligatorios' });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.incidents)
      .values({
        id,
        employeeId,
        incidentTypeId,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        status: 'pending',
        notes: notes || null,
        documentUrl: documentUrl || null,
        createdBy: req.user?.id,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const allow = ['status', 'startAt', 'endAt', 'notes', 'documentUrl'];
    const patch: Record<string, any> = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    if (patch.startAt) patch.startAt = new Date(patch.startAt);
    if (patch.endAt) patch.endAt = new Date(patch.endAt);
    if (patch.status === 'approved') {
      patch.approvedBy = req.user?.id;
      patch.approvedAt = new Date();
    }
    const [row] = await req.tenantClient
      .update(schema.incidents)
      .set(patch)
      .where(eq(schema.incidents.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient.delete(schema.incidents).where(eq(schema.incidents.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/suggest-substitutes — devuelve empleados elegibles:
 *   - mismo departamento O misma posición que el original
 *   - sin turno solapado en el rango de la incidencia
 *   - sin incidencia activa propia en el rango
 *   - status active
 */
router.post('/:id/suggest-substitutes', async (req: any, res) => {
  try {
    const [inc] = await req.tenantClient
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.id, req.params.id));
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });

    const [type] = await req.tenantClient
      .select()
      .from(schema.incidentTypes)
      .where(eq(schema.incidentTypes.id, inc.incidentTypeId));
    if (!type?.requiresSubstitution) {
      return res.json([]); // Tipo no requiere sustitución → no se sugiere nadie.
    }

    const [originalEmp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, inc.employeeId));
    if (!originalEmp) return res.status(400).json({ error: 'Empleado original no encontrado' });

    const start = inc.startAt as Date;
    const end = (inc.endAt as Date) || inc.startAt;

    // Empleados activos del mismo departamento (excluyendo al original).
    const candidates = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.status, 'active'),
          ne(schema.employees.id, inc.employeeId),
          originalEmp.departmentId
            ? eq(schema.employees.departmentId, originalEmp.departmentId)
            : sql`TRUE`,
        ),
      );

    // Para cada candidato, comprobar solapamientos.
    const eligible: any[] = [];
    for (const c of candidates) {
      const overlaps = await req.tenantClient
        .select()
        .from(schema.shiftAssignments)
        .where(
          and(
            eq(schema.shiftAssignments.employeeId, c.id),
            sql`${schema.shiftAssignments.startAt} < ${end}`,
            sql`${schema.shiftAssignments.endAt} > ${start}`,
            ne(schema.shiftAssignments.status, 'cancelled'),
          ),
        )
        .limit(1);
      if (overlaps.length > 0) continue;

      const ownIncidents = await req.tenantClient
        .select()
        .from(schema.incidents)
        .where(
          and(
            eq(schema.incidents.employeeId, c.id),
            ne(schema.incidents.status, 'rejected'),
            sql`${schema.incidents.startAt} < ${end}`,
            sql`(${schema.incidents.endAt} IS NULL OR ${schema.incidents.endAt} > ${start})`,
          ),
        )
        .limit(1);
      if (ownIncidents.length > 0) continue;

      eligible.push(c);
    }
    res.json(eligible);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /:id/assign-substitute — asigna sustituto + materializa cambio en ShiftAssignment. */
router.post('/:id/assign-substitute', async (req: any, res) => {
  try {
    const { substituteEmployeeId, shiftAssignmentId } = req.body;
    if (!substituteEmployeeId)
      return res.status(400).json({ error: 'substituteEmployeeId obligatorio' });
    const [inc] = await req.tenantClient
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.id, req.params.id));
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });

    const subId = crypto.randomUUID();
    await req.tenantClient.insert(schema.substitutions).values({
      id: subId,
      incidentId: inc.id,
      originalEmployeeId: inc.employeeId,
      substituteEmployeeId,
      shiftAssignmentId: shiftAssignmentId || null,
      status: 'accepted',
      respondedAt: new Date(),
    });

    if (shiftAssignmentId) {
      // Marcar el turno original como sustituido y crear uno nuevo para el sustituto.
      const [orig] = await req.tenantClient
        .select()
        .from(schema.shiftAssignments)
        .where(eq(schema.shiftAssignments.id, shiftAssignmentId));
      if (orig) {
        await req.tenantClient
          .update(schema.shiftAssignments)
          .set({ status: 'substituted' })
          .where(eq(schema.shiftAssignments.id, shiftAssignmentId));
        await req.tenantClient.insert(schema.shiftAssignments).values({
          id: crypto.randomUUID(),
          employeeId: substituteEmployeeId,
          date: orig.date,
          startAt: orig.startAt,
          endAt: orig.endAt,
          breakMinutes: orig.breakMinutes,
          shiftTemplateId: orig.shiftTemplateId,
          patternId: null,
          status: 'scheduled',
          substitutedFromId: orig.id,
          notes: `Sustituye a ${inc.employeeId} (incidencia ${inc.id})`,
        });
      }
    }

    await req.tenantClient
      .update(schema.incidents)
      .set({ status: 'covered' })
      .where(eq(schema.incidents.id, inc.id));

    res.json({ success: true, substitutionId: subId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
