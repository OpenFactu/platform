/**
 * Las cuentas de la empresa y sus extractos. Importar no toca los libros: solo deja los movimientos
 * esperando a conciliarse, y lo ya importado no se repite.
 */
import crypto from 'crypto';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { parseTabularFile } from '../dataimport/fileParsing';
import { statusError } from '../documents/documentRules';
import { BankFormats, CSV_STATEMENT_FORMAT, type StatementParser } from './bankFormats';
import { normalizeIban, validateIban } from '../../utils/ibanValidation';
import {
  guessMapping,
  normalizeRows,
  withFingerprints,
  type NormalizedLine,
  type RejectedRow,
  type StatementMapping,
} from './statementLines';

export interface BankAccountInput {
  name?: unknown;
  iban?: string | null;
  swift?: string | null;
  bankName?: string | null;
  currencyId?: string | null;
  accountId?: string | null;
  creditorId?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

const emptyToNull = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
};

/** Valida lo que llega y lo deja como se guarda. Solo lo que venga en la petición. */
async function bankAccountValues(db: any, input: BankAccountInput) {
  const values: Record<string, unknown> = {};
  if ('name' in input) {
    const name = String(input.name ?? '').trim();
    if (!name) throw statusError(400, 'Ponle un nombre a la cuenta.');
    values.name = name;
  }
  if ('iban' in input) {
    const iban = emptyToNull(input.iban);
    if (iban && !validateIban(iban).ok) throw statusError(400, 'Ese IBAN no es válido.');
    values.iban = iban ? normalizeIban(iban) : null;
  }
  for (const field of ['swift', 'bankName', 'creditorId'] as const) {
    if (field in input) values[field] = emptyToNull(input[field]);
  }
  if ('accountId' in input) {
    const accountId = emptyToNull(input.accountId);
    if (accountId) {
      const [account] = await db
        .select({ id: schema.chartOfAccounts.id, isActive: schema.chartOfAccounts.isActive })
        .from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.id, accountId));
      if (!account?.isActive) throw statusError(400, 'Esa cuenta contable no existe.');
    }
    values.accountId = accountId;
  }
  if ('currencyId' in input) {
    const currencyId = emptyToNull(input.currencyId);
    if (currencyId) {
      const [currency] = await db
        .select({ id: schema.currencies.id })
        .from(schema.currencies)
        .where(eq(schema.currencies.id, currencyId));
      if (!currency) throw statusError(400, 'Esa moneda no existe.');
    }
    values.currencyId = currencyId;
  }
  if ('isActive' in input) values.isActive = !!input.isActive;
  return values;
}

async function clearDefault(tx: any) {
  await tx
    .update(schema.companyBankAccounts)
    .set({ isDefault: false })
    .where(eq(schema.companyBankAccounts.isDefault, true));
}

export async function listBankAccounts(db: any) {
  const accounts = schema.companyBankAccounts;
  const rows = await db
    .select({
      account: accounts,
      accountCode: schema.chartOfAccounts.code,
      accountName: schema.chartOfAccounts.name,
      currencyCode: schema.currencies.code,
    })
    .from(accounts)
    .leftJoin(schema.chartOfAccounts, eq(accounts.accountId, schema.chartOfAccounts.id))
    .leftJoin(schema.currencies, eq(accounts.currencyId, schema.currencies.id))
    .orderBy(desc(accounts.isDefault), asc(accounts.name));
  const open = await db
    .select({
      bankAccountId: schema.bankStatementLines.bankAccountId,
      value: count(),
    })
    .from(schema.bankStatementLines)
    .where(eq(schema.bankStatementLines.status, 'open'))
    .groupBy(schema.bankStatementLines.bankAccountId);
  return rows.map((row: any) => ({
    ...row.account,
    accountCode: row.accountCode,
    accountName: row.accountName,
    currencyCode: row.currencyCode,
    openLines: Number(open.find((o: any) => o.bankAccountId === row.account.id)?.value ?? 0),
  }));
}

/** Para elegir la cuenta al cobrar: lo justo, sin su cuenta contable ni sus datos de acreedor. */
export async function bankAccountOptions(db: any) {
  const accounts = schema.companyBankAccounts;
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      iban: accounts.iban,
      isDefault: accounts.isDefault,
    })
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .orderBy(desc(accounts.isDefault), asc(accounts.name));
}

/** Las cuentas contables que se pueden elegir, sin pedir permiso sobre el plan contable. */
export async function ledgerAccounts(db: any) {
  return db
    .select({
      id: schema.chartOfAccounts.id,
      code: schema.chartOfAccounts.code,
      name: schema.chartOfAccounts.name,
    })
    .from(schema.chartOfAccounts)
    .where(eq(schema.chartOfAccounts.isActive, true))
    .orderBy(asc(schema.chartOfAccounts.code));
}

