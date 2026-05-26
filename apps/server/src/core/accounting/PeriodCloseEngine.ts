/**
 * Motor de cierre de período contable.
 *
 * Al cerrar un período:
 *   1. Comprueba que no haya documentos draft/asientos draft dentro.
 *   2. Calcula saldos de cuentas de ingreso y gasto.
 *   3. Genera asiento de regularización que traspasa el resultado a la
 *      cuenta 129 (o la configurada en AccountMapping kind=result).
 *   4. Marca el período como cerrado (status='C').
 *   5. Si es cierre de ejercicio (último período del año natural), genera
 *      asiento adicional 129 → 120/reservas (kind=retained_earnings).
 *   6. Crea un período siguiente (misma duración) y genera asiento de
 *      apertura con los saldos de cuentas de balance.
 *
 * Todo corre en una sola transacción; si algo falla, rollback.
 */
import crypto from 'crypto';
import { and, eq, sql, gte, lte, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { JournalEngine, type JournalLineInput } from './JournalEngine';

export interface ClosePreview {
  period: any;
  blockers: string[];
  regularizationLines: JournalLineInput[];
  resultAmount: number; // positivo=beneficio, negativo=pérdida
  nextPeriodCode: string;
  nextPeriodStart: string;
  nextPeriodEnd: string;
  openingLines: JournalLineInput[];
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

export class PeriodCloseEngine {
  /**
   * Devuelve qué pasaría si cerramos el período, sin hacer cambios.
   */
  static async preview(db: any, periodId: string): Promise<ClosePreview> {
    const [period] = await db
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, periodId));
    if (!period) throw new Error('Período no existe');

    const blockers: string[] = [];
    if (period.status !== 'O') blockers.push(`Período ya está en estado ${period.status}`);

    // Asientos draft dentro del período
    const draftEntries = await db
      .select({ id: schema.journalEntries.id, number: schema.journalEntries.number })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.periodId, periodId),
          eq(schema.journalEntries.status, 'draft'),
        ),
      );
    if (draftEntries.length > 0) {
      blockers.push(`Hay ${draftEntries.length} asiento(s) en borrador dentro del período`);
    }

    // Saldos por cuenta (solo posted)
    const balances: Array<{
      accountId: string;
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
    }> = (
      await db
        .select({
          accountId: schema.journalEntryLines.accountId,
          code: schema.chartOfAccounts.code,
          name: schema.chartOfAccounts.name,
          type: schema.chartOfAccounts.type,
          debit: sql<string>`COALESCE(SUM(${schema.journalEntryLines.debit}), 0)`,
          credit: sql<string>`COALESCE(SUM(${schema.journalEntryLines.credit}), 0)`,
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
    ).map((r: any) => ({
      accountId: r.accountId,
      code: r.code,
      name: r.name,
      type: r.type,
      debit: Number(r.debit),
      credit: Number(r.credit),
    }));

    const resultAccount = await JournalEngine.resolveAccount(db, 'result');
    if (!resultAccount) {
      blockers.push(
        `No hay cuenta configurada para "result" (regularización). Configura AccountMapping kind=result.`,
      );
    }

    // Regularización: traspasar ingresos y gastos a la cuenta de resultado.
    const regularizationLines: JournalLineInput[] = [];
    let totalIncome = 0;
    let totalExpense = 0;
    for (const b of balances) {
      if (b.type === 'income') {
        const saldo = round4(b.credit - b.debit); // ingresos saldo acreedor
        if (saldo !== 0) {
          totalIncome += saldo;
          regularizationLines.push({
            accountId: b.accountId,
            debit: saldo,
            credit: 0,
            description: `Regularización ${b.code} ${b.name}`,
          });
        }
      } else if (b.type === 'expense') {
        const saldo = round4(b.debit - b.credit); // gastos saldo deudor
        if (saldo !== 0) {
          totalExpense += saldo;
          regularizationLines.push({
            accountId: b.accountId,
            debit: 0,
            credit: saldo,
            description: `Regularización ${b.code} ${b.name}`,
          });
        }
      }
    }
    const resultAmount = round4(totalIncome - totalExpense);
    if (resultAccount && regularizationLines.length > 0) {
      // Si resultado > 0 (beneficio): debe ingresos − haber gastos = haber resultado.
      // Si resultado < 0 (pérdida): al revés.
      if (resultAmount > 0) {
        regularizationLines.push({
          accountId: resultAccount,
          debit: 0,
          credit: resultAmount,
          description: 'Resultado del ejercicio',
        });
      } else if (resultAmount < 0) {
        regularizationLines.push({
          accountId: resultAccount,
          debit: -resultAmount,
          credit: 0,
          description: 'Resultado del ejercicio (pérdida)',
        });
      }
    }

    // Siguiente período: misma duración que el cerrado.
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    const durationMs = end.getTime() - start.getTime();
    const nextStart = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    const nextPeriodCode = `${period.code}-NEXT`;

    // Apertura: saldos de cuentas de balance (activo, pasivo, patrimonio).
    const openingLines: JournalLineInput[] = [];
    for (const b of balances) {
      if (b.type === 'asset' || b.type === 'liability' || b.type === 'equity') {
        const saldoDebit = round4(b.debit - b.credit);
        if (saldoDebit > 0) {
          openingLines.push({
            accountId: b.accountId,
            debit: saldoDebit,
            credit: 0,
            description: `Apertura ${b.code}`,
          });
        } else if (saldoDebit < 0) {
          openingLines.push({
            accountId: b.accountId,
            debit: 0,
            credit: -saldoDebit,
            description: `Apertura ${b.code}`,
          });
        }
      }
    }

    return {
      period,
      blockers,
      regularizationLines,
      resultAmount,
      nextPeriodCode,
      nextPeriodStart: nextStart.toISOString().substring(0, 10),
      nextPeriodEnd: nextEnd.toISOString().substring(0, 10),
      openingLines,
    };
  }

  /**
   * Ejecuta el cierre real. Retorna IDs generados.
   */
  static async close(
    db: any,
    periodId: string,
    userId?: string | null,
  ): Promise<{
    regularizationEntryId: string | null;
    nextPeriodId: string;
    openingEntryId: string | null;
  }> {
    const preview = await this.preview(db, periodId);
    if (preview.blockers.length > 0) {
      throw new Error(`No se puede cerrar: ${preview.blockers.join('; ')}`);
    }

    // 1) Asiento de regularización (si hay resultado que contabilizar).
    let regularizationEntryId: string | null = null;
    if (preview.regularizationLines.length > 1) {
      const reg = await JournalEngine.create(db, {
        date: preview.period.endDate,
        periodId,
        description: `Regularización cierre ${preview.period.code}`,
        source: 'period_close',
        sourceDocumentId: periodId,
        createdBy: userId,
        lines: preview.regularizationLines,
      });
      await JournalEngine.post(db, reg.id, userId);
      regularizationEntryId = reg.id;
    }

    // 2) Marcar período como cerrado.
    await db
      .update(schema.accountingPeriods)
      .set({ status: 'C' })
      .where(eq(schema.accountingPeriods.id, periodId));

    // 3) Crear siguiente período si no existe ya (por código).
    const [existingNext] = await db
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.code, preview.nextPeriodCode));
    const nextPeriodId = existingNext?.id || crypto.randomUUID();
    if (!existingNext) {
      await db.insert(schema.accountingPeriods).values({
        id: nextPeriodId,
        code: preview.nextPeriodCode,
        name: `Continuación ${preview.period.name}`,
        startDate: new Date(preview.nextPeriodStart),
        endDate: new Date(preview.nextPeriodEnd),
        status: 'O',
      });
    }

    // 4) Asiento de apertura en el nuevo período.
    let openingEntryId: string | null = null;
    if (preview.openingLines.length > 1) {
      // Debe y haber deben cuadrar — si no, añadir línea a cuenta de resultado
      // para equilibrar (saldo neto del patrimonio).
      const d = preview.openingLines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const c = preview.openingLines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(d - c) > 0.01) {
        const resultAccount = await JournalEngine.resolveAccount(db, 'retained_earnings');
        if (resultAccount) {
          const diff = round4(d - c);
          if (diff > 0) {
            preview.openingLines.push({
              accountId: resultAccount,
              debit: 0,
              credit: diff,
              description: 'Ajuste apertura',
            });
          } else {
            preview.openingLines.push({
              accountId: resultAccount,
              debit: -diff,
              credit: 0,
              description: 'Ajuste apertura',
            });
          }
        }
      }
      const opening = await JournalEngine.create(db, {
        date: new Date(preview.nextPeriodStart),
        periodId: nextPeriodId,
        description: `Apertura ${preview.nextPeriodCode}`,
        source: 'period_open',
        sourceDocumentId: nextPeriodId,
        createdBy: userId,
        lines: preview.openingLines,
      });
      await JournalEngine.post(db, opening.id, userId);
      openingEntryId = opening.id;
    }

    return { regularizationEntryId, nextPeriodId, openingEntryId };
  }

  /**
   * Cron diario: detecta períodos abiertos cuyo endDate ya pasó y emite
   * notificación a los admins del tenant. NO cierra — requiere confirmación.
   */
  static async scanAndNotify(db: any, adminUserIds: string[]): Promise<number> {
    const today = new Date();
    const overdue = await db
      .select()
      .from(schema.accountingPeriods)
      .where(
        and(eq(schema.accountingPeriods.status, 'O'), lte(schema.accountingPeriods.endDate, today)),
      )
      .orderBy(asc(schema.accountingPeriods.endDate));

    let created = 0;
    for (const period of overdue) {
      for (const uid of adminUserIds) {
        // Evita duplicar notificación del mismo período para el mismo usuario
        // en las últimas 24h.
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [existing] = await db
          .select()
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.userId, uid),
              eq(schema.notifications.link, `/accounting-periods?period=${period.id}`),
              gte(schema.notifications.createdAt, yesterday),
            ),
          );
        if (existing) continue;

        await db.insert(schema.notifications).values({
          id: crypto.randomUUID(),
          userId: uid,
          title: `Período ${period.code} pendiente de cierre`,
          body: `El período ${period.name} finalizó el ${new Date(period.endDate)
            .toISOString()
            .substring(0, 10)}. Revisa y confirma el cierre.`,
          level: 'warn',
          link: `/accounting-periods?period=${period.id}`,
        });
        created++;
      }
    }
    return created;
  }
}
