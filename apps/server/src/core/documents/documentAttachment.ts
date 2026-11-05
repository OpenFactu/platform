/** El PDF de un documento, listo para adjuntarlo a un correo. */
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Locale } from '../../i18n';

export interface BuiltDocumentPdf {
  pdf: Buffer;
  payload: any;
  code: string;
}

/** `null` si ese tipo de documento no tiene plantilla por defecto. */
export async function buildDocumentPdf(
  docType: string,
  docId: string,
  tenantClient: any,
  locale: Locale = 'es',
): Promise<BuiltDocumentPdf | null> {
  // Puppeteer y las plantillas se cargan solo cuando hace falta un PDF.
  const { PdfRenderer, extractMetaFromHtml, DEFAULT_VISUAL_OPTIONS } =
    await import('@openfactu/pdf');
  const { PdfPayloadBuilder } = await import('./PdfPayloadBuilder');

  const [template] = await tenantClient
    .select()
    .from(schema.documentTemplates)
    .where(
      and(
        eq(schema.documentTemplates.docType, docType),
        eq(schema.documentTemplates.isDefault, true),
      ),
    );
  if (!template) return null;

  const payload = await PdfPayloadBuilder.build(docType as any, docId, tenantClient, locale);
  const meta = extractMetaFromHtml(template.html) || DEFAULT_VISUAL_OPTIONS;
  const renderOpts = PdfRenderer.renderOptionsFromVisual(meta);
  if ((meta as any).showDocQr || (meta as any).showDocBarcode) {
    (renderOpts as any).pageFooter = PdfRenderer.pageFooterFromPayload(payload);
  }
  const pdf = await PdfRenderer.render(template.html, payload, renderOpts);
  return { pdf, payload, code: payload.doc.docCode || docId };
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export async function buildDocumentAttachment(
  docType: string,
  docId: string,
  tenantClient: any,
  locale: Locale = 'es',
): Promise<MailAttachment | null> {
  const built = await buildDocumentPdf(docType, docId, tenantClient, locale);
  if (!built) return null;
  return {
    filename: `${built.code}.pdf`,
    content: built.pdf,
    contentType: 'application/pdf',
  };
}
