/**
 * Esquema Zod de `VisualOptions` (@openfactu/pdf) + su merge sobre los valores
 * por defecto.
 *
 * Vive aquí, en `core/documents`, y no dentro de las tools de IA, porque lo
 * usan DOS generadores distintos que deben producir exactamente lo mismo:
 *
 *  - las tools del chat/MCP (`preview_document_template`,
 *    `create_document_template` — ver core/ai/tools/documentTemplateTools.ts),
 *  - el generador de la página de plantillas (`POST
 *    /api/document-templates/generate`).
 *
 * En ambos casos el modelo NO escribe HTML: elige opciones y el HTML lo
 * construye `buildVisualTemplate`, la misma función que el modo Visual del
 * diseñador. Ver el comentario de cabecera de documentTemplateTools.ts para
 * el porqué (una plantilla de HTML libre se pierde al abrirla en Visual).
 */

import { z } from 'zod';
import { DEFAULT_VISUAL_OPTIONS, type VisualOptions } from '@openfactu/pdf';

const watermarkSchema = z
  .object({
    enabled: z.boolean().optional(),
    text: z.string().optional(),
    color: z.string().optional(),
    opacity: z.number().optional(),
    rotation: z.number().optional(),
    fontSize: z.number().optional(),
  })
  .optional();

const footerSchema = z
  .object({
    text: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
    showPageNumbers: z.boolean().optional(),
    showGeneratedAt: z.boolean().optional(),
  })
  .optional();

const columnsSchema = z
  .object({
    code: z.boolean().optional(),
    description: z.boolean().optional(),
    quantity: z.boolean().optional(),
    uom: z.boolean().optional(),
    price: z.boolean().optional(),
    iva: z.boolean().optional(),
    lineTotal: z.boolean().optional(),
  })
  .optional();

/** Espeja `VisualOptions` (@openfactu/pdf) — ver visualOptionsSchema.d.ts. Todo
 * opcional: lo no indicado se completa con DEFAULT_VISUAL_OPTIONS. */
export const visualOptionsInputSchema = z.object({
  accentColor: z.string().optional().describe('Color de acento (hex), ej. "#2563eb"'),
  headerBgColor: z.string().optional(),
  textColor: z.string().optional(),
  mutedColor: z.string().optional(),
  fontFamily: z.enum(['sans', 'serif', 'mono']).optional(),
  baseFontSize: z.number().optional(),
  pageSize: z.enum(['A4', 'Letter', 'A5']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  margins: z.enum(['narrow', 'normal', 'wide']).optional(),
  logoUrl: z.string().optional(),
  logoPosition: z.enum(['left', 'center', 'right']).optional(),
  logoMaxHeight: z.number().optional(),
  customTitle: z.string().optional().describe('Título del documento, ej. "FACTURA"'),
  showCompanyTaxId: z.boolean().optional(),
  showCompanyAddress: z.boolean().optional(),
  showCompanyContact: z.boolean().optional(),
  showPartnerTaxId: z.boolean().optional(),
  showPartnerAddress: z.boolean().optional(),
  showPartnerContact: z.boolean().optional(),
  showShipTo: z.boolean().optional(),
  showBillTo: z.boolean().optional(),
  showBaseDoc: z.boolean().optional(),
  showTaxBreakdown: z.boolean().optional(),
  showTotalInWords: z.boolean().optional(),
  showBatches: z.boolean().optional(),
  showDocBarcode: z.boolean().optional(),
  showDocQr: z.boolean().optional(),
  columns: columnsSchema,
  watermark: watermarkSchema,
  footer: footerSchema,
  showCustomFields: z.boolean().optional(),
  customFieldsLabel: z.string().optional(),
  customCss: z.string().optional().describe('CSS adicional libre para ajustes finos'),
});

export type VisualOptionsInput = z.infer<typeof visualOptionsInputSchema>;

/** Deep-merge de un input parcial sobre DEFAULT_VISUAL_OPTIONS — mismo criterio
 * de retrocompatibilidad que usa `parseMeta` para las plantillas guardadas. */
export function mergeVisualOptions(input?: VisualOptionsInput): VisualOptions {
  return {
    ...DEFAULT_VISUAL_OPTIONS,
    ...input,
    columns: { ...DEFAULT_VISUAL_OPTIONS.columns, ...input?.columns },
    watermark: { ...DEFAULT_VISUAL_OPTIONS.watermark, ...input?.watermark },
    footer: { ...DEFAULT_VISUAL_OPTIONS.footer, ...input?.footer },
  } as VisualOptions;
}

/**
 * Guía de las opciones para el prompt del modelo. Compartida por los dos
 * generadores para que ambos "entiendan" el mismo vocabulario de diseño.
 */
export const VISUAL_OPTIONS_PROMPT_GUIDE = [
  'Guía de opciones:',
  '- Color: accentColor (cabecera y detalles), headerBgColor, textColor, mutedColor — en hexadecimal.',
  '- Tipografía y página: fontFamily (sans/serif/mono), baseFontSize (pt), pageSize (A4/Letter/A5), orientation (portrait/landscape), margins (narrow/normal/wide).',
  '- Logo: logoPosition (left/center/right), logoMaxHeight (px).',
  '- Bloques opcionales: showCompanyTaxId/Address/Contact, showPartnerTaxId/Address/Contact, showShipTo, showBillTo, showBaseDoc, showTaxBreakdown, showTotalInWords, showBatches, showDocBarcode, showDocQr, showCustomFields.',
  '- Columnas de la tabla de líneas: columns.{code,description,quantity,uom,price,iva,lineTotal}.',
  '- Extras: customTitle, watermark (marca de agua), footer (pie), customCss para ajustes finos que no cubra ninguna opción.',
  'Indica SOLO lo que la descripción pida o implique; lo que omitas usa el valor por defecto del sistema.',
].join('\n');
