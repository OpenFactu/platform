/**
 * Endpoints de correo por tenant.
 *
 *   GET  /api/email/config       — lee la config SMTP (sin password en claro)
 *   PUT  /api/email/config       — actualiza la config SMTP
 *   POST /api/email/verify       — prueba la conexión al SMTP (no envía)
 *   POST /api/email/test         — envía un email de prueba a una dirección
 *   POST /api/email/send         — envía correo arbitrario (uso interno)
 *
 * Requieren ADMIN o SUPERUSER (el contenido SMTP es sensible).
 */

import { Router } from 'express';
import {
  readConfig,
  writeConfig,
  verifyConnection,
  sendMail,
  type EmailConfig,
} from '../core/email/Mailer';
import { enqueueMail, mailQueue } from '../core/email/MailQueue';

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Requiere ADMIN o SUPERUSER' });
  }
  next();
}

function redactPassword(
  cfg: EmailConfig,
): Omit<EmailConfig, 'password'> & { passwordSet: boolean } {
  const { password, ...rest } = cfg;
  return { ...rest, passwordSet: Boolean(password) };
}

router.use(requireAdmin);

router.get('/config', async (req: any, res) => {
  try {
    const cfg = await readConfig(req.tenantClient);
    res.json(redactPassword(cfg));
  } catch (e: any) {
    console.error('[Email.getConfig]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.put('/config', async (req: any, res) => {
  try {
    const patch = { ...req.body };
    // Si el cliente manda password vacía (porque solo escribe el resto), no
    // sobreescribimos la existente. Para limpiarla, el UI debe enviar
    // explícitamente `"clearPassword": true`.
    if (patch.clearPassword === true) patch.password = '';
    else if (patch.password === '' || patch.password === undefined) delete patch.password;
    delete patch.clearPassword;
    // Coerciones suaves.
    if (typeof patch.port === 'string') patch.port = Number(patch.port);
    if (typeof patch.secure === 'string') patch.secure = patch.secure === 'true';
    if (typeof patch.enabled === 'string') patch.enabled = patch.enabled === 'true';
    const next = await writeConfig(req.tenantClient, patch);
    res.json(redactPassword(next));
  } catch (e: any) {
    console.error('[Email.putConfig]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.post('/verify', async (req: any, res) => {
  // Si el body trae un override (el UI manda el formulario al vuelo), lo
  // usamos. Si no, cae a la config guardada en systemConfigs.
  const override = req.body && typeof req.body === 'object' ? { ...req.body } : undefined;
  if (override) {
    if (typeof override.port === 'string') override.port = Number(override.port);
    if (typeof override.secure === 'string') override.secure = override.secure === 'true';
  }
  const r = await verifyConnection(req.tenantClient, override);
  res.json(r);
});

/**
 * POST /api/email/test — el test SÍ se envía de forma sincrónica porque el
 * usuario está mirando el UI y quiere saber si funciona ahora mismo. Los
 * envíos reales del ERP van por la cola (/send).
 */
router.post('/test', async (req: any, res) => {
  const to = (req.body?.to as string) || req.user?.email;
  if (!to) return res.status(400).json({ error: 'Falta destinatario' });
  try {
    const result = await sendMail(req.tenantId, req.tenantClient, {
      to,
      subject: 'Keirost — prueba de correo',
      text:
        'Si recibes este mensaje, la configuración SMTP de tu empresa en Keirost ERP ' +
        'funciona correctamente.',
      html: `
        <div style="font-family:'DM Sans',system-ui,sans-serif;padding:24px;max-width:520px;background:#FAFBFC;border:1px solid #E2E8F0;border-radius:4px;">
          <h2 style="margin:0 0 12px 0;color:#0A1628;font-family:'Syne',sans-serif;font-weight:700;">
            Correo de prueba
          </h2>
          <p style="color:#2D3A4A;line-height:1.6;">
            Si ves este mensaje, la configuración SMTP de tu empresa en
            <strong style="color:#0D9488;">Keirost ERP</strong> funciona correctamente.
          </p>
          <p style="color:#94A3B8;font-size:12px;margin-top:24px;font-family:'DM Mono',monospace;">
            Enviado a las ${new Date().toLocaleString('es-ES')}.
          </p>
        </div>`,
    });
    res.json(result);
  } catch (e: any) {
    console.error('[Email.test]', e);
    res.status(500).json({ error: e?.message || 'Error al enviar' });
  }
});

/**
 * POST /api/email/send — envío DESATENDIDO. Enfila en la cola y responde
 * inmediatamente con el jobId. El SMTP se negocia en background con
 * reintentos exponenciales si falla (hasta 5 intentos). Consulta el estado
 * con GET /api/email/queue/:id.
 */
router.post('/send', async (req: any, res) => {
  try {
    const { to, subject, text, html, cc, bcc, attachments } = req.body || {};
    if (!to || !subject) return res.status(400).json({ error: 'Faltan to/subject' });

    // Los adjuntos llegan como base64: [{ filename, contentBase64, contentType }]
    const mailAttachments = Array.isArray(attachments)
      ? attachments
          .filter((a: any) => a?.contentBase64 && a?.filename)
          .map((a: any) => ({
            filename: String(a.filename),
            content: Buffer.from(String(a.contentBase64), 'base64'),
            contentType: a.contentType || 'application/octet-stream',
          }))
      : undefined;

    const id = enqueueMail(req.tenantId, {
      to,
      subject,
      text,
      html,
      cc,
      bcc,
      attachments: mailAttachments,
    });
    res.status(202).json({ id, status: 'queued' });
  } catch (e: any) {
    console.error('[Email.send]', e);
    res.status(500).json({ error: e?.message || 'Error al encolar' });
  }
});

type DocType = 'SINV' | 'PINV' | 'SDN' | 'PDN' | 'SO' | 'PO';
const VALID_DOCTYPES: DocType[] = ['SINV', 'PINV', 'SDN', 'PDN', 'SO', 'PO'];
const DOC_LABELS: Record<DocType, string> = {
  SINV: 'Factura',
  PINV: 'Factura',
  SDN: 'Albarán',
  PDN: 'Albarán',
  SO: 'Pedido',
  PO: 'Pedido',
};

/**
 * Genera el PDF de un documento + lo prepara como adjunto.
 * Compartido por send-document y send-documents (bulk).
 */
async function buildPdfAttachment(
  docType: DocType,
  docId: string,
  tenantClient: any,
): Promise<{ pdf: Buffer; payload: any; code: string; label: string } | null> {
  const { PdfRenderer, extractMetaFromHtml, DEFAULT_VISUAL_OPTIONS } =
    await import('@openfactu/pdf');
  const { PdfPayloadBuilder } = await import('../core/documents/PdfPayloadBuilder');
  const schemaMod = await import('../db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [template] = await tenantClient
    .select()
    .from(schemaMod.documentTemplates)
    .where(
      and(
        eq(schemaMod.documentTemplates.docType, docType),
        eq(schemaMod.documentTemplates.isDefault, true),
      ),
    );
  if (!template) return null;

  const payload = await PdfPayloadBuilder.build(docType, docId, tenantClient);
  const meta = extractMetaFromHtml(template.html) || DEFAULT_VISUAL_OPTIONS;
  const renderOpts = PdfRenderer.renderOptionsFromVisual(meta);
  if ((meta as any).showDocQr || (meta as any).showDocBarcode) {
    (renderOpts as any).pageFooter = PdfRenderer.pageFooterFromPayload(payload);
  }
  const pdf = await PdfRenderer.render(template.html, payload, renderOpts);
  return {
    pdf,
    payload,
    code: payload.doc.docCode || docId,
    label: DOC_LABELS[docType],
  };
}

/**
 * POST /api/email/send-document — genera el PDF del documento, lo adjunta
 * y encola el email. Body: { docType, docId, to?, cc?, bcc?, subject?, body? }.
 * Soporta todos los tipos: SINV, PINV, SDN, PDN, SO, PO.
 */
router.post('/send-document', async (req: any, res) => {
  try {
    const {
      docType,
      docId,
      to: toOverride,
      cc,
      bcc,
      subject: subjectOverride,
      body: bodyOverride,
    } = req.body || {};
    if (!docType || !docId) return res.status(400).json({ error: 'Faltan docType/docId' });
    if (!VALID_DOCTYPES.includes(docType))
      return res.status(400).json({ error: `docType inválido (${VALID_DOCTYPES.join(', ')})` });

    const built = await buildPdfAttachment(docType, docId, req.tenantClient);
    if (!built) return res.status(404).json({ error: 'Sin plantilla default' });

    const to = toOverride || built.payload.partner.email;
    if (!to) return res.status(400).json({ error: 'El interlocutor no tiene email registrado' });

    const subject = subjectOverride || `${built.label} ${built.code}`;
    const text =
      bodyOverride ||
      `Hola,\n\nAdjuntamos ${built.label.toLowerCase()} ${built.code} emitido el ${built.payload.doc.date}.\n\nSaludos,\n${built.payload.company.name}`;

    const id = enqueueMail(
      req.tenantId,
      {
        to,
        cc,
        bcc,
        subject,
        text,
        attachments: [
          { filename: `${built.code}.pdf`, content: built.pdf, contentType: 'application/pdf' },
        ],
      },
      {
        userId: req.user?.id,
        label: `${built.label} ${built.code}`,
        link: linkForDoc(docType, docId),
      },
    );
    res.status(202).json({ id, status: 'queued', to });
  } catch (e: any) {
    console.error('[Email.sendDocument]', e);
    res.status(500).json({ error: e?.message || 'Error al encolar envío' });
  }
});

/** Devuelve la ruta relativa al detalle del documento en el front. */
function linkForDoc(docType: DocType, docId: string): string {
  switch (docType) {
    case 'SINV':
      return `/sales/invoices/${docId}`;
    case 'PINV':
      return `/purchases/invoices/${docId}`;
    case 'SDN':
      return `/sales/delivery-notes/${docId}`;
    case 'PDN':
      return `/purchases/delivery-notes/${docId}`;
    case 'SO':
      return `/sales/${docId}`;
    case 'PO':
      return `/purchases/orders/${docId}`;
  }
}

/**
 * POST /api/email/send-documents — envío masivo. Body: { items: [{docType,docId}], ... }.
 * Cada documento genera su propio email al `partner.email` del cliente.
 * Devuelve el nº encolados + errores por documento si los hay.
 */
router.post('/send-documents', async (req: any, res) => {
  try {
    const { items, cc, bcc, subjectPrefix, bodyTemplate } = req.body || {};
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'items vacío' });

    const results: Array<{
      docType: string;
      docId: string;
      ok: boolean;
      error?: string;
      queueId?: string;
      to?: string;
    }> = [];
    let queued = 0;
    for (const it of items) {
      const { docType, docId } = it || {};
      if (!docType || !docId || !VALID_DOCTYPES.includes(docType)) {
        results.push({ docType, docId, ok: false, error: 'docType/docId inválido' });
        continue;
      }
      try {
        const built = await buildPdfAttachment(docType, docId, req.tenantClient);
        if (!built) {
          results.push({ docType, docId, ok: false, error: 'Sin plantilla default' });
          continue;
        }
        const to = built.payload.partner.email;
        if (!to) {
          results.push({ docType, docId, ok: false, error: 'Sin email del interlocutor' });
          continue;
        }
        const subject = (subjectPrefix ? subjectPrefix + ' ' : '') + `${built.label} ${built.code}`;
        const text = bodyTemplate
          ? bodyTemplate
              .replace(/\{\{code\}\}/g, built.code)
              .replace(/\{\{label\}\}/g, built.label)
              .replace(/\{\{date\}\}/g, built.payload.doc.date)
              .replace(/\{\{company\}\}/g, built.payload.company.name)
          : `Hola,\n\nAdjuntamos ${built.label.toLowerCase()} ${built.code}.\n\nSaludos,\n${built.payload.company.name}`;
        const qid = enqueueMail(
          req.tenantId,
          {
            to,
            cc,
            bcc,
            subject,
            text,
            attachments: [
              { filename: `${built.code}.pdf`, content: built.pdf, contentType: 'application/pdf' },
            ],
          },
          {
            userId: req.user?.id,
            label: `${built.label} ${built.code}`,
            link: linkForDoc(docType, docId),
          },
        );
        queued++;
        results.push({ docType, docId, ok: true, queueId: qid, to });
      } catch (e: any) {
        results.push({ docType, docId, ok: false, error: e?.message || 'Error' });
      }
    }
    res.status(202).json({ queued, total: items.length, results });
  } catch (e: any) {
    console.error('[Email.sendDocuments]', e);
    res.status(500).json({ error: e?.message || 'Error en envío masivo' });
  }
});

/**
 * GET /api/email/queue/:id — estado de un envío encolado.
 */
router.get('/queue/:id', (req: any, res) => {
  const item = mailQueue.peek(req.params.id);
  if (!item) return res.status(404).json({ error: 'Job no encontrado' });
  // No exponemos el body del email en el status — solo metadatos.
  const { input, ...meta } = item;
  res.json({ ...meta, to: input.to, subject: input.subject });
});

/**
 * GET /api/email/queue — snapshot de toda la cola (solo items de este tenant).
 */
router.get('/queue', (req: any, res) => {
  const all = mailQueue.list();
  res.json(all.filter((i) => i.tenantId === req.tenantId));
});

export default router;
