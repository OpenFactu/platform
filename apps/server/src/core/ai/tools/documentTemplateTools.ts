/**
 * Vista previa de plantillas de documento (formatos de factura/pedido/
 * albarán) desde el chat — mismo motor que el diseñador de Ajustes →
 * Plantillas (PdfPayloadBuilder + @openfactu/pdf; ver
 * AiTemplateGeneratorModal.tsx para el flujo equivalente ya existente en la
 * web: generar → previsualizar → guardar).
 *
 * El HTML NO lo escribe el LLM: se genera con `buildVisualTemplate`, la
 * MISMA función que usa el formulario "Visual" del diseñador
 * (TemplateEditor.tsx). Esto es a propósito — plantillas escritas como HTML
 * libre por el modelo se guardaban como `legacyHtml: true` y, si alguien
 * cambiaba a modo Visual en el diseñador para tocar un detalle, el HTML se
 * REGENERABA desde cero y el diseño de la IA se perdía. Generando siempre
 * con `buildVisualTemplate`, el resultado incrusta el meta (`serializeMeta`,
 * ver visualTemplateBuilder.js) que el diseñador lee para reconstruir las
 * `VisualOptions` — la plantilla se abre YA en modo Visual, totalmente
 * editable, sin ningún riesgo de pérdida.
 *
 * Renderiza con datos de EJEMPLO (fixture, no un documento real). NO pide
 * confirmación — es solo una vista previa, no guarda nada. El guardado de
 * verdad (`create_document_template`, con `needsApproval: true` porque
 * cambia cómo se ven documentos futuros) vive en actionTools.ts junto al
 * resto de acciones que sí requieren confirmación.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { PdfRenderer, buildVisualTemplate, DEFAULT_VISUAL_OPTIONS, type DocType, type VisualOptions } from '@openfactu/pdf';
import { PdfPayloadBuilder } from '../../documents/PdfPayloadBuilder';
import type { ChatToolContext } from './util';

export const TEMPLATE_DOC_TYPE_IDS = ['SINV', 'PINV', 'SO', 'PO', 'SDN', 'PDN'] as const;

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

export function buildDocumentTemplateTools(_ctx: ChatToolContext) {
  return {
    preview_document_template: tool({
      description: [
        'Genera una vista previa en PDF de una plantilla de documento (factura, pedido, albarán...) ANTES de guardarla — llámala SIEMPRE antes de create_document_template para que el usuario vea cómo queda. Renderiza con datos de EJEMPLO (no un documento real). NO pide confirmación: solo genera una vista previa, no guarda nada.',
        'No escribes HTML: describes el diseño mediante opciones (visualOptions) — colores, tipografía, tamaño de página, qué columnas/bloques mostrar (impuestos, dirección de envío, código de barras...), marca de agua, pie de página, CSS extra. Todos los campos son opcionales; lo que no indiques usa el diseño por defecto del sistema.',
      ].join(' '),
      inputSchema: z.object({
        docType: z.enum(TEMPLATE_DOC_TYPE_IDS),
        visualOptions: visualOptionsInputSchema.optional(),
      }),
      execute: async ({
        docType,
        visualOptions,
      }: {
        docType: (typeof TEMPLATE_DOC_TYPE_IDS)[number];
        visualOptions?: VisualOptionsInput;
      }) => {
        try {
          const opts = mergeVisualOptions(visualOptions);
          const html = buildVisualTemplate(docType as DocType, opts);
          const payload = PdfPayloadBuilder.fixture(docType as DocType);
          const pdfBuffer = await PdfRenderer.render(html, payload, {});
          return { ok: true, pdfBase64: pdfBuffer.toString('base64') };
        } catch (e: any) {
          return { ok: false, error: e?.message || 'Error al generar la vista previa' };
        }
      },
    }),
  };
}
