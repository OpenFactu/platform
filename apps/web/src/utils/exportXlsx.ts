/**
 * Exportador XLSX compartido con formato (cabecera con color, filtros,
 * anchos de columna, formatos numéricos/moneda/fecha y fila de totales).
 *
 * Sustituye a los antiguos exports CSV: Excel abre un .xlsx real con estilos
 * en lugar de una hoja plana. ExcelJS se carga con import dinámico para que
 * no engorde el bundle principal (solo se descarga al pulsar «Exportar»).
 *
 * Uso:
 *   await exportToXlsx({
 *     filename: 'coste_laboral_2026-07',
 *     sheetName: 'Coste laboral',
 *     title: 'Coste laboral · julio 2026',
 *     columns: [
 *       { key: 'label', label: 'Grupo' },
 *       { key: 'gross', label: 'Bruto', type: 'currency' },
 *       { key: 'count', label: 'Nº nóminas', type: 'integer' },
 *     ],
 *     rows,
 *     totals: 'auto',
 *   });
 */

export type XlsxColumnType = 'text' | 'number' | 'integer' | 'currency' | 'percent' | 'date';

export interface XlsxColumn<T = any> {
  /** Campo del objeto (p.ej. 'code', 'name'). */
  key: keyof T & string;
  /** Etiqueta visible en la cabecera. */
  label: string;
  /** Tipo de dato: controla el formato de celda en Excel. Default: text. */
  type?: XlsxColumnType;
  /** Ancho en caracteres. Si falta, se calcula del contenido (8–45). */
  width?: number;
  /** Formateador opcional al exportar. Si devuelve string, la celda es texto. */
  format?: (value: any, row: T) => any;
}

export interface ExportXlsxOptions<T> {
  /** Nombre base del archivo, sin extensión. */
  filename: string;
  sheetName?: string;
  /** Fila de título fusionada encima de la cabecera. */
  title?: string;
  columns: XlsxColumn<T>[];
  rows: T[];
  /**
   * Fila de totales: objeto con valores por key, o 'auto' para sumar las
   * columnas numéricas (number/integer/currency).
   */
  totals?: Partial<Record<string, any>> | 'auto';
}

const NUM_FMT: Record<Exclude<XlsxColumnType, 'text'>, string> = {
  number: '#,##0.00',
  integer: '#,##0',
  currency: '#,##0.00 "€"',
  // Los valores llegan ya en escala 0-100 (p.ej. 95.2), no como fracción.
  percent: '0.0"%"',
  date: 'dd/mm/yyyy',
};

const HEADER_FILL = 'FF1E293B'; // slate-800
const ZEBRA_FILL = 'FFF8FAFC'; // slate-50
const BORDER_COLOR = 'FFE2E8F0'; // slate-200

function cellValue(col: XlsxColumn<any>, row: any): any {
  const raw = (row as any)[col.key];
  const v = col.format ? col.format(raw, row) : raw;
  if (v === null || v === undefined) return '';
  if (col.type === 'date') {
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d;
  }
  if (col.type && col.type !== 'text' && typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return isNaN(n) ? v : n;
  }
  return v;
}

export async function exportToXlsx<T extends Record<string, any>>(
  opts: ExportXlsxOptions<T>,
): Promise<void> {
  const { filename, sheetName, title, columns, rows, totals } = opts;
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName || 'Datos', {
    views: [{ state: 'frozen', ySplit: title ? 2 : 1 }],
  });

  let headerRowIdx = 1;
  if (title) {
    const titleRow = ws.addRow([title]);
    titleRow.height = 24;
    titleRow.getCell(1).font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, columns.length);
    headerRowIdx = 2;
  }

  const header = ws.addRow(columns.map((c) => c.label));
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: HEADER_FILL } } };
  });

  for (const row of rows) {
    ws.addRow(columns.map((c) => cellValue(c, row)));
  }

  // Fila de totales: en negrita con doble borde superior.
  let totalsRowIdx: number | null = null;
  if (totals) {
    const values =
      totals === 'auto'
        ? columns.map((c, i) => {
            if (i === 0) return 'TOTAL';
            if (!c.type || c.type === 'text' || c.type === 'date' || c.type === 'percent')
              return '';
            return rows.reduce((s, r) => s + (Number((r as any)[c.key]) || 0), 0);
          })
        : columns.map((c) => (totals as any)[c.key] ?? '');
    const totalRow = ws.addRow(values);
    totalsRowIdx = totalRow.number;
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: 'double', color: { argb: HEADER_FILL } } };
    });
  }

  // Formato numérico por columna + zebra + bordes suaves en filas de datos.
  columns.forEach((c, i) => {
    const wsCol = ws.getColumn(i + 1);
    if (c.type && c.type !== 'text') {
      wsCol.numFmt = NUM_FMT[c.type];
    }
    // Ancho: fijo si viene, si no el mayor entre etiqueta y contenido (8–45).
    if (c.width) {
      wsCol.width = c.width;
    } else {
      let max = c.label.length;
      for (const r of rows) {
        const v = (r as any)[c.key];
        const len = String(v ?? '').length;
        if (len > max) max = len;
      }
      wsCol.width = Math.min(45, Math.max(8, max + 2));
    }
  });
  const firstDataRow = headerRowIdx + 1;
  const lastDataRow = headerRowIdx + rows.length;
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const row = ws.getRow(r);
    const zebra = (r - firstDataRow) % 2 === 1;
    for (let ci = 1; ci <= columns.length; ci++) {
      const cell = row.getCell(ci);
      if (zebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
      }
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER_COLOR } } };
    }
  }
  // El numFmt de columna se aplica también al título/cabecera; los reponemos.
  if (title) ws.getCell(1, 1).numFmt = '@';
  header.eachCell((cell) => (cell.numFmt = '@'));
  if (totalsRowIdx !== null) {
    // La celda de la etiqueta 'TOTAL' no debe heredar formato numérico.
    ws.getRow(totalsRowIdx).getCell(1).numFmt = '@';
  }

  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: columns.length },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
