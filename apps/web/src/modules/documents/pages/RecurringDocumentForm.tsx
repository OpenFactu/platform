import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  DatePicker,
  Field,
  FormGrid,
  Input,
  Loader,
  SearchableSelect,
  Select,
  Switch,
  Table,
  useToast,
} from '@openfactu/ui';
import { DocKind, DocSide } from '@openfactu/common';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import { BatchAssignmentPanel } from '@/modules/inventory/components/BatchAssignmentPanel';
import { AddLinesButton } from '../components/AddLinesButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { MobileLineCards } from '../components/MobileLineCards';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { buildFormSteps, formStepStatus } from '../domain/formSteps';
import { FREQUENCIES } from '../domain/sales';
import { useFormLineColumns } from '../hooks/useFormLineColumns';
import { useRecurringForm } from '../hooks/useRecurringForm';

/** Crear o cambiar una recurrente: lo mismo que una factura, más cuándo se repite. */
export const RecurringDocumentForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { t, locale } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const form = useRecurringForm({ id, fromInvoice: params.get('from') });
  const { doc, fields, set } = form;
  const { state, setState, masters, actions, computations } = doc;
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);

  const columns = useFormLineColumns({
    kind: DocKind.Invoice,
    side: DocSide.Sale,
    state,
    masters,
    actions,
    onAssignBatch: setBatchEditingIdx,
    onViewBatch: () => undefined,
    pluginTable: 'SalesInvoiceLine',
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'required' }), [locale]);
  // La fecha de la cabecera es la de inicio, y los lotes se eligen solos o no se pueden elegir.
  const status = formStepStatus(
    { ...state, date: fields.startDate },
    masters,
    {
      partnerLabel: t('doc.steps.theCustomer'),
      extra: { value: fields.name, message: t('doc.recurring.nameRequired') },
    },
    { batches: false, period: false },
  );

  if (form.loading || state.mastersLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }

  const submit = async () => {
    try {
      const saved = await form.submit();
      toast.success(t('doc.recurring.saved'));
      navigate(`/sales/recurring/${saved.id}`, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <>
      <DocumentFormLayout
        title={id ? t('doc.recurring.editTitle') : t('doc.recurring.newTitle')}
        subtitle={t('doc.recurring.formSubtitle')}
        submitLabel={t('doc.recurring.save')}
        onSubmit={submit}
        isSubmitting={form.saving}
        canSubmit={!state.seriesError && !state.isManualSeries}
        steps={steps}
        status={status}
        totals={
          <DocumentTotalsBlock
            variant="plain"
            subtotal={computations.subtotal}
            tax={computations.taxTotal}
            total={computations.total}
            withholdingAmount={computations.withholdingAmount}
            withholdingRate={state.pluginData?.__fiscal_withholdingRate ?? state.withholdingRate}
            totalLabel={t('doc.recurring.eachTotal')}
          />
        }
        sections={{
          header: (
            <div className="space-y-4">
              <FormGrid columns={2}>
                <Input
                  label={t('doc.recurring.name')}
                  required
                  value={fields.name}
                  placeholder={t('doc.recurring.namePlaceholder')}
                  onChange={(e) => set({ name: e.target.value })}
                />
                <Field label={t('doc.partner.customer')} required>
                  <SearchableSelect
                    value={state.partnerId}
                    onChange={actions.selectPartner}
                    options={masters.partners.map((p: any) => ({ label: p.name, value: p.id }))}
                    placeholder={t('doc.common.selectCustomer')}
                    required
                  />
                </Field>
                <Select
                  label={t('doc.recurring.frequency')}
                  value={fields.frequency}
                  onChange={(value) => set({ frequency: value as typeof fields.frequency })}
                  options={FREQUENCIES.map((frequency) => ({
                    value: frequency,
                    label: t(`doc.recurring.freq.${frequency}`),
                  }))}
                />
                <Field label={t('doc.form.series')} required error={state.seriesError || undefined}>
                  <SearchableSelect
                    value={state.seriesId}
                    onChange={setState.setSeriesId}
                    options={masters.series.map((s: any) => ({ label: s.name, value: s.id }))}
                    required
                  />
                </Field>
                <DatePicker
                  label={t('doc.recurring.startDate')}
                  required
                  value={fields.startDate}
                  onChange={(value) => set({ startDate: value ?? '' })}
                />
                <DatePicker
                  label={t('doc.recurring.endDate')}
                  value={fields.endDate}
                  onChange={(value) => set({ endDate: value ?? '' })}
                />
              </FormGrid>
              {state.isManualSeries && (
                <Alert tone="warning">{t('doc.recurring.manualSeries')}</Alert>
              )}
              <p className="text-xs text-fg-muted">{t('doc.recurring.startHint')}</p>
              <div className="space-y-2">
                <Switch
                  label={t('doc.recurring.autoPostLong')}
                  checked={fields.autoPost}
                  onChange={(autoPost) => set({ autoPost })}
                />
                <Switch
                  label={t('doc.recurring.autoSendLong')}
                  checked={fields.autoSend}
                  onChange={(autoSend) => set({ autoSend })}
                />
              </div>
              {fields.autoPost && <Alert tone="warning">{t('doc.recurring.autoWarning')}</Alert>}
            </div>
          ),
          lines: (
            <div>
              {isMobile ? (
                <MobileLineCards
                  columns={columns}
                  lines={state.lines || []}
                  emptyMessage={t('doc.invoices.noLines')}
                />
              ) : (
                <Table
                  responsive="scroll"
                  columns={columns}
                  data={state.lines || []}
                  emptyMessage={t('doc.invoices.noLines')}
                />
              )}
              <div className="p-4 border-t border-border-subtle">
                <AddLinesButton addLine={() => actions.addLine()} />
              </div>
            </div>
          ),
          fiscal: <DocumentFiscalPanel kind="sales" state={state} setState={setState} bare />,
        }}
      />
      <BatchAssignmentPanel
        isOpen={batchEditingIdx !== null}
        onClose={() => setBatchEditingIdx(null)}
        lines={state.lines}
        masters={masters}
        initialLineIdx={batchEditingIdx}
        isSale={true}
        onSave={(updates) => {
          updates.forEach((u) => actions.updateLine(u.idx, 'batchDetails', u.batchDetails));
        }}
      />
    </>
  );
};

export default RecurringDocumentForm;
