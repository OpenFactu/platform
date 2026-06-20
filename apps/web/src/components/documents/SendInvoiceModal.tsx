import React, { useState } from 'react';
import { Modal, Input, Button, useToast } from '@openfactu/ui';
import { Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AnyDocType = 'SINV' | 'PINV' | 'SDN' | 'PDN' | 'SO' | 'PO';

const DOC_LABEL: Record<AnyDocType, string> = {
  SINV: 'Factura',
  PINV: 'Factura',
  SDN: 'Albarán',
  PDN: 'Albarán',
  SO: 'Pedido',
  PO: 'Pedido',
};

interface Props {
  open: boolean;
  onClose: () => void;
  docType: AnyDocType;
  docId: string;
  docCode: string;
  partnerName?: string;
  partnerEmail?: string;
}

/**
 * Modal "Enviar por email" para una factura (venta o compra). Llama a
 * `POST /api/email/send-invoice` que genera el PDF, lo adjunta y encola
 * el envío con reintentos. El asunto/cuerpo son editables antes de enviar.
 */
export const SendInvoiceModal: React.FC<Props> = ({
  open,
  onClose,
  docType,
  docId,
  docCode,
  partnerName,
  partnerEmail,
}) => {
  const { token, user } = useAuth();
  const toast = useToast();

  const label = DOC_LABEL[docType] || 'Documento';
  const [to, setTo] = useState(partnerEmail || '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(`${label} ${docCode}`);
  const [body, setBody] = useState(
    `Hola${partnerName ? ' ' + partnerName : ''},\n\nAdjuntamos ${label.toLowerCase()} ${docCode}.\n\nSaludos.`,
  );
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const submit = async () => {
    if (!to.trim()) {
      toast.error('Indica un destinatario');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/email/send-document', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          docType,
          docId,
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject,
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      toast.success(
        `Email encolado → ${data.to || to}. Te notificamos cuando se entregue.`,
      );
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Enviar factura">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xs bg-accent/10 text-accent">
            <Mail size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-slate-100 font-display">
              Enviar factura
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-400 font-mono">{docCode}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Para">
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="cliente@empresa.com"
            />
          </Field>
          <Field label="Con copia (CC)">
            <Input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="opcional, varios separados por coma"
            />
          </Field>
          <Field label="Asunto">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Mensaje">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="flex w-full rounded-[2px] border border-[var(--k-line)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] text-[var(--k-ink-900)] dark:text-slate-100 px-3 py-2 focus-visible:outline-none focus-visible:border-accent"
            />
          </Field>
          <p className="text-[10px] text-ink-400 font-mono">
            El PDF se genera y adjunta automáticamente.
          </p>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="border-t border-line dark:border-ink-700 pt-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400 mb-2">
              Vista previa
            </h3>
            <div className="rounded-sm border border-line dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
              <div className="bg-line-2/60 dark:bg-ink-800 px-4 py-2 text-xs space-y-0.5">
                <div>
                  <span className="font-mono text-ink-400">Para: </span>
                  <span className="text-ink-700 dark:text-slate-200">{to || '—'}</span>
                </div>
                {cc && (
                  <div>
                    <span className="font-mono text-ink-400">Cc: </span>
                    <span className="text-ink-700 dark:text-slate-200">{cc}</span>
                  </div>
                )}
                <div>
                  <span className="font-mono text-ink-400">Asunto: </span>
                  <span className="font-bold text-ink-900 dark:text-slate-100">{subject}</span>
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-ink-700 dark:text-slate-200 p-4">
                {body}
              </pre>
              <div className="px-4 py-2 border-t border-line dark:border-ink-700 text-[11px] text-ink-500 dark:text-ink-400 flex items-center gap-2">
                <Mail size={12} />
                Adjunto: <span className="font-mono">{docCode}.pdf</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => setShowPreview((v) => !v)} disabled={sending}>
            {showPreview ? 'Ocultar preview' : 'Ver preview'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={sending} className="gap-2">
              <Mail size={14} /> {sending ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
      {label}
    </label>
    {children}
  </div>
);