export async function bankAccountFormOptions(db: any) {
  const [accounts, currencies] = await Promise.all([
    ledgerAccounts(db),
    db
      .select({
        id: schema.currencies.id,
        code: schema.currencies.code,
        name: schema.currencies.name,
      })
      .from(schema.currencies)
      .where(eq(schema.currencies.isActive, true))
      .orderBy(asc(schema.currencies.code)),
  ]);
  return { accounts, currencies };
}

export async function createBankAccount(db: any, input: BankAccountInput) {
  if (!('name' in input)) throw statusError(400, 'Ponle un nombre a la cuenta.');
  return db.transaction(async (tx: any) => {
    const values = await bankAccountValues(tx, input);
    const [existing] = await tx
      .select({ id: schema.companyBankAccounts.id })
      .from(schema.companyBankAccounts)
      .where(eq(schema.companyBankAccounts.isDefault, true));
    const isDefault = !!input.isDefault || !existing;
    if (input.isDefault) await clearDefault(tx);
    const id = crypto.randomUUID();
    await tx.insert(schema.companyBankAccounts).values({
      id,
      ...values,
      isDefault,
      isActive: input.isActive ?? true,
    });
    return { id };
  });
}

export async function updateBankAccount(db: any, id: string, input: BankAccountInput) {
  return db.transaction(async (tx: any) => {
    const [current] = await tx
      .select()
      .from(schema.companyBankAccounts)
      .where(eq(schema.companyBankAccounts.id, id))
      .for('update');
    if (!current) throw statusError(404, 'No encontrado');
    const values = await bankAccountValues(tx, input);
    if (input.isDefault) await clearDefault(tx);
    await tx
      .update(schema.companyBankAccounts)
      .set({
        ...values,
        ...('isDefault' in input ? { isDefault: !!input.isDefault } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.companyBankAccounts.id, id));
    return { id };
  });
}

/** Con movimientos, cobros o remesas no se borra: esos datos dejarían de explicarse. */
export async function deleteBankAccount(db: any, id: string) {
  return db.transaction(async (tx: any) => {
    const checks = await Promise.all([
      tx
        .select({ id: schema.bankStatementLines.id })
        .from(schema.bankStatementLines)
        .where(eq(schema.bankStatementLines.bankAccountId, id))
        .limit(1),
      tx
        .select({ id: schema.payments.id })
        .from(schema.payments)
        .where(eq(schema.payments.bankAccountId, id))
        .limit(1),
      tx
        .select({ id: schema.paymentBatches.id })
        .from(schema.paymentBatches)
        .where(eq(schema.paymentBatches.bankAccountId, id))
        .limit(1),
    ]);
    if (checks.some((rows) => rows.length > 0)) {
      throw statusError(409, 'Esta cuenta tiene movimientos: desactívala en lugar de borrarla.');
    }
    const deleted = await tx
      .delete(schema.companyBankAccounts)
      .where(eq(schema.companyBankAccounts.id, id))
      .returning({ id: schema.companyBankAccounts.id });
    if (deleted.length === 0) throw statusError(404, 'No encontrado');
    return { success: true };
  });
}

export interface StatementFile {
  fileName?: string;
  contentBase64?: string;
  format?: string;
  mapping?: StatementMapping;
}

function fileBuffer(file: StatementFile): { buffer: Buffer; fileName: string } {
  const fileName = String(file.fileName ?? '').trim();
  if (!fileName || !file.contentBase64) throw statusError(400, 'Falta el fichero del extracto.');
  const buffer = Buffer.from(file.contentBase64, 'base64');
  if (buffer.length === 0) throw statusError(400, 'El fichero está vacío.');
  return { buffer, fileName };
}

/** Un formato de columnas o el de un plugin activo en esta empresa. */
function formatOf(tenantId: string | undefined, format: string | undefined) {
  const id = format || CSV_STATEMENT_FORMAT;
  if (id === CSV_STATEMENT_FORMAT) return { id, parser: null };
  const parser = BankFormats.parserFor(tenantId, id);
  if (!parser) throw statusError(400, 'Ese formato de extracto no está disponible.');
  return { id, parser };
}

function firstSheet(buffer: Buffer, fileName: string) {
  let sheets;
  try {
    sheets = parseTabularFile(buffer, fileName);
  } catch {
    throw statusError(400, 'Ese fichero no se puede leer.');
  }
  const sheet = sheets.find((candidate) => candidate.rows.length > 0);
  if (!sheet) throw statusError(400, 'El fichero no tiene filas.');
  return sheet;
}

const PREVIEW_ROWS = 20;

/** Un formato de un plugin puede no entender el fichero: se le dice a quien lo sube. */
function parsedBy(parser: StatementParser, buffer: Buffer, fileName: string) {
  try {
    return parser.parse(buffer, fileName);
  } catch (error: any) {
    throw statusError(400, error?.message || 'Ese fichero no se puede leer.');
  }
}

/** Lo que trae el fichero, para decidir qué columna es cada cosa antes de importar. */
export function previewStatement(tenantId: string | undefined, file: StatementFile) {
  const { buffer, fileName } = fileBuffer(file);
  const { parser } = formatOf(tenantId, file.format);
  if (parser) {
    const lines = parsedBy(parser, buffer, fileName);
    return { kind: 'parsed' as const, total: lines.length, lines: lines.slice(0, PREVIEW_ROWS) };
  }
  const sheet = firstSheet(buffer, fileName);
  return {
    kind: 'table' as const,
    headers: sheet.headers,
    total: sheet.rows.length,
    rows: sheet.rows.slice(0, PREVIEW_ROWS),
    mapping: guessMapping(sheet.headers),
  };
}

function linesFromFile(
  tenantId: string | undefined,
  file: StatementFile,
): { lines: NormalizedLine[]; rejected: RejectedRow[]; format: string; fileName: string } {
  const { buffer, fileName } = fileBuffer(file);
  const { id: format, parser } = formatOf(tenantId, file.format);
  if (parser) {
    const parsed = parsedBy(parser, buffer, fileName);
    return {
      format,
      fileName,
      rejected: [],
      lines: parsed.map((line) => ({
        date: String(line.date).slice(0, 10),
        valueDate: line.valueDate ?? null,
        amount: Math.round(Number(line.amount) * 100) / 100,
        description: line.description ?? null,
        reference: line.reference ?? null,
        counterparty: line.counterparty ?? null,
        balance: line.balance ?? null,
      })),
    };
  }
  const mapping = file.mapping ?? {};
  if (!mapping.date) throw statusError(400, 'Di qué columna es la fecha.');
  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    throw statusError(400, 'Di qué columna es el importe.');
  }
  const sheet = firstSheet(buffer, fileName);
  return { format, fileName, ...normalizeRows(sheet.rows, mapping) };
}

