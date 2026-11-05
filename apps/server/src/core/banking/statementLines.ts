/**
 * Las cuentas de los extractos, sin base de datos: qué columna es cada cosa, cómo se lee cada fila,
 * cómo se reconoce un movimiento ya importado y qué se parece a qué.
 *
 * Nada de un país: lo que no sea un fichero de columnas lo aporta un plugin.
 */
import crypto from 'crypto';
import { parseDate, parseNumber } from '../dataimport/coerce';
import { rowNumberOf } from '../dataimport/fileParsing';

export interface StatementMapping {
  date?: string;
  valueDate?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  description?: string;
  reference?: string;
  counterparty?: string;
  balance?: string;
}

export interface NormalizedLine {
  date: string;
  valueDate: string | null;
  /** Positivo si entra en la cuenta, negativo si sale. */
  amount: number;
  description: string | null;
  reference: string | null;
  counterparty: string | null;
  balance: number | null;
}

export interface RejectedRow {
  row: number;
  reason: string;
}

/** Lo habitual en los extractos. Lo más concreto primero: «F. Valor» también dice fecha. */
const HEADER_PATTERNS: Array<[keyof StatementMapping, RegExp]> = [
  ['valueDate', /valor|value/i],
  ['date', /fecha|date|^f\.?\s*(oper|mov)/i],
  ['debit', /cargo|debe|d[eé]bito|debit|withdraw|salida/i],
  ['credit', /abono|haber|cr[eé]dito|credit|deposit|entrada/i],
  ['amount', /importe|amount|cantidad|monto/i],
  ['balance', /saldo|balance/i],
  ['reference', /referencia|reference|^ref\b/i],
  ['counterparty', /beneficiari|ordenante|counterparty|payee|payer|titular/i],
  ['description', /concepto|descripci|description|concept|detail|detalle|observaci/i],
];

/** Qué columna parece cada cosa. La primera que encaja se queda con el campo. */
export function guessMapping(headers: string[]): StatementMapping {
  const mapping: StatementMapping = {};
  const used = new Set<string>();
  for (const [field, pattern] of HEADER_PATTERNS) {
    const header = headers.find((candidate) => !used.has(candidate) && pattern.test(candidate));
    if (header) {
      mapping[field] = header;
      used.add(header);
    }
  }
  return Object.fromEntries(
    headers.flatMap((header) =>
      Object.entries(mapping)
        .filter(([, value]) => value === header)
        .map(([field]) => [field, header]),
    ),
  );
}

const textOf = (value: unknown): string | null => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
};

/** Además de lo que entiende el importador, un signo al final: «12,50-». */
function amountOf(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = textOf(raw);
  if (!text) return null;
  const trailing = text.endsWith('-');
  const parsed = parseNumber(trailing ? text.slice(0, -1) : text);
  if (parsed === null) return null;
  return trailing ? -parsed : parsed;
}

const toCents = (amount: number) => Math.round(amount * 100);

function rowAmount(row: Record<string, unknown>, mapping: StatementMapping): number | null {
  if (mapping.amount) return amountOf(row[mapping.amount]);
  const debit = mapping.debit ? amountOf(row[mapping.debit]) : null;
  const credit = mapping.credit ? amountOf(row[mapping.credit]) : null;
  if (debit === null && credit === null) return null;
  return (credit ?? 0) - Math.abs(debit ?? 0);
}

const isEmptyRow = (row: Record<string, unknown>, mapping: StatementMapping) =>
  Object.values(mapping).every((header) => !textOf(row[header as string]));

