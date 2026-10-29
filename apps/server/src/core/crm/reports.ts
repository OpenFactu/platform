/**
 * Informes del CRM. Todas las consultas van acotadas por periodo [from, to].
 * El embudo (conversión y tiempo por etapa) se calcula en `funnelFromHistory`,
 * que es pura para poder probarla sin base de datos.
 */
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { summarizeResponses, type FormField } from './forms';

export interface Period {
  from: Date;
  to: Date;
}

const DAY = 86_400_000;
const num = (v: unknown) => Number(v ?? 0) || 0;
const rowsOf = (r: any) => (Array.isArray(r) ? r : (r?.rows ?? []));

// ── Previsión ──────────────────────────────────────────────────────────────

/** Abiertas por mes de cierre previsto (importe y ponderado) y lo ganado por mes de cierre. */
export async function forecastReport(db: any, period: Period) {
  const open = rowsOf(
    await db.execute(sql`
      SELECT to_char(date_trunc('month', o."expectedCloseDate"), 'YYYY-MM') AS month,
             count(*)::int AS n,
             coalesce(sum(o.amount), 0) AS amount,
             coalesce(sum(o.amount * s.probability / 100.0), 0) AS weighted
        FROM "Opportunity" o JOIN "OpportunityStage" s ON s.id = o."stageId"
       WHERE s.kind = 'open'
       GROUP BY 1 ORDER BY 1 NULLS LAST`),
  );
  const won = rowsOf(
    await db.execute(sql`
      SELECT to_char(date_trunc('month', o."closedAt"), 'YYYY-MM') AS month,
             count(*)::int AS n, coalesce(sum(o.amount), 0) AS amount
        FROM "Opportunity" o JOIN "OpportunityStage" s ON s.id = o."stageId"
       WHERE s.kind = 'won' AND o."closedAt" BETWEEN ${period.from} AND ${period.to}
       GROUP BY 1 ORDER BY 1`),
  );
  return {
    open: open.map((r: any) => ({
      month: r.month ?? null,
      count: num(r.n),
      amount: num(r.amount),
      weighted: Math.round(num(r.weighted) * 100) / 100,
    })),
    won: won.map((r: any) => ({ month: r.month, count: num(r.n), amount: num(r.amount) })),
  };
}

// ── Embudo ────────────────────────────────────────────────────────────────

export interface FunnelStage {
  id: string;
  name: string;
  kind: string;
  sortOrder: number;
}
export interface FunnelStageResult {
  stageId: string;
  name: string;
  kind: string;
  /** Oportunidades de la cohorte que pasaron por la etapa. */
  reached: number;
  /** % de las que llegaron aquí que llegaron también a la siguiente etapa abierta o a ganada. */
  conversion: number | null;
  /** Días medios en la etapa (solo estancias ya terminadas). */
  avgDays: number | null;
}

/**
 * Embudo de una cohorte de oportunidades a partir de su historial de etapas.
 * La etapa inicial de cada una es la `fromStageId` de su primer cambio, o la
 * actual si nunca se movió. Las etapas abiertas convierten hacia la siguiente
 * abierta; la última abierta, hacia ganada.
 */
