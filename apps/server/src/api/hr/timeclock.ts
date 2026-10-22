import { Router } from 'express';
import { and, eq, asc, gte, lte, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { createPunch } from '../../core/hr/timeclockService';
import { allowedActions, getWorkState } from '../../core/hr/timeclockState';
import { employeeQr } from '../../core/hr/timeclockCredentials';
import { sendTimeclockError } from '../../core/hr/timeclockTerminals';
import { fail } from '../../core/hr/timeclockTypes';
const router = Router();

router.post('/punch', async (req: any, res) => {
  try {
    const { kind, latitude, longitude, device, notes } = req.body;
    if (!['in', 'out', 'break_start', 'break_end'].includes(kind))
      fail(400, 'INVALID_INPUT', 'Acción inválida.');
    const [emp] = await req.tenantClient
      .select({ id: schema.employees.id, status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.userId, req.user?.id || ''));
    if (!emp || emp.status !== 'active')
      fail(403, 'EMPLOYEE_INACTIVE', 'No hay un empleado activo vinculado a tu usuario.');
    const result = await createPunch(req.tenantClient, {
      tenantId: req.tenantId,
      actorKey: 'user:' + req.user.id,
      requestId: req.body.requestId || crypto.randomUUID(),
      employeeId: emp.id,
      userId: req.user.id,
      kind,
      source: 'web',
      method: 'account',
      latitude,
      longitude,
      device,
      notes,
    });
    res.json({
      ...result.entry,
      state: result.state,
      allowedActions: result.allowedActions,
      replayed: result.replayed,
    });
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.get('/me/qr', async (req: any, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [emp] = await req.tenantClient
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(eq(schema.employees.userId, req.user?.id || ''), eq(schema.employees.status, 'active')),
      );
    if (!emp) fail(403, 'EMPLOYEE_INACTIVE', 'No hay un empleado activo vinculado.');
    res.json(await employeeQr(req.tenantClient, emp.id));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});

/** GET /entries?employeeId=&from=&to= */
router.get('/entries', async (req: any, res) => {
  try {
    const { employeeId, from, to } = req.query;
    const conds: any[] = [];
    if (employeeId) conds.push(eq(schema.timeclockEntries.employeeId, String(employeeId)));
    if (from) conds.push(gte(schema.timeclockEntries.at, new Date(String(from))));
    if (to) conds.push(lte(schema.timeclockEntries.at, new Date(String(to))));
    const rows = await req.tenantClient
      .select()
      .from(schema.timeclockEntries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.timeclockEntries.at));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /me — fichajes del empleado vinculado al usuario actual (último mes). */
router.get('/me', async (req: any, res) => {
  try {
    const [emp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.userId, req.user?.id || ''));
    if (!emp) return res.status(403).json({ error: 'No hay empleado vinculado a tu usuario' });
    const since = new Date();
    since.setDate(since.getDate() - 31);
    const rows = await req.tenantClient
      .select()
      .from(schema.timeclockEntries)
      .where(
        and(eq(schema.timeclockEntries.employeeId, emp.id), gte(schema.timeclockEntries.at, since)),
      )
      .orderBy(desc(schema.timeclockEntries.at));
    const state = await getWorkState(req.tenantClient, emp.id);
    res.json({
      employee: {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        code: emp.code,
        status: emp.status,
      },
      entries: rows,
      state,
      allowedActions: emp.status === 'active' ? allowedActions(state) : [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /summary?employeeId=&from=&to= — horas trabajadas vs contratadas vs
 * planificadas en el rango.
 */
router.get('/summary', async (req: any, res) => {
  try {
    const { employeeId, from, to } = req.query;
    if (!employeeId || !from || !to)
      return res.status(400).json({ error: 'employeeId, from y to obligatorios' });

    const entries = await req.tenantClient
      .select()
      .from(schema.timeclockEntries)
      .where(
        and(
          eq(schema.timeclockEntries.employeeId, String(employeeId)),
          gte(schema.timeclockEntries.at, new Date(String(from))),
          lte(schema.timeclockEntries.at, new Date(String(to))),
        ),
      )
      .orderBy(asc(schema.timeclockEntries.at));

    // Pares in/out — descontamos break_start/break_end.
    let workedMs = 0;
    let lastIn: Date | null = null;
    let breakStart: Date | null = null;
    let breakMs = 0;
    for (const e of entries) {
      const at = new Date(e.at);
      if (e.kind === 'in') lastIn = at;
      else if (e.kind === 'out' && lastIn) {
        workedMs += at.getTime() - lastIn.getTime();
        lastIn = null;
      } else if (e.kind === 'break_start') breakStart = at;
      else if (e.kind === 'break_end' && breakStart) {
        breakMs += at.getTime() - breakStart.getTime();
        breakStart = null;
      }
    }
    const workedHours = (workedMs - breakMs) / 3_600_000;

    // Planificado: suma de turnos materializados en el rango.
    const shifts = await req.tenantClient
      .select()
      .from(schema.shiftAssignments)
      .where(
        and(
          eq(schema.shiftAssignments.employeeId, String(employeeId)),
          gte(schema.shiftAssignments.date, String(from)),
          lte(schema.shiftAssignments.date, String(to)),
        ),
      );
    const plannedHours = shifts
      .filter((s: any) => s.status !== 'cancelled')
      .reduce((acc: number, s: any) => {
        const d =
          (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3_600_000 -
          (s.breakMinutes || 0) / 60;
        return acc + Math.max(0, d);
      }, 0);

    // Contratadas: workHoursPerWeek del contrato activo × semanas en el rango.
    const [contract] = await req.tenantClient
      .select()
      .from(schema.contracts)
      .where(
        and(
          eq(schema.contracts.employeeId, String(employeeId)),
          eq(schema.contracts.isActive, true),
        ),
      )
      .limit(1);
    const wph = Number(contract?.workHoursPerWeek || 0);
    const days = (new Date(String(to)).getTime() - new Date(String(from)).getTime()) / 86_400_000;
    const contractedHours = (wph * days) / 7;

    res.json({
      workedHours,
      plannedHours,
      contractedHours,
      diffWorkedVsContracted: workedHours - contractedHours,
      diffWorkedVsPlanned: workedHours - plannedHours,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /export?employeeId=&from=&to=&format=csv|json
 * Devuelve los fichajes en CSV (Excel-friendly, separador ';' y BOM UTF-8)
 * o JSON. Útil para enviar al gestor laboral o auditoría.
 */
router.get('/export', async (req: any, res) => {
  try {
    const { employeeId, from, to } = req.query as Record<string, string>;
    const format = (req.query.format as string) || 'csv';
    const conds: any[] = [];
    if (employeeId) conds.push(eq(schema.timeclockEntries.employeeId, employeeId));
    if (from) conds.push(gte(schema.timeclockEntries.at, new Date(from)));
    if (to) conds.push(lte(schema.timeclockEntries.at, new Date(to)));
    const rows: any[] = await req.tenantClient
      .select()
      .from(schema.timeclockEntries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.timeclockEntries.at));

    // Resuelve nombres de empleados de un golpe.
    const empIds = Array.from(new Set(rows.map((r) => r.employeeId)));
    const emps = empIds.length
      ? await req.tenantClient
          .select()
          .from(schema.employees)
          .where(inArrayCompat(schema.employees.id, empIds))
      : [];
    const empMap = new Map(emps.map((e: any) => [e.id, e]));

    const enriched = rows.map((r) => {
      const e: any = empMap.get(r.employeeId);
      return {
        fecha: new Date(r.at).toISOString().slice(0, 10),
        hora: new Date(r.at).toISOString().slice(11, 19),
        empleadoId: r.employeeId,
        empleadoCodigo: e?.code || '',
        empleadoNombre: e ? `${e.firstName} ${e.lastName}` : '',
        tipo: r.kind,
        origen: r.source || '',
        metodo: r.method || '',
        kiosco: r.kioskId || '',
        lector: r.deviceId || '',
        notas: (r.notes || '').replace(/[\r\n;]/g, ' '),
      };
    });

    if (format === 'json') {
      return res.json(enriched);
    }
    const headerRow = [
      'Fecha',
      'Hora',
      'EmpleadoID',
      'Codigo',
      'Nombre',
      'Tipo',
      'Origen',
      'Notas',
      'Metodo',
      'Kiosco',
      'Lector',
    ].join(';');
    const lines = enriched.map((r) =>
      [
        r.fecha,
        r.hora,
        r.empleadoId,
        r.empleadoCodigo,
        r.empleadoNombre,
        r.tipo,
        r.origen,
        r.notas,
        r.metodo,
        r.kiosco,
        r.lector,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';'),
    );
    const csv = '﻿' + headerRow + '\n' + lines.join('\n');
    const filename = `fichajes_${from || 'all'}_${to || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compat helper para `inArray` de drizzle sin import explícito arriba.
function inArrayCompat(col: any, ids: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { inArray } = require('drizzle-orm');
  return inArray(col, ids);
}

export default router;
