/**
 * Tools de GENERACIÓN de archivos descargables (Excel/Word/PDF) — igual que
 * `render_component`, NO son acciones: no tocan datos del ERP, solo producen
 * un archivo para que el usuario se lo descargue, así que no piden
 * confirmación (a diferencia de las tools de `actionTools.ts`). El archivo
 * viaja como base64 en el output de la tool — la UI del chat construye un
 * Blob y ofrece la descarga, sin persistir nada en el server.
 */

import { tool } from 'ai';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const SAFE_FILENAME = (name: string) => name.replace(/[^\w.\- áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 120);

export function buildFileGenTools() {
  return {
    create_excel: tool({
      description:
        'Genera un archivo Excel (.xlsx) descargable a partir de datos — úsalo cuando el usuario pida exportar/descargar algo a Excel. Puede tener varias hojas. NO pide confirmación: solo genera un archivo, no modifica nada del ERP.',
      inputSchema: z.object({
        filename: z.string().describe('Nombre del archivo, sin extensión'),
        sheets: z
          .array(
            z.object({
              name: z.string().describe('Nombre de la hoja (máx. 31 caracteres)'),
              rows: z
                .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
                .describe('Filas como objetos — cada clave es una columna'),
            }),
          )
          .min(1),
      }),
      execute: async ({
        filename,
        sheets,
      }: {
        filename: string;
        sheets: Array<{ name: string; rows: Array<Record<string, string | number | null>> }>;
      }) => {
        try {
          const wb = XLSX.utils.book_new();
          for (const sheet of sheets) {
            const ws = XLSX.utils.json_to_sheet(sheet.rows);
            XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || 'Hoja1');
          }
          const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
          return {
            ok: true,
            filename: `${SAFE_FILENAME(filename)}.xlsx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            base64: buffer.toString('base64'),
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || 'Error al generar el Excel' };
        }
      },
    }),

    create_word: tool({
      description:
        'Genera un documento Word (.docx) descargable a partir de un título y párrafos de texto — úsalo para informes/documentos de texto que el usuario quiera descargar. NO pide confirmación: solo genera un archivo, no modifica nada del ERP.',
      inputSchema: z.object({
        filename: z.string().describe('Nombre del archivo, sin extensión'),
        title: z.string().optional(),
        paragraphs: z.array(z.string()).describe('Párrafos de texto plano, en orden'),
      }),
      execute: async ({
        filename,
        title,
        paragraphs,
      }: {
        filename: string;
        title?: string;
        paragraphs: string[];
      }) => {
        try {
          const children: Paragraph[] = [];
          if (title) {
            children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }));
          }
          for (const p of paragraphs) {
            children.push(new Paragraph({ children: [new TextRun(p)] }));
          }
          const doc = new Document({ sections: [{ children }] });
          const buffer = await Packer.toBuffer(doc);
          return {
            ok: true,
            filename: `${SAFE_FILENAME(filename)}.docx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            base64: buffer.toString('base64'),
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || 'Error al generar el Word' };
        }
      },
    }),

    create_pdf: tool({
      description:
        'Genera un PDF simple descargable (título + párrafos de texto plano) — úsalo para un informe rápido para descargar. Para documentos de negocio (facturas, pedidos, albaranes) esto NO es lo correcto — esos ya se generan desde la propia aplicación. NO pide confirmación: solo genera un archivo, no modifica nada del ERP.',
      inputSchema: z.object({
        filename: z.string().describe('Nombre del archivo, sin extensión'),
        title: z.string().optional(),
        paragraphs: z.array(z.string()).describe('Párrafos de texto plano, en orden'),
      }),
      execute: async ({
        filename,
        title,
        paragraphs,
      }: {
        filename: string;
        title?: string;
        paragraphs: string[];
      }) => {
        try {
          const pdfDoc = await PDFDocument.create();
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          let page = pdfDoc.addPage();
          const { width, height } = page.getSize();
          const margin = 50;
          let y = height - margin;
          const maxWidth = width - margin * 2;

          const wrapText = (text: string, f: PDFFont, size: number): string[] => {
            const words = text.split(' ');
            const lines: string[] = [];
            let line = '';
            for (const w of words) {
              const test = line ? `${line} ${w}` : w;
              if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
                lines.push(line);
                line = w;
              } else {
                line = test;
              }
            }
            if (line) lines.push(line);
            return lines;
          };

          const drawLine = (text: string, f: PDFFont, size: number) => {
            if (y < margin) {
              page = pdfDoc.addPage();
              y = height - margin;
            }
            page.drawText(text, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
            y -= size * 1.4;
          };

          if (title) {
            for (const line of wrapText(title, boldFont, 18)) drawLine(line, boldFont, 18);
            y -= 10;
          }
          for (const para of paragraphs) {
            for (const line of wrapText(para, font, 11)) drawLine(line, font, 11);
            y -= 8;
          }

          const bytes = await pdfDoc.save();
          return {
            ok: true,
            filename: `${SAFE_FILENAME(filename)}.pdf`,
            mimeType: 'application/pdf',
            base64: Buffer.from(bytes).toString('base64'),
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || 'Error al generar el PDF' };
        }
      },
    }),
  };
}