/** Las filas de un fichero de columnas, ya como movimientos. Dice qué fila falló y por qué. */
export function normalizeRows(
  rows: Array<Record<string, unknown>>,
  mapping: StatementMapping,
): { lines: NormalizedLine[]; rejected: RejectedRow[] } {
  const lines: NormalizedLine[] = [];
  const rejected: RejectedRow[] = [];
  rows.forEach((row, index) => {
    if (isEmptyRow(row, mapping)) return;
    const number = rowNumberOf(row, index);
    const date = parseDate(row[mapping.date as string]);
    if (!date) {
      rejected.push({ row: number, reason: 'La fecha no se entiende.' });
      return;
    }
    const amount = rowAmount(row, mapping);
    if (amount === null) {
      rejected.push({ row: number, reason: 'El importe no se entiende.' });
      return;
    }
    if (toCents(amount) === 0) {
      rejected.push({ row: number, reason: 'El importe es cero.' });
      return;
    }
    const balance = mapping.balance ? amountOf(row[mapping.balance]) : null;
    lines.push({
      date,
      valueDate: mapping.valueDate ? parseDate(row[mapping.valueDate]) : null,
      amount: toCents(amount) / 100,
      description: mapping.description ? textOf(row[mapping.description]) : null,
      reference: mapping.reference ? textOf(row[mapping.reference]) : null,
      counterparty: mapping.counterparty ? textOf(row[mapping.counterparty]) : null,
      balance: balance === null ? null : toCents(balance) / 100,
    });
  });
  return { lines, rejected };
}

const normalizeText = (text: string | null | undefined) =>
  (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * La huella de cada movimiento, para no repetir lo ya importado. Dos movimientos iguales del mismo
 * día son dos, así que entra la posición de ese igual dentro del fichero.
 */
export function withFingerprints<T extends NormalizedLine>(lines: T[]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const key = [
      line.date,
      toCents(line.amount),
      normalizeText(line.description),
      normalizeText(line.reference),
    ].join('|');
    const position = (seen.get(key) ?? 0) + 1;
    seen.set(key, position);
    const fingerprint = crypto.createHash('sha256').update(`${key}|${position}`).digest('hex');
    return { ...line, fingerprint };
  });
}

/** Sin acentos: los bancos no suelen escribirlos. */
const plainText = (text: string | null | undefined) =>
  normalizeText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Sin separadores: el banco puede escribir FA2026000012 por FA-2026-000012. */
const compactText = (text: string | null | undefined) => plainText(text).replace(/[^a-z0-9]/g, '');

export type MatchReason = 'amount' | 'reference' | 'partner' | 'date';

export interface MatchCandidate {
  /** En positivo: lo que explicaría del movimiento. */
  amount: number;
  date: string;
  partnerName?: string | null;
  /** Lo que el banco podría traer escrito: número de factura, referencia del cobro. */
  codes: Array<string | null | undefined>;
}

export interface MovementForMatch {
  date: string;
  amount: number;
  description?: string | null;
  reference?: string | null;
  counterparty?: string | null;
}

const DAY_MS = 86_400_000;
/** Por debajo de esto, un código o un nombre aparece por casualidad. */
const MIN_CODE_LENGTH = 4;
const MIN_NAME_WORD = 4;

const WEIGHTS: Record<MatchReason, number> = { amount: 50, reference: 40, partner: 20, date: 10 };

/** Cuánto se parece un cobro o una factura a un movimiento del banco, y por qué. */
export function scoreCandidate(
  movement: MovementForMatch,
  candidate: MatchCandidate,
): { score: number; reasons: MatchReason[] } {
  const text = plainText(
    [movement.description, movement.reference, movement.counterparty].filter(Boolean).join(' '),
  );
  const compact = compactText(text);
  const reasons: MatchReason[] = [];
  if (toCents(Math.abs(movement.amount)) === toCents(Math.abs(candidate.amount))) {
    reasons.push('amount');
  }
  const hasCode = candidate.codes.some((code) => {
    const wanted = compactText(code);
    return wanted.length >= MIN_CODE_LENGTH && compact.includes(wanted);
  });
  if (hasCode) reasons.push('reference');
  // Una palabra común del nombre no basta: «cliente» o «talleres» salen en muchos conceptos.
  const words = plainText(candidate.partnerName)
    .split(' ')
    .filter((word) => word.length >= MIN_NAME_WORD);
  const found = words.filter((word) => text.includes(word)).length;
  if (words.length > 0 && found >= Math.min(words.length, 2)) reasons.push('partner');
  const distance = Math.abs(
    Date.parse(`${movement.date.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${candidate.date.slice(0, 10)}T00:00:00Z`),
  );
  if (distance <= 7 * DAY_MS) reasons.push('date');
  return {
    score: reasons.reduce((sum, reason) => sum + WEIGHTS[reason], 0),
    reasons,
  };
}
