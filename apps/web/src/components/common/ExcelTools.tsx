import React, { useMemo, useState } from 'react';
import { Button, usePopup, useToast, Textarea, Checkbox, Select } from '@openfactu/ui';
import { Download, ClipboardPaste } from 'lucide-react';
import { exportToXlsx, type XlsxColumnType } from '../../utils/exportXlsx';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Utilidades de export/import tipo Excel para cualquier tabla.
 *
 * - Exportar: descarga un .xlsx real con formato (cabecera con color,
 *   filtros, anchos y formatos numéricos) vía utils/exportXlsx.
 * - Pegar desde Excel: detecta tabs (TSV que produce Excel al copiar) o
 *   comas (CSV). Auto-detecta cabecera si la primera fila coincide con
 *   las columnas esperadas. Mapeo editable por el usuario.
 *
 * Uso:
 *   <ExcelTools
 *     data={rows}
 *     columns={[
 *       { key: 'code', label: 'Código', required: true },
 *       { key: 'name', label: 'Nombre', required: true },
 *       { key: 'balance', label: 'Saldo', type: 'currency' },
 *     ]}
 *     filename="plan-contable"
 *     onImport={async (rows) => { await bulkInsert(rows) }}
 *   />
 */

export interface ExcelColumn<T> {
  /** Campo del objeto (p.ej. 'code', 'name'). */
  key: keyof T & string;
  /** Etiqueta visible en la cabecera. */
  label: string;
  /** Si true, la fila se descarta al importar si este campo está vacío. */
  required?: boolean;
  /** Tipo de dato al exportar: controla el formato de celda en Excel. */
  type?: XlsxColumnType;
  /** Ancho de columna en caracteres al exportar (si falta, se calcula). */
  width?: number;
  /** Formateador opcional al exportar. */
  format?: (value: any, row: T) => string;
  /** Parseador opcional al importar (string → valor). */
  parse?: (raw: string) => any;
}

export interface ExcelToolsProps<T> {
  data: T[];
  columns: ExcelColumn<T>[];
  /** Nombre base del archivo, sin extensión. */
  filename: string;
  /** Se llama con las filas parseadas del paste. Debe lanzar para errores. */
  onImport?: (rows: Partial<T>[]) => Promise<void> | void;
  /** Habilita solo el export (sin botón de importar). */
  exportOnly?: boolean;
}

function parsePasteText(text: string): string[][] {
  const trimmed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  if (!trimmed) return [];
  const hasTab = trimmed.includes('\t');
  const hasSemi = !hasTab && trimmed.includes(';');
  const sep = hasTab ? '\t' : hasSemi ? ';' : ',';

  // Parser que respeta comillas dobles (estándar CSV).
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

export function ExcelTools<T extends Record<string, any>>({
  data,
  columns,
  filename,
  onImport,
  exportOnly,
}: ExcelToolsProps<T>) {
  const popup = usePopup();
  const toast = useToast();
  const { t } = useI18n();

  const doExport = async () => {
    if (!data.length) {
      toast.info(t('app.excel.noData'));
      return;
    }
    try {
      await exportToXlsx({ filename, columns, rows: data });
      toast.success(t('app.excel.exported', { count: data.length }));
    } catch (err: any) {
      toast.error(err?.message || t('app.excel.exportError'));
    }
  };

  const doImport = async () => {
    if (!onImport) return;
    await popup.show<void>({
      title: t('app.excel.pasteTitle'),
      subtitle: t('app.excel.pasteSubtitle'),
      maxWidth: '3xl',
      render: (close) => (
        <PasteBody
          columns={columns}
          onCancel={() => close()}
          onImport={async (rows) => {
            try {
              await onImport(rows as Partial<T>[]);
              toast.success(t('app.excel.imported', { count: rows.length }));
              close();
            } catch (err: any) {
              toast.error(err?.message || t('app.excel.importError'));
            }
          }}
        />
      ),
    });
  };

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Button
        variant="secondary"
        onClick={doExport}
        className="flex items-center gap-2 whitespace-nowrap"
        title={t('app.excel.exportHint')}
      >
        <Download size={16} />
        {t('app.excel.export')}
      </Button>
      {!exportOnly && onImport && (
        <Button
          variant="secondary"
          onClick={doImport}
          className="flex items-center gap-2 whitespace-nowrap"
          title={t('app.excel.importHint')}
        >
          <ClipboardPaste size={16} />
          {t('app.excel.import')}
        </Button>
      )}
    </div>
  );
}