export function funnelFromHistory(
  stages: FunnelStage[],
  opportunities: Array<{ id: string; stageId: string; createdAt: Date | string }>,
  history: Array<{
    opportunityId: string;
    fromStageId: string | null;
    toStageId: string | null;
    changedAt: Date | string;
  }>,
): FunnelStageResult[] {
  const byOpp = new Map<string, typeof history>();
  for (const h of history) {
    const list = byOpp.get(h.opportunityId) ?? [];
    list.push(h);
    byOpp.set(h.opportunityId, list);
  }
  const reached = new Map<string, Set<string>>();
  const durations = new Map<string, number[]>();
  const mark = (stageId: string | null, oppId: string) => {
    if (!stageId) return;
    const set = reached.get(stageId) ?? new Set<string>();
    set.add(oppId);
    reached.set(stageId, set);
  };

  for (const o of opportunities) {
    const moves = (byOpp.get(o.id) ?? []).sort(
      (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );
    let current = moves[0]?.fromStageId ?? o.stageId;
    let since = new Date(o.createdAt).getTime();
    mark(current, o.id);
    for (const m of moves) {
      const at = new Date(m.changedAt).getTime();
      if (current) {
        const list = durations.get(current) ?? [];
        list.push((at - since) / DAY);
        durations.set(current, list);
      }
      current = m.toStageId;
      since = at;
      mark(current, o.id);
    }
  }

  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const openStages = ordered.filter((s) => s.kind === 'open');
  const wonIds = new Set(ordered.filter((s) => s.kind === 'won').map((s) => s.id));
  const reachedWon = new Set<string>();
  for (const id of wonIds) for (const o of reached.get(id) ?? []) reachedWon.add(o);

  return ordered.map((s) => {
    const here = reached.get(s.id) ?? new Set<string>();
    let conversion: number | null = null;
    if (s.kind === 'open' && here.size > 0) {
      const idx = openStages.findIndex((x) => x.id === s.id);
      const next = openStages[idx + 1];
      const target = next ? (reached.get(next.id) ?? new Set<string>()) : reachedWon;
      // Ganar cuenta como haber superado cualquier etapa abierta.
      const passed = [...here].filter((o) => target.has(o) || reachedWon.has(o)).length;
      conversion = Math.round((passed / here.size) * 100);
    }
    const d = durations.get(s.id) ?? [];
    return {
      stageId: s.id,
      name: s.name,
      kind: s.kind,
      reached: here.size,
      conversion,
      avgDays: d.length ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10 : null,
    };
  });
}

/** Embudo de las oportunidades creadas en el periodo. */
export async function funnelReport(db: any, period: Period) {
  const stages = await db
    .select()
    .from(schema.opportunityStages)
    .orderBy(asc(schema.opportunityStages.sortOrder));
  const opps = await db
    .select({
      id: schema.opportunities.id,
      stageId: schema.opportunities.stageId,
      createdAt: schema.opportunities.createdAt,
    })
    .from(schema.opportunities)
    .where(
      and(
        gte(schema.opportunities.createdAt, period.from),
        lte(schema.opportunities.createdAt, period.to),
      ),
    );
  const history = opps.length
    ? await db
        .select()
        .from(schema.opportunityStageHistory)
        .where(
          inArray(
            schema.opportunityStageHistory.opportunityId,
            opps.map((o: any) => o.id),
          ),
        )
    : [];
  return { cohort: opps.length, stages: funnelFromHistory(stages, opps, history) };
}

// ── Pérdidas y orígenes ─────────────────────────────────────────────────

export async function lostReasonsReport(db: any, period: Period) {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT coalesce(nullif(o."lostReason", ''), 'Sin motivo') AS reason,
             count(*)::int AS n, coalesce(sum(o.amount), 0) AS amount
        FROM "Opportunity" o JOIN "OpportunityStage" s ON s.id = o."stageId"
       WHERE s.kind = 'lost' AND coalesce(o."closedAt", o."updatedAt") BETWEEN ${period.from} AND ${period.to}
       GROUP BY 1 ORDER BY 2 DESC`),
  );
  return rows.map((r: any) => ({ reason: r.reason, count: num(r.n), amount: num(r.amount) }));
}

export async function sourcesReport(db: any, period: Period) {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT coalesce(nullif(o.source, ''), 'Sin origen') AS source,
             count(*)::int AS created,
             count(*) FILTER (WHERE s.kind = 'won')::int AS won,
             count(*) FILTER (WHERE s.kind = 'lost')::int AS lost,
             coalesce(sum(o.amount) FILTER (WHERE s.kind = 'won'), 0) AS "wonAmount"
        FROM "Opportunity" o JOIN "OpportunityStage" s ON s.id = o."stageId"
       WHERE o."createdAt" BETWEEN ${period.from} AND ${period.to}
       GROUP BY 1 ORDER BY 3 DESC, 2 DESC`),
  );
  return rows.map((r: any) => {
    const closed = num(r.won) + num(r.lost);
    return {
      source: r.source,
      created: num(r.created),
      won: num(r.won),
      lost: num(r.lost),
      wonAmount: num(r.wonAmount),
      winRate: closed ? Math.round((num(r.won) / closed) * 100) : null,
    };
  });
}

// ── Actividad por comercial ────────────────────────────────────────────

