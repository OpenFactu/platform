import { Router } from 'express';
import { and, eq, asc, desc, gte, lte, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';
import { JournalEngine } from '../core/accounting/JournalEngine';
import { broadcastEvent } from '../core/realtime/EventSocket';

const router = Router();

/**
 * GET /api/journal-entries
 * Filtros: periodId, source, status, accountId, partnerId, from, to.
 */
router.get('/', async (req: any, res) => {
  try {
    const { periodId, source, status, from, to } = req.query;
    const conds: any[] = [];
    if (periodId) conds.push(eq(schema.journalEntries.periodId, periodId));
    if (source) conds.push(eq(schema.journalEntries.source, source));
    if (status) conds.push(eq(schema.journalEntries.status, status));
    if (from) conds.push(gte(schema.journalEntries.date, new Date(from)));
    if (to) conds.push(lte(schema.journalEntries.date, new Date(to)));

    const rows = await req.tenantClient
      .select()
      .from(schema.journalEntries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.journalEntries.date), desc(schema.journalEntries.number));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [entry] = await req.tenantClient
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, req.params.id));
    if (!entry) return res.status(404).json({ error: 'Asiento no encontrado' });
    const lines = await req.tenantClient
      .select()
      .from(schema.journalEntryLines)
      .where(eq(schema.journalEntryLines.entryId, req.params.id))
      .orderBy(asc(schema.journalEntryLines.lineNumber));
    res.json({ ...entry, lines });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/journal-entries — crea un asiento en draft.
 * Body: { date, periodId, description, lines: [{ accountId, debit, credit, ... }] }
 */
router.post('/', async (req: any, res) => {
  try {
    const { id } = await JournalEngine.create(req.tenantClient, {
      ...req.body,
      createdBy: req.user?.id,
    });
    const [row] = await req.tenantClient
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, id));
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'JournalEntry',
      entityId: id,
      action: 'CREATE',
      newValue: row,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/journal-entries/:id/post — postea (asigna número, inmutable).
 */
router.post('/:id/post', async (req: any, res) => {
  try {
    await JournalEngine.post(req.tenantClient, req.params.id, req.user?.id);
    const [row] = await req.tenantClient
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, req.params.id));
    res.json(row);
    if (req.tenantId) {
      broadcastEvent(req.tenantId, {
        type: 'journalEntry.posted',
        payload: { id: row.id, number: row.number, date: row.date },
      });
    }
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'JournalEntry',
      entityId: req.params.id,
      action: 'POST',
      newValue: row,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/journal-entries/:id/reverse — crea contra-asiento.
 */
router.post('/:id/reverse', async (req: any, res) => {
  try {
    const { reversalId } = await JournalEngine.reverse(
      req.tenantClient,
      req.params.id,
      req.user?.id,
      req.body?.description,
    );
    res.json({ reversalId });
    if (req.tenantId) {
      broadcastEvent(req.tenantId, {
        type: 'journalEntry.reversed',
        payload: { id: req.params.id, reversalId },
      });
    }
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'JournalEntry',
      entityId: req.params.id,
      action: 'REVERSE',
      newValue: { reversalId },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Mayor por cuenta: todas las líneas posted que tocan la cuenta, con saldo
 * corriente. Filtros: from, to, periodId.
 */
router.get('/ledger/:accountId', async (req: any, res) => {
  try {
    const { from, to, periodId } = req.query;
    const headConds: any[] = [eq(schema.journalEntries.status, 'posted')];
    if (periodId) headConds.push(eq(schema.journalEntries.periodId, periodId));
    if (from) headConds.push(gte(schema.journalEntries.date, new Date(from)));
    if (to) headConds.push(lte(schema.journalEntries.date, new Date(to)));

    const rows = await req.tenantClient
      .select({
        lineId: schema.journalEntryLines.id,
        entryId: schema.journalEntryLines.entryId,
        entryNumber: schema.journalEntries.number,
        entryDate: schema.journalEntries.date,
        description: schema.journalEntryLines.description,
        headerDescription: schema.journalEntries.description,
        debit: schema.journalEntryLines.debit,
        credit: schema.journalEntryLines.credit,
        partnerId: schema.journalEntryLines.partnerId,
      })
      .from(schema.journalEntryLines)
      .innerJoin(
        schema.journalEntries,
        eq(schema.journalEntryLines.entryId, schema.journalEntries.id),
      )
      .where(and(eq(schema.journalEntryLines.accountId, req.params.accountId), and(...headConds)))
      .orderBy(asc(schema.journalEntries.date), asc(schema.journalEntries.number));

    let running = 0;
    const enriched = rows.map((r: any) => {
      running += Number(r.debit) - Number(r.credit);
      return { ...r, runningBalance: running };
    });
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Balance de sumas y saldos por tipo de cuenta para un período.
 * GET /api/journal-entries/balance?periodId=xxx
 */
router.get('/reports/balance', async (req: any, res) => {
  try {
    const { periodId } = req.query;
    if (!periodId) return res.status(400).json({ error: 'periodId obligatorio' });

    const rows = await req.tenantClient
      .select({
        accountId: schema.journalEntryLines.accountId,
        code: schema.chartOfAccounts.code,
        name: schema.chartOfAccounts.name,
        type: schema.chartOfAccounts.type,
        totalDebit: sql<string>`COALESCE(SUM(${schema.journalEntryLines.debit}), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${schema.journalEntryLines.credit}), 0)`,
      })
      .from(schema.journalEntryLines)
      .innerJoin(
        schema.journalEntries,
        eq(schema.journalEntryLines.entryId, schema.journalEntries.id),
      )
      .innerJoin(
        schema.chartOfAccounts,
        eq(schema.journalEntryLines.accountId, schema.chartOfAccounts.id),
      )
      .where(
        and(
          eq(schema.journalEntries.periodId, periodId),
          eq(schema.journalEntries.status, 'posted'),
        ),
      )
      .groupBy(
        schema.journalEntryLines.accountId,
        schema.chartOfAccounts.code,
        schema.chartOfAccounts.name,
        schema.chartOfAccounts.type,
      )
      .orderBy(asc(schema.chartOfAccounts.code));

    res.json(
      rows.map((r: any) => ({
        ...r,
        totalDebit: Number(r.totalDebit),
        totalCredit: Number(r.totalCredit),
        balance: Number(r.totalDebit) - Number(r.totalCredit),
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
