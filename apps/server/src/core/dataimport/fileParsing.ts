/**
 * Lectura de los ficheros que se suben al importador: Excel (.xlsx/.xls/.xlsm)
 * y texto delimitado (.csv/.tsv/.txt).
 *
 * Usa `xlsx`, que ya es dependencia del server (`core/ai/fileProcessing.ts`).
 * Dos cosas que no hace la librería sola y aquí sí:
 *
 *  - **Adivinar el separador del CSV.** Excel en español exporta con `;`, no
 *    con `,`. Un CSV con `;` leído como si fuera `,` no falla: devuelve una
 *    única columna con toda la fila dentro, y el usuario ve un mapeo absurdo
 *    sin entender por qué.
 *  - **Arreglar las cabeceras.** Una columna sin nombre o repetida rompe el
 *    mapeo (dos claves iguales en el mismo objeto se pisan), así que se
 *    renombran a "Columna 3" / "Precio (2)" conservando el orden original.
 */

import * as XLSX from 'xlsx';

export interface ParsedSheet {
  name: string;
  headers: string[];
  /** Una entrada por fila de datos, indexada por cabecera. */
  rows: Array<Record<string, any>>;
}

const EXCEL_EXT = /\.(xlsx|xls|xlsm|xlsb)$/i;
const TEXT_EXT = /\.(csv|tsv|txt)$/i;

/** Separador más plausible mirando la primera línea con contenido. */
function guessDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const candidates = [';', ',', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/** Cabeceras únicas y no vacías, respetando el orden del fichero. */
function normalizeHeaders(raw: any[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = h === null || h === undefined ? '' : String(h).trim();
    if (!name) name = `Columna ${i + 1}`;
    const previous = seen.get(name);
    if (previous === undefined) {
      seen.set(name, 1);
      return name;
    }
    seen.set(name, previous + 1);
    return `${name} (${previous + 1})`;
  });
}

function sheetToParsed(name: string, sheet: XLSX.WorkSheet): ParsedSheet {
  // `blankrows: true` a propósito: si la librería se comiera las filas vacías,
  // el índice del array dejaría de coincidir con la línea del fichero y el
  // informe de errores mandaría al usuario a la fila equivocada de su Excel.
  // Se conservan aquí y se descartan abajo, ya con el número apuntado.
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });

  if (matrix.length === 0) return { name, headers: [], rows: [] };

  const headers = normalizeHeaders(matrix[0] || []);
  const rows: Array<Record<string, any>> = [];

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    // Una fila totalmente vacía en medio del fichero no es un error del
    // usuario, es cómo se ven los Excel: se salta sin contarla.
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const row: Record<string, any> = {};
    headers.forEach((h, c) => {
      row[h] = cells[c] === undefined ? null : cells[c];
    });
    // Número de línea real en el fichero (la cabecera es la 1) — es lo que el
    // usuario ve en Excel cuando va a corregir el error.
    Object.defineProperty(row, '__rowNum', { value: i + 1, enumerable: false });
    rows.push(row);
  }

  return { name, headers, rows };
}

/** Todas las hojas del fichero. Lanza si la extensión no está soportada. */
export function parseTabularFile(buffer: Buffer, fileName: string): ParsedSheet[] {
  if (TEXT_EXT.test(fileName)) {
    // El BOM que pone Excel al exportar UTF-8 se colaría en la primera
    // cabecera ("﻿Código") y ningún automapeo la reconocería.
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const workbook = XLSX.read(text, { type: 'string', FS: guessDelimiter(text), raw: true });
    const name = workbook.SheetNames[0];
    return [sheetToParsed(name, workbook.Sheets[name])];
  }

  if (EXCEL_EXT.test(fileName)) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    return workbook.SheetNames.map((n) => sheetToParsed(n, workbook.Sheets[n]));
  }

  throw new Error(
    `Formato no soportado: ${fileName}. Admitidos: Excel (.xlsx/.xls/.xlsm) y texto delimitado (.csv/.tsv/.txt).`,
  );
}

/** Número de fila en el fichero original, para los mensajes de error. */
export function rowNumberOf(row: Record<string, any>, fallbackIndex: number): number {
  return (row as any).__rowNum ?? fallbackIndex + 2;
}
