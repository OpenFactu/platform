import { eq, and } from 'drizzle-orm';
import { Response } from 'express';
import * as schema from '../../db/schema';
import {
  PdfRenderer,
  extractMetaFromHtml,
  DEFAULT_VISUAL_OPTIONS,
  type DocType,
  type VisualOptions,
  type WatermarkOptions,
} from '@openfactu/pdf';
import { PdfPayloadBuilder } from './PdfPayloadBuilder';
import { registerCanvasHelpers } from '../../api/documentTemplates';
import { runTemplateQueries, type TemplateQuery } from './templateQueries';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';

/**
 * Inyecta un watermark diagonal semitransparente en un HTML de plantilla YA
 * COMPLETO, como overlay `position:fixed` justo antes de `</body>`.
 *
 * A propósito NO usamos `buildVisualTemplate` (que reconstruye la página
 * entera desde cero a partir de `VisualOptions`): eso descartaba silenciosamente
 * la plantilla real elegida por el usuario (`?templateId=...` o cualquier
 * plantilla custom no-default) y siempre renderizaba el diseño genérico de
 * fábrica en cuanto un documento estaba pagado o en borrador con
 * `watermarkDraft` activo — independientemente de qué plantilla se hubiera
 * seleccionado.
 */
function injectWatermark(html: string, wm: WatermarkOptions): string {
  const text = String(wm.text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const overlay = `<div aria-hidden="true" style="position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;z-index:99999;"><span style="color:${wm.color};opacity:${wm.opacity};font-size:${wm.fontSize}pt;font-weight:bold;white-space:nowrap;transform:rotate(${wm.rotation}deg);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">${text}</span></div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${overlay}</body>`) : `${html}${overlay}`;
}

/**
 * Helper reutilizable para el endpoint `GET /:id/pdf` de todos los tipos de documento.
 * Resuelve la plantilla (query ?templateId o default), construye el payload, renderiza el PDF
 * y lo escribe en la response.
 */
export async function renderDocumentPdf(
  docType: DocType,
  documentId: string,
  templateId: string | undefined,
  tenantClient: any,
  res: Response,
  tenantId?: string | null,
): Promise<void> {
  // 1. Resolver la plantilla
  let template: any = null;
  if (templateId) {
    const [row] = await tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, templateId));
    template = row;
  }
  if (!template) {
    const [row] = await tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(
        and(
          eq(schema.documentTemplates.docType, docType),
          eq(schema.documentTemplates.isDefault, true),
        ),
      );
    template = row;
  }
  if (!template) {
    res.status(404).json({ error: `No hay plantilla default para ${docType}` });
    return;
  }

  // 2. Construir payload
  const payload = await PdfPayloadBuilder.build(docType, documentId, tenantClient);

  // 2.b Ejecutar las consultas SQL guardadas en la plantilla (canvasLayout.queries)
  // e inyectar sus filas como `queries.<name>`, igual que hacen el preview del
  // diseñador y render-free. Solo admins pueden guardar queries, así que
  // ejecutarlas aquí no amplía permisos. Un fallo de query no aborta el PDF.
  const layoutQueries: TemplateQuery[] = ((template.canvasLayout as any)?.queries ??
    []) as TemplateQuery[];
  if (layoutQueries.length > 0) {
    const queryResults = await runTemplateQueries(tenantClient, layoutQueries, {
      docId: (payload as any)?.doc?.id ?? documentId,
      partnerId: (payload as any)?.partner?.id ?? null,
      companyId: (payload as any)?.company?.id ?? null,
      tenantId: tenantId ?? null,
    });
    (payload as any).queries = queryResults.byName;
    if (queryResults.errors.length > 0) {
      console.warn(
        `[renderDocumentPdf] ${docType} ${documentId} queries con errores:`,
        JSON.stringify(queryResults.errors),
      );
    }
  }

  // 3. Extraer opciones del meta del HTML
  const meta = extractMetaFromHtml(template.html);
  const baseOpts: VisualOptions = meta || DEFAULT_VISUAL_OPTIONS;

  // 4. Flags: si watermarkDraft está activo Y el documento está en estado abierto,
  //    forzamos la marca de agua "BORRADOR" sobreescribiendo las opciones visuales
  //    y regenerando el HTML del template.
  let finalHtml = template.html;
  let finalOpts: VisualOptions = baseOpts;
  try {
    const flags = await getConfigSection(tenantClient, 'flags', FLAGS_DEFAULTS);
    // watermarkDraft sólo fuerza la marca de agua si la plantilla NO la ha desactivado explícitamente.
    // Si el usuario desactivó la marca en el editor de plantillas, se respeta su decisión.
    if (flags.watermarkDraft && payload.doc.status === 'D') {
      finalOpts = {
        ...baseOpts,
        watermark: {
          ...baseOpts.watermark,
          enabled: true,
          text: baseOpts.watermark?.text || 'BORRADOR',
        },
      };
      finalHtml = injectWatermark(template.html, finalOpts.watermark);
    } else if (flags.watermarkPaid && (payload as any).doc?.paymentStatus === 'paid') {
      // Si la factura está totalmente pagada, marca de agua "PAGADA" en verde.
      finalOpts = {
        ...baseOpts,
        watermark: {
          ...baseOpts.watermark,
          enabled: true,
          text: 'PAGADA',
          color: '#16A34A',
          opacity: 0.18,
          rotation: -25,
          fontSize: 140,
        },
      };
      finalHtml = injectWatermark(template.html, finalOpts.watermark);
    }
  } catch (err: any) {
    console.warn(
      '[renderDocumentPdf] No se pudo leer flags, usando template tal cual:',
      err.message,
    );
  }

  // 4.b Toggle local `showInternalOrder` (extensión propia, no parte del
  // paquete @openfactu/pdf). Cuando está activo y el documento tiene
  // proyecto asociado, lo inyectamos como customField "Proyecto" para que
  // se renderice junto al resto de campos custom de cabecera.
  if ((finalOpts as any).showInternalOrder) {
    const io = (payload.doc as any).internalOrder;
    if (io && io.code) {
      const docAny = payload.doc as any;
      docAny.customFields = {
        ...(docAny.customFields || {}),
        Proyecto: `${io.code}${io.name ? ' — ' + io.name : ''}`,
      };
    }
  }

  // 5. Renderizar — añade pageFooter con QR+Code-128+hash si la plantilla
  // tiene showDocQr / showDocBarcode activos.
  const renderOptions = PdfRenderer.renderOptionsFromVisual(finalOpts);
  if (finalOpts.showDocQr || finalOpts.showDocBarcode) {
    renderOptions.pageFooter = PdfRenderer.pageFooterFromPayload(payload, finalOpts.footer.text);
  }
  // Plantillas canvas usan helpers propios (sum/count/avg/today/neq/lt/formatAddress)
  // que registramos aquí para que también funcionen al imprimir un documento real.
  registerCanvasHelpers();
  const buffer = await PdfRenderer.render(finalHtml, payload, renderOptions);

  // 4. Responder
  const filename = `${payload.doc.docCode || documentId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(buffer);
}
