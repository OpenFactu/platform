import React, { useState } from 'react';
import { Modal, Input, Button, useToast } from '@openfactu/ui';
import { Mail, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AnyDocType = 'SINV' | 'PINV' | 'SDN' | 'PDN' | 'SO' | 'PO';

interface Item {
  docType: AnyDocType;
  docId: string;
  docCode?: string;
  partnerName?: string;
  partnerEmail?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: Item[];
  onSuccess?: () => void;
}

/**
 * Envío masivo: para cada item abre un email al `partner.email` con el PDF
 * adjunto. Permite editar el asunto (prefijo) y cuerpo con placeholders:
 * `{{code}}`, `{{label}}`, `{{date}}`, `{{company}}`.
 *
 * Llama a `POST /api/email/send-documents`. Muestra el detalle por ítem:
 * queued / error ("sin email", "sin plantilla", etc.).
 */
export const BulkSendModal: React.FC<Props> = ({ open, onClose, items, onSuccess }) => {
  const { token, user } = useAuth();
  const toast = useToast();

  const [subjectPrefix, setSubjectPrefix] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState(
    'Hola,\n\nAdjuntamos {{label}} {{code}} emitido el {{date}}.\n\nSaludos,\n{{company}}',
  );
  const [cc, setCc] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<
    Array<{ docType: string; docId: string; ok: boolean; error?: string; to?: string }>
  >([]);

  const missingEmailCount = items.filter((i) => !i.partnerEmail).length;

  const submit = async () => {
    setSending(true);
    setResults([]);
    try {
      const res = await fetch('/api/email/send-documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items.map((i) => ({ docType: i.docType, docId: i.docId })),
          cc: cc.trim() || undefined,
          subjectPrefix: subjectPrefix.trim() || undefined,
          bodyTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      const failed = (data.results || []).filter((r: any) => !r.ok).length;
      toast.success(
        `${data.queued} encolados · envío desatendido, te llegará una notificación por cada uno.`
        + (failed ? ` ${failed} sin email/plantilla.` : ''),
      );
      if (data.queued > 0) onSuccess?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error en envío masivo');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Envío masivo">
      <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xs bg-accent/10 text-accent">
            <Mail size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-slate-100 font-display">
              Envío masivo
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {items.length} documentos · cada uno al email de su interlocutor
            </p>
          </div>
        </div>

        {missingEmailCount > 0 && (
          <div className="p-2.5 rounded-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200">
            ⚠ {missingEmailCount} de {items.length} interlocutor(es) no tienen email registrado — esos
            se omitirán.
          </div>
        )}

        <div className="space-y-3">
          <Field label="Prefijo asunto (opcional)">
            <Input
              value={subjectPrefix}
              onChange={(e) => setSubjectPrefix(e.target.value)}
              placeholder="p.ej. '[Keirost]' (se antepone al número de documento)"
            />
          </Field>

          <Field label="Con copia (CC)">
            <Input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="opcional, aplicado a todos"
            />
          </Field>

          <Field label="Mensaje (usa {{code}}, {{label}}, {{date}}, {{company}})">
            <textarea
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={5}
              className="flex w-full rounded-[2px] border border-[var(--k-line)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] text-[var(--k-ink-900)] dark:text-slate-100 px-3 py-2 focus-visible:outline-none focus-visible:border-accent"
            />
          </Field>
        </div>

        {/* Lista de documentos */}
        <div className="border border-line dark:border-ink-700 rounded-sm overflow-hidden">
          <div className="bg-line-2/60 dark:bg-ink-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Documentos a enviar
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {items.map((it, idx) => {
              const r = results.find(
                (x) => x.docType === it.docType && x.docId === it.docId,
              );
              return (
                <li
                  key={`${it.docType}-${it.docId}`}
                  className={`flex items-center gap-3 px-3 py-2 text-xs border-t border-line dark:border-ink-700 ${idx === 0 ? 'border-t-0' : ''}`}
                >
                  <span className="font-mono text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-xs">
                    {it.docType}
                  </span>
                  <span className="font-mono font-bold text-ink-900 dark:text-slate-100">
                    {it.docCode || it.docId.slice(0, 8)}
                  </span>
                  <span className="flex-1 truncate text-ink-700 dark:text-slate-200">
                    {it.partnerName || '—'}
                  </span>
                  <span className="text-[10px] text-ink-400 truncate">
                    {it.partnerEmail || 'sin email'}
                  </span>
                  {r ? (
                    r.ok ? (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 text-[10px]" title={r.error}>
                        <XCircle size={14} /> {r.error?.slice(0, 20)}
                      </span>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cerrar
          </Button>
          <Button onClick={submit} disabled={sending || items.length === 0} className="gap-2">
            <Mail size={14} />
            {sending ? 'Enviando…' : `Enviar ${items.length - missingEmailCount}`}
          </Button>
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
