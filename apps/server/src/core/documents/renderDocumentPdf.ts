import { eq, and } from 'drizzle-orm';
import { Response } from 'express';
import * as schema from '../../db/schema';
import {
  PdfRenderer,
  extractMetaFromHtml,
  buildVisualTemplate,
  DEFAULT_VISUAL_OPTIONS,
  type DocType,
  type VisualOptions,
} from '@openfactu/pdf';
import { PdfPayloadBuilder } from './PdfPayloadBuilder';
import { registerCanvasHelpers } from '../../api/documentTemplates';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';

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
      finalHtml = buildVisualTemplate(docType, finalOpts);
    } else if ((payload as any).doc?.paymentStatus === 'paid') {
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
      finalHtml = buildVisualTemplate(docType, finalOpts);
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