export async function activityByOwnerReport(db: any, tenantId: string, period: Period) {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT a."ownerUserId" AS owner, a.type,
             count(*) FILTER (WHERE a."doneAt" IS NOT NULL)::int AS done,
             count(*) FILTER (WHERE a."doneAt" IS NULL AND a."dueAt" < now())::int AS overdue
        FROM "CrmActivity" a
       WHERE coalesce(a."doneAt", a."dueAt", a."createdAt") BETWEEN ${period.from} AND ${period.to}
       GROUP BY 1, 2`),
  );
  const won = rowsOf(
    await db.execute(sql`
      SELECT o."ownerUserId" AS owner, count(*)::int AS n, coalesce(sum(o.amount), 0) AS amount
        FROM "Opportunity" o JOIN "OpportunityStage" s ON s.id = o."stageId"
       WHERE s.kind = 'won' AND o."closedAt" BETWEEN ${period.from} AND ${period.to}
       GROUP BY 1`),
  );

  // Nombres de los responsables (están en el esquema público).
  const ids = Array.from(
    new Set([...rows, ...won].map((r: any) => r.owner).filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const users = await ClientFactory.getClient('public')
      .select({ id: schema.globalUsers.id, name: schema.globalUsers.username })
      .from(schema.userTenantMemberships)
      .innerJoin(schema.globalUsers, eq(schema.userTenantMemberships.userId, schema.globalUsers.id))
      .where(
        and(
          eq(schema.userTenantMemberships.tenantId, tenantId),
          inArray(schema.globalUsers.id, ids),
        ),
      );
    for (const u of users) names.set(u.id, u.name);
  }

  const byOwner = new Map<string, any>();
  const entry = (owner: string | null) => {
    const key = owner ?? '';
    if (!byOwner.has(key))
      byOwner.set(key, {
        ownerUserId: owner,
        name: owner ? (names.get(owner) ?? 'Usuario') : 'Sin responsable',
        done: {} as Record<string, number>,
        totalDone: 0,
        overdue: 0,
        won: 0,
        wonAmount: 0,
      });
    return byOwner.get(key);
  };
  for (const r of rows) {
    const e = entry(r.owner);
    e.done[r.type] = (e.done[r.type] ?? 0) + num(r.done);
    e.totalDone += num(r.done);
    e.overdue += num(r.overdue);
  }
  for (const r of won) {
    const e = entry(r.owner);
    e.won = num(r.n);
    e.wonAmount = num(r.amount);
  }
  return [...byOwner.values()].sort((a, b) => b.totalDone - a.totalDone);
}

// ── Encuestas ──────────────────────────────────────────────────────────

/** Por cada encuesta: respuestas y NPS (de su primera pregunta NPS) por mes. */
export async function surveysReport(db: any, period: Period) {
  const forms = await db.select().from(schema.crmForms).where(eq(schema.crmForms.kind, 'survey'));
  const out = [];
  for (const f of forms) {
    const npsField = (f.fields as FormField[]).find((x) => x.type === 'nps');
    const responses = await db
      .select({
        answers: schema.crmFormResponses.answers,
        createdAt: schema.crmFormResponses.createdAt,
      })
      .from(schema.crmFormResponses)
      .where(
        and(
          eq(schema.crmFormResponses.formId, f.id),
          gte(schema.crmFormResponses.createdAt, period.from),
          lte(schema.crmFormResponses.createdAt, period.to),
        ),
      );
    const byMonth = new Map<string, any[]>();
    for (const r of responses) {
      const m = new Date(r.createdAt).toISOString().slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
    }
    const months = [...byMonth.keys()].sort().map((m) => {
      const list = byMonth.get(m)!;
      const nps = npsField ? (summarizeResponses([npsField], list)[0]?.nps ?? null) : null;
      return { month: m, responses: list.length, nps };
    });
    const overall = npsField ? (summarizeResponses([npsField], responses)[0]?.nps ?? null) : null;
    out.push({ formId: f.id, name: f.name, responses: responses.length, nps: overall, months });
  }
  return out;
}

/** Periodo de la query (?from=&to=, yyyy-mm-dd); por defecto, los últimos 12 meses. */
export function parsePeriod(query: Record<string, unknown>): Period {
  const to = query.to ? new Date(`${String(query.to).slice(0, 10)}T23:59:59`) : new Date();
  const from = query.from
    ? new Date(`${String(query.from).slice(0, 10)}T00:00:00`)
    : new Date(to.getTime() - 365 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
    throw new Error('Periodo no válido');
  return { from, to };
}