interface PasteBodyProps<T> {
  columns: ExcelColumn<T>[];
  onCancel: () => void;
  onImport: (rows: Record<string, any>[]) => Promise<void>;
}

function PasteBody<T>({ columns, onCancel, onImport }: PasteBodyProps<T>) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mapping, setMapping] = useState<Record<number, string | null>>({});
  const [hasHeader, setHasHeader] = useState(true);
  const { t } = useI18n();

  const matrix = useMemo(() => parsePasteText(text), [text]);
  const headerRow = matrix[0] || [];
  const bodyRows = hasHeader ? matrix.slice(1) : matrix;

  // Auto-mapeo por primera vez cuando aparece texto.
  React.useEffect(() => {
    if (!matrix.length) return;
    const auto: Record<number, string | null> = {};
    headerRow.forEach((h, i) => {
      const norm = String(h).trim().toLowerCase();
      const hit = columns.find(
        (c) => c.label.toLowerCase() === norm || c.key.toLowerCase() === norm,
      );
      auto[i] = hit?.key || null;
    });
    // Si no había cabecera decente (0 hits), mapea por posición.
    const hits = Object.values(auto).filter(Boolean).length;
    if (hits === 0) {
      headerRow.forEach((_, i) => {
        auto[i] = columns[i]?.key || null;
      });
      setHasHeader(false);
    }
    setMapping(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix.length]);

  const parsed = useMemo(() => {
    if (!matrix.length) return [];
    const cols = columns as ExcelColumn<any>[];
    return bodyRows
      .map((row) => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < row.length; i++) {
          const field = mapping[i];
          if (!field) continue;
          const col = cols.find((c) => c.key === field);
          const raw = (row[i] ?? '').trim();
          obj[field] = col?.parse ? col.parse(raw) : raw;
        }
        return obj;
      })
      .filter((obj) => {
        const requiredMissing = (columns as ExcelColumn<any>[]).some(
          (c) => c.required && !obj[c.key],
        );
        return !requiredMissing;
      });
  }, [matrix, mapping, bodyRows, columns]);

  return (
    <div className="space-y-4">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('app.excel.pastePlaceholder')}
        className="h-40 font-mono text-xs"
      />

      {matrix.length > 0 && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hasHeader} onChange={setHasHeader} />
            {t('app.excel.firstRowHeader')}
          </label>

          <div className="border border-border-default rounded-lg overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-bg-muted sticky top-0">
                <tr>
                  {headerRow.map((h, i) => (
                    <th key={i} className="p-2 text-left border-b border-border-default">
                      <div className="text-slate-500 mb-1 truncate">
                        {hasHeader ? h : t('app.excel.colShort', { n: i + 1 })}
                      </div>
                      <Select
                        options={columns.map((c) => ({
                          value: c.key,
                          label: `${c.label}${c.required ? ' *' : ''}`,
                        }))}
                        value={mapping[i] || ''}
                        onChange={(v) => setMapping({ ...mapping, [i]: v || null })}
                        placeholder={t('app.excel.ignore')}
                        ariaLabel={t('app.excel.column', { name: hasHeader ? h : i + 1 })}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.slice(0, 10).map((row, ri) => (
                  <tr key={ri} className="border-t border-border-subtle">
                    {row.map((v, i) => (
                      <td key={i} className="p-2 font-mono">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {bodyRows.length > 10 && (
              <div className="p-2 text-xs text-slate-500 border-t border-border-default">
                {t('app.excel.moreRows', { count: bodyRows.length - 10 })}
              </div>
            )}
          </div>

          <div className="text-sm text-fg-body">
            {t('app.excel.validRows', { count: parsed.length })}
            {bodyRows.length - parsed.length > 0 && (
              <span className="text-amber-600 ml-2">
                {t('app.excel.discarded', { count: bodyRows.length - parsed.length })}
              </span>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          {t('app.common.cancel')}
        </Button>
        <Button
          onClick={async () => {
            setSubmitting(true);
            try {
              await onImport(parsed);
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting || parsed.length === 0}
        >
          {submitting ? t('app.excel.importing') : t('app.excel.importN', { count: parsed.length })}
        </Button>
      </div>
    </div>
  );
}