/** Guarda los movimientos nuevos. Lo ya importado se cuenta y no se repite. */
export async function importStatement(
  ctx: { db: any; tenantId?: string; user?: any },
  input: StatementFile & { bankAccountId?: string },
) {
  const { lines, rejected, format, fileName } = linesFromFile(ctx.tenantId, input);
  return ctx.db.transaction(async (tx: any) => {
    const [account] = await tx
      .select({ id: schema.companyBankAccounts.id, isActive: schema.companyBankAccounts.isActive })
      .from(schema.companyBankAccounts)
      .where(eq(schema.companyBankAccounts.id, String(input.bankAccountId ?? '')));
    if (!account) throw statusError(400, 'Esa cuenta del banco no existe.');
    if (!account.isActive) throw statusError(400, 'Esa cuenta del banco está desactivada.');

    const importId = crypto.randomUUID();
    await tx.insert(schema.bankStatementImports).values({
      id: importId,
      bankAccountId: account.id,
      fileName,
      format,
      createdBy: ctx.user?.id ?? null,
    });
    const rows = withFingerprints(lines).map((line) => ({
      id: crypto.randomUUID(),
      bankAccountId: account.id,
      importId,
      date: line.date,
      valueDate: line.valueDate,
      amount: String(line.amount),
      description: line.description,
      reference: line.reference,
      counterparty: line.counterparty,
      balance: line.balance === null ? null : String(line.balance),
      fingerprint: line.fingerprint,
    }));
    const inserted = rows.length
      ? await tx
          .insert(schema.bankStatementLines)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: schema.bankStatementLines.id })
      : [];
    const added = inserted.length;
    const skipped = rows.length - added;
    await tx
      .update(schema.bankStatementImports)
      .set({ addedCount: added, skippedCount: skipped })
      .where(eq(schema.bankStatementImports.id, importId));
    return { importId, added, skipped, rejected };
  });
}

/** Los movimientos de una cuenta, los más recientes primero, y cuántos hay de cada estado. */
export async function listStatementLines(
  db: any,
  query: { bankAccountId?: string; status?: string; limit?: number; offset?: number },
) {
  const lines = schema.bankStatementLines;
  const bankAccountId = String(query.bankAccountId ?? '');
  if (!bankAccountId) throw statusError(400, 'Elige una cuenta del banco.');
  const conditions = [eq(lines.bankAccountId, bankAccountId)];
  if (query.status) conditions.push(eq(lines.status, query.status));
  const [rows, grouped] = await Promise.all([
    db
      .select()
      .from(lines)
      .where(and(...conditions))
      .orderBy(desc(lines.date), desc(lines.createdAt))
      .limit(Math.min(Number(query.limit) || 200, 500))
      .offset(Number(query.offset) || 0),
    db
      .select({ status: lines.status, value: sql<string>`count(*)` })
      .from(lines)
      .where(eq(lines.bankAccountId, bankAccountId))
      .groupBy(lines.status),
  ]);
  const counts = { open: 0, matched: 0, ignored: 0 };
  for (const row of grouped) {
    if (row.status in counts) counts[row.status as keyof typeof counts] = Number(row.value);
  }
  return { lines: rows, counts };
}
