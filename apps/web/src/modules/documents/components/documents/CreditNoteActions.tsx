import React, { useState } from 'react';
import { Alert, Badge, Button } from '@openfactu/ui';
import { ExternalLink, ReceiptText, Undo2, WalletCards } from 'lucide-react';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { creditNoteRemaining, invoicesRoute, type InvoiceSide } from '../../domain/creditNote';
import { useInvoiceCreditNotes } from '../../hooks/useInvoiceCreditNotes';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { RegisterPaymentModal } from '../payments/RegisterPaymentModal';
import { ApplyCreditModal } from './ApplyCreditModal';

interface Props {
  side: InvoiceSide;
  invoice: any;
  invoiceCode: string;
  canWrite: boolean;
  /** Tras aplicar o devolver saldo, para volver a leer la factura. */
  onChanged: () => void;
}

/**
 * Lo que se puede hacer con los abonos desde una factura: ver los que tiene y crearle otro
 * si aún queda algo por abonar o, si ya es un abono, ver a cuál corrige y usar su saldo.
 */
export const CreditNoteActions: React.FC<Props> = (props) =>
  props.invoice.rectifiesInvoiceId ? <NoteDetail {...props} /> : <InvoiceNotes {...props} />;

const InvoiceNotes: React.FC<Props> = ({ side, invoice, canWrite }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const { openTab } = useTabs();
  const issued = invoice.status === 'O' && !!invoice.isLocked;
  const { notes, creditable, pendingReturn } = useInvoiceCreditNotes(side, invoice.id, issued);

  const create = () => {
    openTab(`${invoicesRoute(side)}/${invoice.id}/credit-note`, {
      title: t('doc.routes.newCreditNote'),
    });
  };

  const createFromReturn = () => {
    openTab(`${invoicesRoute(side)}/${invoice.id}/credit-note?fromReturn=1`, {
      title: t('doc.routes.newCreditNote'),
    });
  };

  return (
    <>
      {pendingReturn > 0 && (
        <div className="w-full">
          <Alert
            tone="warning"
            icon={<Undo2 size={16} />}
            action={
              canWrite ? (
                <Button size="sm" variant="secondary" onClick={createFromReturn}>
                  {t('doc.creditNote.createFromReturn')}
                </Button>
              ) : undefined
            }
          >
            {t('doc.creditNote.pendingReturn', { count: fmt.quantity(pendingReturn) })}
          </Alert>
        </div>
      )}
      {issued && canWrite && creditable && (
        <ResponsiveActions
          source="secondary:credit-note"
          actions={[
            {
              id: 'credit-note',
              label: t('doc.creditNote.create'),
              icon: <Undo2 size={19} />,
              onClick: create,
            },
          ]}
        >
          <Button size="sm" variant="outline" onClick={create} className="gap-2">
            <Undo2 size={14} />
            <span>{t('doc.creditNote.create')}</span>
          </Button>
        </ResponsiveActions>
      )}
      {notes.length > 0 && (
        <div className="w-full">
          <Alert tone="info" icon={<ReceiptText size={16} />}>
            <div className="text-sm font-semibold">
              {notes.length === 1
                ? t('doc.creditNote.hasOne')
                : t('doc.creditNote.hasMany', { count: notes.length })}
            </div>
            {!creditable && <div className="text-sm">{t('doc.creditNote.fullyCredited')}</div>}
            <ul className="mt-2 space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{note.code}</span>
                      {note.status === 'D' && (
                        <Badge variant="warning">{t('doc.status.draft')}</Badge>
                      )}
                    </div>
                    <div>
                      {[note.documentTypeName, fmt.date(note.date), fmt.money(note.total)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {note.available > 0 && (
                      <div className="font-semibold">
                        {t('doc.creditNote.balance', { amount: fmt.money(note.available) })}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => openTab(`${invoicesRoute(side)}/${note.id}`)}
                  >
                    <ExternalLink size={14} />
                    <span>{t('doc.creditNote.openNote')}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
    </>
  );
};

const NoteDetail: React.FC<Props> = ({ side, invoice, invoiceCode, canWrite, onChanged }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const { openTab } = useTabs();
  const [applying, setApplying] = useState(false);
  const [refunding, setRefunding] = useState(false);

  const issued = invoice.status === 'O' && !!invoice.isLocked;
  const available = creditNoteRemaining(invoice);

  return (
    <div className="w-full">
      <Alert tone="info" icon={<ReceiptText size={16} />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="font-semibold">
              {t('doc.creditNote.rectifies', { ref: invoice.rectifyRef || '' })}
            </div>
            {invoice.rectifyReason && (
              <div>{t('doc.creditNote.reasonValue', { reason: invoice.rectifyReason })}</div>
            )}
            {issued && available > 0 && (
              <div className="mt-1 font-semibold">
                {t('doc.creditNote.balance', { amount: fmt.money(available) })}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => openTab(`${invoicesRoute(side)}/${invoice.rectifiesInvoiceId}`)}
            >
              <ExternalLink size={14} />
              <span>{t('doc.creditNote.openInvoice')}</span>
            </Button>
            {issued && available > 0 && canWrite && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setApplying(true)}
                >
                  <WalletCards size={14} />
                  <span>{t('doc.creditNote.apply')}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setRefunding(true)}
                >
                  <Undo2 size={14} />
                  <span>{t('doc.creditNote.refund')}</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </Alert>

      <ApplyCreditModal
        open={applying}
        onClose={() => setApplying(false)}
        side={side}
        noteId={invoice.id}
        available={available}
        onApplied={onChanged}
      />
      <RegisterPaymentModal
        open={refunding}
        onClose={() => setRefunding(false)}
        kind={side}
        invoiceId={invoice.id}
        invoiceCode={invoiceCode}
        remaining={available}
        refund
        onSuccess={onChanged}
      />
    </div>
  );
};
