import { Router } from 'express';
import { and, eq, asc, desc, like, gte, lte, or, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

const ALLOWED = [
  'title',
  'description',
  'status',
  'priority',
  'assigneeId',
  'internalOrderId',
  'departmentId',
  'startDate',
  'dueDate',
  'startAt',
  'endAt',
  'estimatedHours',
  'actualHours',
  'progress',
  'parentTaskId',
  'notes',
];

function coerce(body: any) {
  const out: any = {};
  for (const k of ALLOWED) {
    if (!(k in body)) continue;
    const v = body[k] === '' ? null : body[k];
    if ((k === 'startAt' || k === 'endAt') && typeof v === 'string') {
      out[k] = new Date(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function nextTaskCode(tenantClient: any): Promise<string> {
  const rows = await tenantClient
    .select({ code: schema.tasks.code })
    .from(schema.tasks)
    .where(like(schema.tasks.code, 'TSK-%'))
    .orderBy(desc(schema.tasks.code))
    .limit(1);
  let max = 0;
  const last = rows[0]?.code as string | undefined;
  if (last) {
    const n = parseInt(last.split('-')[1] || '0', 10);
    if (!Number.isNaN(n)) max = n;
  }
  return `TSK-${String(max + 1).padStart(5, '0')}`;
}

router.get('/', async (req: any, res) => {
  try {
    const { assigneeId, status, projectId, from, to } = req.query;
    const conds: any[] = [];
    if (assigneeId) conds.push(eq(schema.tasks.assigneeId, String(assigneeId)));
    if (status) conds.push(eq(schema.tasks.status, String(status)));
    if (projectId) conds.push(eq(schema.tasks.internalOrderId, String(projectId)));
    if (to) conds.push(lte(schema.tasks.startDate, String(to)));
    if (from) conds.push(gte(schema.tasks.dueDate, String(from)));
    const rows = await req.tenantClient
      .select()
      .from(schema.tasks)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.tasks.startDate));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gantt', async (req: any, res) => {
  try {
    const { from, to, projectId } = req.query;
    const conds: any[] = [];
    if (projectId) conds.push(eq(schema.tasks.internalOrderId, String(projectId)));
    // Solapamiento con la ventana, e incluir las tareas sin fechas (sin programar):
    //   (startDate IS NULL OR startDate <= to)
    //   AND (dueDate IS NULL OR dueDate >= from)
    if (to) conds.push(or(isNull(schema.tasks.startDate), lte(schema.tasks.startDate, String(to))));
    if (from) conds.push(or(isNull(schema.tasks.dueDate), gte(schema.tasks.dueDate, String(from))));
    const tasks = await req.tenantClient
      .select()
      .from(schema.tasks)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.tasks.startDate));
    const deps = await req.tenantClient.select().from(schema.taskDependencies);
    res.json({ tasks, dependencies: deps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Tarea no encontrada' });
    const deps = await req.tenantClient
      .select()
      .from(schema.taskDependencies)
      .where(eq(schema.taskDependencies.successorId, row.id));
    const comments = await req.tenantClient
      .select()
      .from(schema.taskComments)
      .where(eq(schema.taskComments.taskId, row.id))
      .orderBy(asc(schema.taskComments.at));
    res.json({ ...row, dependencies: deps, comments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload = coerce(req.body);
    if (!payload.title) return res.status(400).json({ error: 'title obligatorio' });
    if (!payload.code) payload.code = await nextTaskCode(req.tenantClient);
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.tasks)
      .values({ id, ...payload, createdBy: req.user?.id || null })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const patch = coerce(req.body);
    if (patch.status === 'done') (patch as any).closedAt = new Date();
    const [row] = await req.tenantClient
      .update(schema.tasks)
      .set(patch)
      .where(eq(schema.tasks.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient.delete(schema.tasks).where(eq(schema.tasks.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Dependencias ──────────────────────────────────────────────────
router.post('/:id/dependencies', async (req: any, res) => {
  try {
    const { predecessorId, kind, lagDays } = req.body;
    if (!predecessorId) return res.status(400).json({ error: 'predecessorId obligatorio' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.taskDependencies)
      .values({
        id,
        predecessorId,
        successorId: req.params.id,
        kind: kind || 'finish_to_start',
        lagDays: lagDays || 0,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/dependencies/:depId', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.taskDependencies)
      .where(eq(schema.taskDependencies.id, req.params.depId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comentarios ───────────────────────────────────────────────────
router.post('/:id/comments', async (req: any, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'body obligatorio' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.taskComments)
      .values({ id, taskId: req.params.id, userId: req.user?.id || null, body })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
