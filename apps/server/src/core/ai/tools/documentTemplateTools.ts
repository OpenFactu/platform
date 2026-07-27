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
import { PdfRenderer, buildVisualTemplate, type DocType } from '@openfactu/pdf';
import { PdfPayloadBuilder } from '../../documents/PdfPayloadBuilder';
import {
  visualOptionsInputSchema,
  mergeVisualOptions,
  type VisualOptionsInput,
} from '../../documents/visualTemplateOptions';
import type { ChatToolContext } from './util';

export const TEMPLATE_DOC_TYPE_IDS = ['SINV', 'PINV', 'SO', 'PO', 'SDN', 'PDN'] as const;

// El esquema de opciones vive en core/documents/visualTemplateOptions.ts — lo
// comparten estas tools y el generador de la página de plantillas
// (POST /api/document-templates/generate). Se re-exporta para no romper los
// imports existentes (actionTools.ts).
export { visualOptionsInputSchema, mergeVisualOptions, type VisualOptionsInput };

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
