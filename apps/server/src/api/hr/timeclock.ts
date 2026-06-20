import { Router } from 'express';
import { and, eq, asc, gte, lte, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

const VALID_KIND = new Set(['in', 'out', 'break_start', 'break_end']);

// Estados del fichador (state machine):
//   - 'closed'   → último evento fue 'out' o no hay eventos hoy.
//   - 'working'  → entrada activa, no en pausa.
//   - 'on_break' → entrada activa y en pausa.
type WorkState = 'closed' | 'working' | 'on_break';

// Transiciones permitidas para cada kind. Si el último evento del día deja
// el fichador en `state`, sólo se permiten ciertas acciones.
const ALLOWED: Record<WorkState, Record<string, true>> = {
  closed: { in: true },
  working: { out: true, break_start: true },
  on_break: { break_end: true },
};

const STATE_LABEL: Record<WorkState, string> = {
  closed: 'sin entrada activa',
  working: 'trabajando',
  on_break: 'en pausa',
};

const KIND_LABEL: Record<string, string> = {
  in: 'entrada',
  out: 'salida',
  break_start: 'inicio de pausa',
  break_end: 'fin de pausa',
};

/**
 * Reconstruye el estado actual del fichador a partir de los eventos del día
 * (intervalo de 24h hacia atrás desde `now`). Recorre en orden cronológico y
 * aplica la máquina de estados ignorando entradas inválidas históricas para
 * que un PIN incorrecto pasado no bloquee al empleado para siempre.
 */
async function getWorkState(client: any, employeeId: string, now: Date): Promise<WorkState> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const entries: any[] = await client
    .select()
    .from(schema.timeclockEntries)
    .where(
      and(
        eq(schema.timeclockEntries.employeeId, employeeId),
        gte(schema.timeclockEntries.at, since),
        lte(schema.timeclockEntries.at, now),
      ),
    )
    .orderBy(asc(schema.timeclockEntries.at));
  let state: WorkState = 'closed';
  for (const e of entries) {
    if (state === 'closed' && e.kind === 'in') state = 'working';
    else if (state === 'working' && e.kind === 'out') state = 'closed';
    else if (state === 'working' && e.kind === 'break_start') state = 'on_break';
    else if (state === 'on_break' && e.kind === 'break_end') state = 'working';
    // Cualquier otra transición se ignora (corrupción histórica).
  }
  return state;
}

/**
 * Crea un fichaje validando que la transición sea legal. Devuelve el row
 * insertado, o lanza con un mensaje claro si la transición es inválida.
 * Encapsula la lógica común a `/punch` y `/kiosk/punch`.
 */
async function createPunchValidated(
  client: any,
  values: {
    employeeId: string;
    userId: string | null;
    kind: string;
    source: 'web' | 'kiosk' | 'admin';
    latitude?: any;
    longitude?: any;
    device?: string | null;
    notes?: string | null;
  },
): Promise<any> {
  const now = new Date();
  const state = await getWorkState(client, values.employeeId, now);
  if (!ALLOWED[state][values.kind]) {
    const err: any = new Error(
      `No puedes registrar "${KIND_LABEL[values.kind]}" estando ${STATE_LABEL[state]}.`,
    );
    err.statusCode = 409;
    throw err;
  }
  // Anti-rebote: bloqueamos dos fichajes del mismo empleado a < 5 segundos.
  const recent = await client
    .select()
    .from(schema.timeclockEntries)
    .where(
      and(
        eq(schema.timeclockEntries.employeeId, values.employeeId),
        gte(schema.timeclockEntries.at, new Date(now.getTime() - 5_000)),
      ),
    )
    .limit(1);
  if (recent.length > 0) {
    const err: any = new Error('Has fichado hace menos de 5 segundos. Espera un momento.');
    err.statusCode = 429;
    throw err;
  }
  const id = crypto.randomUUID();
  const [row] = await client
    .insert(schema.timeclockEntries)
    .values({
      id,
      employeeId: values.employeeId,
      userId: values.userId,
      kind: values.kind,
      at: now,
      source: values.source,
      latitude: values.latitude != null ? String(values.latitude) : null,
      longitude: values.longitude != null ? String(values.longitude) : null,
      device: values.device || null,
      notes: values.notes || null,
    })
    .returning();
  return row;
}

/** POST /punch — el usuario autenticado ficha lo suyo. */
router.post('/punch', async (req: any, res) => {
  try {
    const { kind, latitude, longitude, device, notes } = req.body;
    if (!VALID_KIND.has(kind)) return res.status(400).json({ error: 'kind inválido' });
    const [emp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.userId, req.user?.id || ''));
    if (!emp) return res.status(403).json({ error: 'No hay empleado vinculado a tu usuario' });
    if (emp.status !== 'active')
      return res.status(403).json({ error: 'El empleado no está activo' });

    const row = await createPunchValidated(req.tenantClient, {
      employeeId: emp.id,
      userId: req.user?.id || null,
      kind,
      source: 'web',
      latitude,
      longitude,
      device,
      notes,
    });
    res.json(row);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * POST /kiosk/punch — fichaje desde kiosko compartido.
 *  Headers: x-kiosk-token: <token>
 *  Body: { pin: string, kind: 'in'|'out'|... }
 */
router.post('/kiosk/punch', async (req: any, res) => {
  try {
    const token = req.headers['x-kiosk-token'];
    if (!token) return res.status(401).json({ error: 'Falta x-kiosk-token' });
    const [kiosk] = await req.tenantClient
      .select()
      .from(schema.timeclockKiosks)
      .where(eq(schema.timeclockKiosks.token, String(token)));
    if (!kiosk || !kiosk.isActive) return res.status(401).json({ error: 'Kiosko no autorizado' });

    const { pin, kind } = req.body;
    if (!pin || !VALID_KIND.has(kind))
      return res.status(400).json({ error: 'pin y kind válidos requeridos' });
    const [emp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(
        and(eq(schema.employees.kioskPin, String(pin)), eq(schema.employees.status, 'active')),
      );
    if (!emp) return res.status(404).json({ error: 'PIN no reconocido' });

    const row = await createPunchValidated(req.tenantClient, {
      employeeId: emp.id,
      userId: null,
      kind,
      source: 'kiosk',
      device: kiosk.name,
    });
    res.json({ ...row, employeeName: `${emp.firstName} ${emp.lastName}` });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
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
    res.json({ employee: emp, entries: rows });
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
    ].join(';');
    const lines = enriched.map((r) =>
      [r.fecha, r.hora, r.empleadoId, r.empleadoCodigo, r.empleadoNombre, r.tipo, r.origen, r.notas]
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
