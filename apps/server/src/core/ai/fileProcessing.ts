/**
 * Extracción de texto de archivos adjuntos al chat (Excel/PDF/Word/CSV/TXT) —
 * para que Keiro pueda "leer" un documento que el usuario sube, sin depender
 * de que el proveedor de IA soporte ese formato nativamente (la mayoría no
 * soporta .xlsx/.docx en absoluto, y el soporte de PDF varía por proveedor —
 * un modelo local en Ollama no soporta ninguno). Se extrae SIEMPRE a texto
 * plano en el server y ese texto viaja como parte del mensaje del usuario —
 * funciona igual sea cual sea el proveedor activo.
 */

import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

/** Tope de caracteres extraídos — suficiente para hojas/documentos normales
 * sin arriesgarse a saturar el contexto del modelo con un archivo enorme. */
const MAX_EXTRACTED_CHARS = 20000;

function truncate(text: string): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_EXTRACTED_CHARS) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
}

function extractExcel(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    return `--- Hoja: ${name} ---\n${csv}`;
  }).join('\n\n');
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 reescribió su API por completo: ya no es una función
  // callable (`pdfParse(buffer)`, v1) sino una clase que hay que destruir
  // explícitamente al terminar.
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractWord(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

const EXCEL_EXT = /\.(xlsx|xls|xlsm)$/i;
const PDF_EXT = /\.pdf$/i;
const WORD_EXT = /\.docx?$/i;
const TEXT_EXT = /\.(csv|txt|md|json|tsv)$/i;

/** Extrae texto de un archivo subido según su extensión. Lanza si el formato no está soportado. */
export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; truncated: boolean }> {
  if (EXCEL_EXT.test(filename)) return truncate(extractExcel(buffer));
  if (PDF_EXT.test(filename)) return truncate(await extractPdf(buffer));
  if (WORD_EXT.test(filename)) return truncate(await extractWord(buffer));
  if (TEXT_EXT.test(filename)) return truncate(buffer.toString('utf-8'));
  throw new Error(
    `Formato no soportado: ${filename}. Admitidos: Excel (.xlsx/.xls), PDF, Word (.docx/.doc), CSV/TXT.`,
  );
}
