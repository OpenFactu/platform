/**
 * Los formatos de los bancos. El núcleo solo entiende ficheros de columnas y genera remesas en CSV;
 * lo que dependa de un país (extractos, ficheros de remesa) lo aporta un plugin, solo en las
 * empresas que lo tengan activo.
 */
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';
import type { NormalizedLine } from './statementLines';

export type BatchKind = 'collection' | 'payment';

/** Lo que devuelve un plugin al leer un extracto. */
export type ParsedStatementLine = Partial<NormalizedLine> & { date: string; amount: number };

export interface StatementParser {
  id: string;
  label: string;
  /** Extensiones que suele tener, sin punto. Solo orienta al elegir. */
  extensions?: string[];
  parse: (content: Buffer, fileName: string) => ParsedStatementLine[];
}

export interface BatchForExport {
  code: string;
  kind: BatchKind;
  chargeDate: string;
  total: number;
  /** Cuándo se genera: los formatos lo piden y no se puede sacar de otro sitio. */
  createdAt: string;
  company: { name: string; taxId: string | null };
  account: {
    name: string;
    iban: string | null;
    swift: string | null;
    bankName: string | null;
    creditorId: string | null;
    currencyCode: string | null;
  };
  lines: Array<{
    id: string;
    partnerName: string;
    partnerTaxId: string | null;
    iban: string | null;
    swift: string | null;
    mandateRef: string | null;
    mandateDate: string | null;
    amount: number;
    dueDate: string;
    invoiceCode: string;
  }>;
}

export interface BatchFile {
  fileName: string;
  contentType: string;
  content: string;
}

export interface BatchExporter {
  id: string;
  label: string;
  kinds: BatchKind[];
  /** Lo que le falta a la remesa para este formato, en palabras de quien la prepara. */
  validate?: (batch: BatchForExport) => string[];
  generate: (batch: BatchForExport) => BatchFile;
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Sin plugin: una hoja con todo, que se sube a mano al banco o se revisa. */
const CSV_EXPORTER: BatchExporter = {
  id: 'csv',
  label: 'CSV',
  kinds: ['collection', 'payment'],
  generate: (batch) => ({
    fileName: `${batch.code}.csv`,
    contentType: 'text/csv',
    content: [
      [
        'Interlocutor',
        'IBAN',
        'SWIFT',
        'Mandato',
        'Fecha del mandato',
        'Factura',
        'Vencimiento',
        'Importe',
      ],
      ...batch.lines.map((line) => [
        line.partnerName,
        line.iban,
        line.swift,
        line.mandateRef,
        line.mandateDate,
        line.invoiceCode,
        line.dueDate,
        line.amount.toFixed(2),
      ]),
    ]
      .map((row) => row.map(csvCell).join(';'))
      .join('\n')
      .concat('\n'),
  }),
};

/** El formato de columnas, que el núcleo lee con su mapeo: no pasa por `parse`. */
export const CSV_STATEMENT_FORMAT = 'csv';

const statementParsers = new TenantScopedRegistry<StatementParser>();
const batchExporters = new TenantScopedRegistry<BatchExporter>();

export const BankFormats = {
  registerStatementParser(pluginId: string, parser: StatementParser): void {
    if (!parser?.id || typeof parser.parse !== 'function') {
      throw new Error(`[Plugin ${pluginId}] bankFormats.registerStatementParser: falta id o parse`);
    }
    statementParsers.add(pluginId, parser);
  },

  registerBatchExporter(pluginId: string, exporter: BatchExporter): void {
    if (!exporter?.id || typeof exporter.generate !== 'function') {
      throw new Error(
        `[Plugin ${pluginId}] bankFormats.registerBatchExporter: falta id o generate`,
      );
    }
    batchExporters.add(pluginId, exporter);
  },

  /** Solo para los tests: quita lo que registró un plugin de prueba. */
  removeForTests(pluginId: string): void {
    statementParsers.removePlugin(pluginId);
    batchExporters.removePlugin(pluginId);
  },

  statementFormatsFor(tenantId: string | undefined) {
    return [
      { id: CSV_STATEMENT_FORMAT, label: 'CSV / Excel', extensions: ['csv', 'txt', 'xlsx', 'xls'] },
      ...statementParsers
        .activeFor(tenantId)
        .map(({ id, label, extensions }) => ({ id, label, extensions: extensions ?? [] })),
    ];
  },

  parserFor(tenantId: string | undefined, id: string): StatementParser | null {
    return statementParsers.activeFor(tenantId).find((parser) => parser.id === id) ?? null;
  },

  exportersFor(tenantId: string | undefined, kind?: BatchKind): BatchExporter[] {
    const all = [...batchExporters.activeFor(tenantId), CSV_EXPORTER];
    return kind ? all.filter((exporter) => exporter.kinds.includes(kind)) : all;
  },
};
