import React, { useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Alert, Button, Spinner, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useCurrentTab, useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { CreditNoteHeader } from '../components/documents/CreditNoteHeader';
import { CreditNoteLines } from '../components/documents/CreditNoteLines';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { invoicesRoute, type InvoiceSide } from '../domain/creditNote';
import { buildFormSteps } from '../domain/formSteps';
import { useCreditNote } from '../hooks/useCreditNote';
import { useDocument } from '../hooks/useDocument';
import { DocType } from '@openfactu/common';

/**
 * Un abono es un documento más: se crea en su propia pantalla, con los mismos pasos que
 * una factura, y no en una ventana que con muchas líneas se queda corta.
 */
export const CreditNoteCreate: React.FC = () => {
  const { id = '' } = useParams();
  const location = useLocation();
  const side: InvoiceSide = location.pathname.startsWith('/sales') ? 'sales' : 'purchase';
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const { flags } = useTheme();
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const currentTab = useCurrentTab();
  const fromReturn = new URLSearchParams(location.search).get('fromReturn') === '1';
  const note = useCreditNote(
    side,
    id,
    flags.enforceWarehouseZones,
    fromReturn ? { reason: t('doc.creditNote.reasonFromReturn') } : undefined,
  );
  const { data } = note;
  const permissionPath = side === 'sales' ? '/sales/invoices' : '/purchases/invoices';
  // Los maestros de cualquier alta: las líneas se pintan como en una factura.
  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: side === 'sales' ? DocType.SalesInvoice : DocType.PurchaseInvoice,
    apiEndpoint: `/api${permissionPath}`,
    permissions: (user as any)?.permissions?.[permissionPath],
  });
  const { masters } = doc;

  const code = data?.invoice.code;
  useEffect(() => {
    if (code) currentTab.rename(t('doc.creditNote.tabTitle', { code }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'none' }), [locale]);

  const openInvoice = () => openTab(`${invoicesRoute(side)}/${id}`);

  const create = async () => {
    try {
      const created = await note.submit();
      toast.success(t('doc.creditNote.created'));
      openTab(`${invoicesRoute(side)}/${created.id}`);
      currentTab.close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('doc.creditNote.error'));
    }
  };

  const notice = (tone: 'danger' | 'info' | 'warning', text: string) => (
    <div className="p-4 space-y-4">
      <Alert tone={tone}>{text}</Alert>
      <Button variant="secondary" onClick={openInvoice}>
        {t('doc.creditNote.openInvoice')}
      </Button>
    </div>
  );

  if (note.failed) return notice('danger', t('doc.creditNote.loadError'));
  if (!data || (!doc.state.mastersError && masters.items.length === 0)) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (note.form.drafts.length === 0) return notice('info', t('doc.creditNote.nothingLeft'));
  if (data.documentTypes.length === 0) return notice('warning', t('doc.creditNote.noTypes'));

  return (
    <DocumentFormLayout
      title={t('doc.creditNote.title', { code: code ?? '' })}
      subtitle={t(fromReturn ? 'doc.creditNote.introFromReturn' : 'doc.creditNote.intro')}
      submitLabel={t('doc.creditNote.submit')}
      onSubmit={create}
      isSubmitting={note.saving}
      canSubmit={doc.state.canWrite}
      steps={steps}
      status={note.status}
      totals={
        <div className="space-y-3">
          <DocumentTotalsBlock
            variant="plain"
            subtotal={-note.totals.subtotal}
            tax={-note.totals.tax}
            total={-note.totals.total}
            totalLabel={t('doc.creditNote.totalLabel')}
          />
          {note.totals.withholding > 0 && (
            <p className="text-xs text-fg-muted">
              {t('doc.creditNote.withholdingBack', { amount: fmt.money(note.totals.withholding) })}
            </p>
          )}
        </div>
      }
      sections={{
        header: <CreditNoteHeader side={side} data={data} form={note.form} set={note.set} />,
        lines: <CreditNoteLines side={side} invoiceId={id} note={note} masters={masters} />,
      }}
    />
  );
};

export default CreditNoteCreate;
