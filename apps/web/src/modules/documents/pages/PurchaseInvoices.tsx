import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { SeriesPeriodFields } from '../components/form/SeriesPeriodFields';
import { HeaderSection, LinesSection, PartnerField } from '../components/form/FormPieces';
import { useFormLineColumns } from '../hooks/useFormLineColumns';
import { buildFormSteps, formStepStatus } from '../domain/formSteps';

import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Input,
  DatePicker,
  Loader,
  usePopup,
  useToast,
  Badge,
  FilterBar,
  PageHeader,
  FormGrid,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { CloneDocumentActions } from '@/components/common/CloneDocumentActions';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import {
  FileStack,
  Plus,
  Save,
  FileText,
  AlertCircle,
  Copy,
  Download,
  CreditCard,
  Eye,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { TraceabilityButton } from '@/components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { buildDetailLineColumns, statusBadgeProps } from '../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { downloadPdf } from '@/utils/downloadPdf';
import { useFormat } from '@/hooks/useFormat';
import { useTheme } from '@/context/ThemeContext';
import { formatDocCode } from '@/utils/docCode';
import { BatchSelectionModal } from '@/modules/inventory/components/BatchSelectionModal';
import { BatchAssignmentPanel } from '@/modules/inventory/components/BatchAssignmentPanel';

import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '@/hooks/useDocumentScanner';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';

import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';
import { PaymentStatusBadge } from '../components/payments/PaymentStatusBadge';
import { RegisterPaymentModal } from '../components/payments/RegisterPaymentModal';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { SendInvoiceModal } from '../components/documents/SendInvoiceModal';
import { InvoicePaymentsList } from '../components/payments/InvoicePaymentsList';
import { docsApi } from '../api';
import { crudApi } from '@/shared/api';
import { useI18n } from '@/i18n/I18nContext';

// Eliminamos SerialBadges inline para usar el modo Popup limpio

// --- Sub-componente: VISTA DE LISTADO ---
const InvoiceList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onCreateFromClone?: (payload: { header: any; lines: any[] }) => void;
  onDetail: (inv: any) => void;
  mastersError?: string | null;
  doc: any;
}> = ({ data, loading, partners, onCreate, onCreateFromClone, onDetail, mastersError, doc }) => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const toast = useToast();
  const fmt = useFormat();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`/api/purchases/invoices/${id}/pdf`);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('doc.common.pdfError'));
    } finally {
      setDownloadingId(null);
    }
  };

  const { filteredData, searchTerm, setSearchTerm, activeFilters, setFilter, clearFilters } =
    useDataTable({
      data,
      searchColumns: ['docCode', 'partnerName', 'total'] as any,
      filters: [
        {
          key: 'partnerId',
          type: 'select',
          label: t('doc.partner.supplier'),
          options: partners.map((p) => ({ label: p.name, value: p.id })),
        },
        {
          key: 'status',
          type: 'select',
          label: t('doc.common.status'),
          options: [
            { label: t('doc.status.draft'), value: 'D' },
            { label: t('doc.status.posted'), value: 'O' },
            { label: t('doc.status.cancelled'), value: 'X' },
          ],
        },
        { key: 'date', type: 'date', label: t('doc.common.date') },
      ],
    });

  const columns = [
    {
      header: t('doc.common.document'),
      card: 'title' as const,
      sortable: true,
      sortAccessor: (item: any) => formatDocCode(item),
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-fg-default leading-none">{formatDocCode(item)}</span>
          <span className="text-[10px] text-fg-subtle font-mono mt-1 uppercase tracking-tighter">
            {t('doc.common.idShort', { id: item.id.substring(0, 8) })}
          </span>
        </div>
      ),
    },
    {
      header: t('doc.common.date'),
      card: 'meta' as const,
      sortable: true,
      sortAccessor: (item: any) => new Date(item.date).getTime(),
      accessor: (item: any) => fmt.date(item.date),
    },
    {
      header: t('doc.partner.supplier'),
      card: 'subtitle' as const,
      accessor: (item: any) => (
        <div>
          <p className="font-bold text-fg-body leading-tight">{item.partnerName}</p>
          {item.externalRef && (
            <p className="text-[10px] text-fg-muted font-mono leading-none mt-1">
              {t('doc.purchaseInvoices.supplierInvoiceNoShort', { ref: item.externalRef })}
            </p>
          )}
          <p className="text-[10px] text-fg-subtle uppercase tracking-widest leading-none mt-1">
            {t('doc.generic.partnerIdShort', { id: item.partnerId.substring(0, 6) })}
          </p>
        </div>
      ),
    },
    {
      header: t('doc.invoices.fromDeliveryNote'),
      cell: (item: any) =>
        item.baseDocCode ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/30 text-[10px] font-black text-indigo-700 dark:text-indigo-200 uppercase tracking-tight">
            <FileText size={11} /> {item.baseDocCode}
          </span>
        ) : (
          <span className="text-[10px] text-fg-subtle font-bold italic">
            {t('doc.invoices.direct')}
          </span>
        ),
    },
    {
      header: t('invoice.withholdingAmount'),
      align: 'right' as const,
      sortable: true,
      sortAccessor: (item: any) => Number(item.withholdingAmount) || 0,
      cell: (item: any) =>
        Number(item.withholdingAmount) > 0 ? (
          <span className="text-rose-600 dark:text-rose-400 font-bold text-xs tabular-nums">
            −{fmt.money(item.withholdingAmount)}
            {Number(item.withholdingRate) > 0 && (
              <span className="ml-1 text-[10px] opacity-70">({item.withholdingRate}%)</span>
            )}
          </span>
        ) : (
          <span className="text-fg-subtle text-xs">—</span>
        ),
    },
    {
      header: t('doc.lines.total'),
      align: 'right' as const,
      sortable: true,
      sortAccessor: (item: any) => Number(item.total) || 0,
      accessor: (item: any) => (
        <span className="font-black text-fg-default">{fmt.money(item.total)}</span>
      ),
    },
    {
      header: t('doc.common.status'),
      card: 'status' as const,
      align: 'center' as const,
      sortable: true,
      sortAccessor: (item: any) => item.status || '',
      cell: (item: any) => {
        if (item.status === 'D') return <Badge variant="warning">{t('doc.status.draft')}</Badge>;
        if (item.status === 'O') return <Badge variant="success">{t('doc.status.posted')}</Badge>;
        if (item.status === 'X') return <Badge variant="error">{t('doc.status.cancelled')}</Badge>;
        return <Badge variant="neutral">{item.status}</Badge>;
      },
    },
    {
      header: t('doc.purchaseInvoices.colPayment'),
      align: 'center' as const,
      sortable: true,
      sortAccessor: (item: any) => item.paymentStatus || 'pending',
      cell: (item: any) => (
        <PaymentStatusBadge status={item.paymentStatus} isLocked={item.isLocked} compact />
      ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hay que duplicarlas
  // entre una columna de botones y el menú contextual.
  const rowActions = (item: any): RowAction[] => [
    { label: t('doc.invoices.view'), icon: <Eye size={14} />, onClick: () => onDetail(item) },
    {
      label: t('doc.actions.downloadPdf'),
      icon: <Download size={14} />,
      onClick: () => handleQuickPdf(item.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('doc.purchaseInvoices.title')}
        subtitle={t('doc.purchaseInvoices.subtitle')}
        icon={<FileStack size={18} />}
        size="lg"
        divider
        toolbar={
          mastersError ? (
            <div className="flex items-center gap-2 p-3 bg-warning-bg border border-warning rounded-lg text-warning-fg text-xs font-bold animate-in slide-in-from-top">
              <AlertCircle size={16} />
              {mastersError}
            </div>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-3">
            {doc.state.canWrite && onCreateFromClone && (
              <CloneDocumentActions docType="PINV" onPaste={onCreateFromClone} show="paste" />
            )}
            <ResponsiveActions
              source="primary:create"
              actions={[
                {
                  id: 'create',
                  label: t('doc.invoices.newDirect'),
                  icon: <Plus size={19} />,
                  onClick: onCreate,
                  disabled: !doc.state.canWrite,
                },
              ]}
            >
              <Button
                type="button"
                onClick={onCreate}
                disabled={!doc.state.canWrite}
                className="flex items-center gap-2 disabled:opacity-50"
              >
                <Plus size={20} /> {t('doc.invoices.newDirect')}
              </Button>
            </ResponsiveActions>
          </div>
        }
      />

      <Card className="overflow-hidden" noPadding>
        <FilterBar
          shortcut={false}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
          onClear={clearFilters}
          config={[
            {
              key: 'partnerId',
              label: t('doc.partner.supplier'),
              type: 'select',
              options: partners.map((p) => ({ label: p.name, value: p.id })),
            },
            {
              key: 'status',
              label: t('doc.common.status'),
              type: 'select',
              options: [
                { label: t('doc.status.posted'), value: 'O' },
                { label: t('doc.status.cancelled'), value: 'X' },
              ],
            },
            { key: 'date', label: t('doc.common.date'), type: 'date' },
          ]}
          searchPlaceholder={t('doc.invoices.search')}
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="PINV"
          onClear={() => setSelectedKeys(new Set())}
          onSent={() => setSelectedKeys(new Set())}
        />
        <Table
          className="max-md:p-3"
          columns={columns}
          data={filteredData || []}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={onDetail}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
        />
      </Card>
    </div>
  );
};

// --- Sub-componente: VISTA DE CREACIÓN / EDICIÓN ---
const InvoiceForm: React.FC<{
  onBack: () => void;
  onSubmit: (extra?: any) => Promise<void>;
  state: any;
  setState: any;
  masters: any;
  actions: any;
  computations: any;
  setViewingBatch: (l: any) => void;
  internalOrderId: string | null;
  setInternalOrderId: (id: string | null) => void;
  /** Número de la factura del proveedor: obligatorio para registrarla. */
  externalRef: string;
  setExternalRef: (v: string) => void;
}> = ({
  onSubmit,
  state,
  setState,
  masters,
  actions,
  computations,
  setViewingBatch,
  internalOrderId,
  setInternalOrderId,
  externalRef,
  setExternalRef,
}) => {
  const { t, locale } = useI18n();
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);

  // Autocompletar IRPF del proveedor en silencio cuando cambie el partner y el
  // doc aún no tenga tasa asignada. El usuario puede sobrescribirla después.
  // Los campos fiscales viven en `pluginData` con prefijo `__fiscal_` (ver
  // DocumentFiscalPanel) — el backend los extrae al guardar.
  useEffect(() => {
    if (!state.partnerId) return;
    const p = masters.partners.find((x: any) => x.id === state.partnerId);
    const partnerRate = Number(p?.defaultWithholdingRate || 0);
    const currentRate = Number(
      state.pluginData?.__fiscal_withholdingRate ?? state.withholdingRate ?? 0,
    );
    if (partnerRate > 0 && currentRate === 0) {
      setState.setPluginField?.('__fiscal_withholdingRate', partnerRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.partnerId, masters.partners]);

  const duplicateLine = (idx: number) => {
    const newLine = { ...state.lines[idx], batchDetails: [] };
    const newLines = [...state.lines];
    newLines.splice(idx + 1, 0, newLine);
    setState.setLines(newLines);
  };

  const columns = useFormLineColumns({
    kind: DocKind.Invoice,
    side: DocSide.Purchase,
    state,
    masters,
    actions,
    onAssignBatch: setBatchEditingIdx,
    onViewBatch: setViewingBatch,
    onDuplicateLine: duplicateLine,
    pluginTable: 'PurchaseInvoiceLine',
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'required' }), [locale]);
  const status = formStepStatus(state, masters, {
    partnerLabel: t('doc.steps.theSupplier'),
    extra: { value: externalRef, message: t('doc.purchaseInvoices.supplierInvoiceNoRequired') },
  });

  return (
    <>
      <DocumentFormLayout
        title={
          state.lines.some((l: any) => l.baseId)
            ? t('doc.salesInvoices.fromDeliveryTitle')
            : t('doc.purchaseInvoices.newTitle')
        }
        subtitle={t('doc.purchaseInvoices.formSubtitle')}
        submitLabel={t('doc.invoices.post')}
        onSubmit={() => onSubmit()}
        isSubmitting={state.isSubmitting}
        canSubmit={!state.seriesError && state.canWrite}
        steps={steps}
        status={status}
        onProblem={(p) => {
          if (p.batchLine != null) setBatchEditingIdx(p.batchLine);
        }}
        totals={
          <DocumentTotalsBlock
            variant="plain"
            subtotal={computations.subtotal}
            tax={computations.taxTotal}
            total={computations.total}
            withholdingAmount={computations.withholdingAmount}
            withholdingRate={state.pluginData?.__fiscal_withholdingRate ?? state.withholdingRate}
            totalLabel={t('doc.invoices.totalForm')}
          />
        }
        sections={{
          header: (
            <HeaderSection
              fields={
                <FormGrid columns={2}>
                  <PartnerField
                    label={t('doc.purchaseOrders.supplierCreditor')}
                    value={state.partnerId}
                    onChange={setState.setPartnerId}
                    partners={masters.partners}
                    placeholder={t('doc.common.selectSupplier')}
                  />
                  <DatePicker
                    label={t('doc.invoices.date')}
                    required
                    value={state.date}
                    onChange={(v) => setState.setDate(v ?? '')}
                  />
                  <Input
                    label={t('doc.purchaseInvoices.supplierInvoiceNo')}
                    required
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                    placeholder={t('doc.purchaseInvoices.supplierInvoiceNoPlaceholder')}
                    helperText={t('doc.purchaseInvoices.supplierInvoiceNoHelp')}
                  />
                  <InternalOrderHeaderField value={internalOrderId} onChange={setInternalOrderId} />
                </FormGrid>
              }
              side={
                <>
                  <SeriesPeriodFields state={state} setState={setState} masters={masters} />
                  <PluginFieldsPanel
                    tableName="PurchaseInvoice"
                    values={state.pluginData}
                    onChange={setState.setPluginField}
                    disabled={state.isSubmitting}
                    layout="sidebar"
                  />
                </>
              }
            />
          ),
          lines: (
            <LinesSection
              columns={columns}
              lines={state.lines || []}
              onAdd={() => actions.addLine()}
              addLabel={t('doc.purchaseInvoices.addExpenseLine')}
              emptyMessage={t('doc.invoices.noLines')}
            />
          ),
          fiscal: <DocumentFiscalPanel kind="purchase" state={state} setState={setState} bare />,
        }}
      />

      <BatchAssignmentPanel
        isOpen={batchEditingIdx !== null}
        onClose={() => setBatchEditingIdx(null)}
        lines={state.lines}
        masters={masters}
        initialLineIdx={batchEditingIdx}
        isSale={false}
        onSave={(updates) => {
          updates.forEach((u) => actions.updateLine(u.idx, 'batchDetails', u.batchDetails));
        }}
      />
    </>
  );
};

// --- Sub-componente: VISTA DE DETALLE ---
const InvoiceDetail: React.FC<{
  invoice: any;
  onBack: () => void;
  onCancel: (id: string) => void;
  onPost?: () => void;
  isPosting?: boolean;
  masters: any;
  setViewingBatch: (l: any) => void;
  canDelete?: boolean;
}> = ({ invoice, onBack, onCancel, onPost, isPosting, masters, setViewingBatch, canDelete }) => {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const partner = masters.partners.find((p: any) => p.id === invoice.partnerId);
  const series = masters.series?.find((s: any) => s.id === invoice.seriesId);
  const period = masters.periods?.find((p: any) => p.id === invoice.periodId);
  const fromDelivery = invoice.lines?.some((l: any) => l.baseId);

  // Fetch lazy de catálogos que no vienen en `masters` para pintar nombres
  // en el bloque de Información (tipo doc, método de pago, plazo).
  const { token, user } = useAuth();
  const [docTypes, setDocTypes] = React.useState<any[]>([]);
  const [payMethods, setPayMethods] = React.useState<any[]>([]);
  const [payTerms, setPayTerms] = React.useState<any[]>([]);
  React.useEffect(() => {
    const h = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };
    Promise.all([
      crudApi.list<any>('/api/document-types').catch(() => []),
      crudApi.list<any>('/api/payment-methods').catch(() => []),
      crudApi.list<any>('/api/payment-terms').catch(() => []),
    ]).then(([t, m, te]) => {
      setDocTypes(Array.isArray(t) ? t : []);
      setPayMethods(Array.isArray(m) ? m : []);
      setPayTerms(Array.isArray(te) ? te : []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);
  const docType = docTypes.find((d) => d.id === invoice.documentTypeId);
  const payMethod = payMethods.find((m) => m.id === invoice.paymentMethodId);
  const payTerm = payTerms.find((p) => p.id === invoice.paymentTermId);

  const [payModalOpen, setPayModalOpen] = React.useState(false);
  const [emailModalOpen, setEmailModalOpen] = React.useState(false);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = React.useState(0);
  const remaining = Math.max(0, Number(invoice.total || 0) - Number(invoice.amountPaid || 0));
  const docCode = formatDocCode(invoice);

  const columns = useMemo(
    () =>
      buildDetailLineColumns({
        kind: DocKind.Invoice,
        side: DocSide.Purchase,
        masters,
        onViewBatch: setViewingBatch,
        fmt,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoice.lines, masters.items, masters.taxGroups, locale],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb={t('doc.purchaseInvoices.breadcrumb')}
      title={formatDocCode(invoice)}
      status={statusBadgeProps(invoice.status, DocKind.Invoice)}
      actions={
        <DocumentActionBar
          docType="PINV"
          pdfUrl={`/api/purchases/invoices/${invoice.id}/pdf`}
          docId={invoice.id}
          docCode={docCode}
          onCancel={() => onCancel(invoice.id)}
          showCancel={(invoice.status === 'O' || invoice.status === 'D') && !!canDelete}
          onSendEmail={invoice.status === 'O' ? () => setEmailModalOpen(true) : undefined}
          primary={
            invoice.status === 'D' && onPost
              ? {
                  label: t('doc.invoices.postBtn'),
                  icon: Save,
                  onClick: onPost,
                  isLoading: isPosting,
                }
              : invoice.status === 'O' && remaining > 0
                ? {
                    label: t('invoice.registerPaymentPurchase'),
                    icon: CreditCard,
                    onClick: () => setPayModalOpen(true),
                  }
                : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2">
        <PaymentStatusBadge status={invoice.paymentStatus} isLocked={invoice.isLocked} />
        <CloneDocumentActions docType="PINV" doc={invoice} show="copy" size={14} />
        <TraceabilityButton type="PINV" id={invoice.id} docCode={docCode} />
        <InternalOrderChip internalOrderId={invoice.internalOrderId} />
        {invoice.amountPaid != null && Number(invoice.amountPaid) > 0 && (
          <span className="text-xs font-mono text-ink-500 dark:text-ink-400">
            {t('doc.invoices.paid', { amount: fmt.money(Number(invoice.amountPaid)) })} ·{' '}
            {remaining > 0
              ? t('doc.invoices.pending', { amount: fmt.money(remaining) })
              : t('doc.invoices.complete')}
          </span>
        )}
      </div>
      <RegisterPaymentModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        kind="purchase"
        invoiceId={invoice.id}
        invoiceCode={docCode}
        remaining={remaining}
        onSuccess={() => {
          setPaymentsRefreshKey((v) => v + 1);
          notifyDocChange(DocType.PurchaseInvoice);
        }}
      />
      <SendInvoiceModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        docType="PINV"
        docId={invoice.id}
        docCode={docCode}
        partnerName={partner?.name}
        partnerEmail={partner?.email}
      />
      {invoice.status === 'O' && (
        <div className="mb-4">
          <InvoicePaymentsList
            kind="purchase"
            invoiceId={invoice.id}
            refreshKey={paymentsRefreshKey}
            onChanged={() => {
              setPaymentsRefreshKey((v) => v + 1);
              notifyDocChange(DocType.PurchaseInvoice);
            }}
          />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-border-subtle" bodyClassName="p-6 space-y-5">
          <div>
            <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-[0.15em] mb-2">
              {t('doc.partner.supplier')}
            </h4>
            <p className="text-xl font-black text-fg-default tracking-tight">
              {partner?.name || '—'}
            </p>
            {partner?.nif && (
              <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider mt-0.5 font-mono">
                {t('doc.common.nif', { nif: partner.nif })}
              </p>
            )}
            {invoice.externalRef && (
              <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider mt-0.5 font-mono">
                {t('doc.purchaseInvoices.supplierInvoiceNoShort', { ref: invoice.externalRef })}
              </p>
            )}
          </div>
          {fromDelivery && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/30 rounded-lg">
              <Copy size={14} className="text-blue-600 dark:text-blue-300 shrink-0" />
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium leading-tight">
                {t('doc.purchaseInvoices.fromReceiptsNotice')}
              </p>
            </div>
          )}
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/30 rounded-lg">
            <FileText size={16} className="text-amber-600 dark:text-amber-300 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-200 font-medium leading-tight">
              {t('doc.purchaseInvoices.firmNotice')}
            </p>
          </div>
        </Card>

        <Card className="border-border-subtle" bodyClassName="p-6 space-y-4">
          <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-[0.15em] border-b border-border-subtle pb-2">
            {t('doc.common.information')}
          </h4>
          <dl className="space-y-2.5">
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                {t('doc.common.date')}
              </dt>
              <dd className="text-sm font-bold text-fg-default tabular-nums">
                {fmt.date(invoice.date)}
              </dd>
            </div>
            {series && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('doc.common.series')}
                </dt>
                <dd className="text-sm font-bold text-fg-default truncate">{series.name}</dd>
              </div>
            )}
            {period && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('doc.series.period')}
                </dt>
                <dd className="text-sm font-bold text-fg-default truncate">{period.name}</dd>
              </div>
            )}
            {docType && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('doc.invoices.invoiceType')}
                </dt>
                <dd className="text-sm font-bold text-fg-default truncate flex items-center gap-2">
                  {docType.name}
                  {docType.isRectify && (
                    <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      {t('doc.invoices.rectifying')}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {payMethod && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('invoice.paymentMethod')}
                </dt>
                <dd className="text-sm font-bold text-fg-default truncate">{payMethod.name}</dd>
              </div>
            )}
            {payTerm && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('doc.fiscal.paymentTerm')}
                </dt>
                <dd className="text-sm font-bold text-fg-default truncate">{payTerm.name}</dd>
              </div>
            )}
            {invoice.dueDate && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('invoice.dueDate')}
                </dt>
                <dd className="text-sm font-bold text-fg-default tabular-nums">
                  {fmt.date(invoice.dueDate)}
                </dd>
              </div>
            )}
            {Number(invoice.withholdingRate) > 0 && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  {t('doc.totals.withholding')}
                </dt>
                <dd className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  {invoice.withholdingRate}% ({fmt.money(invoice.withholdingAmount || 0)})
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-border-subtle" noPadding>
        {isMobile ? (
          <MobileLineCards columns={columns} lines={invoice.lines || []} />
        ) : (
          <Table responsive="scroll" columns={columns} data={invoice.lines || []} />
        )}
        <DocumentTotalsBlock
          subtotal={invoice.subtotal || 0}
          tax={invoice.taxTotal || 0}
          total={invoice.total || 0}
          withholdingAmount={invoice.withholdingAmount}
          withholdingRate={invoice.withholdingRate}
          totalLabel={t('doc.invoices.total')}
        />
      </Card>

      <PluginFieldsPanel
        tableName="PurchaseInvoice"
        values={invoice}
        onChange={() => {}}
        disabled
        layout="inline"
        title={t('doc.common.pluginFields')}
      />
      <AttachmentsPanel entityType="PurchaseInvoice" entityId={invoice.id} />
    </DocumentDetailLayout>
  );
};

export const PurchaseInvoices: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { flags } = useTheme();
  const toast = useToast();
  const popup = usePopup();
  const params = useParams();
  const location = useLocation();
  const { openTab } = useTabs();
  const currentTab = useCurrentTab();

  const detailId = params.id;
  const isCreate = location.pathname.endsWith('/new');
  const isDetail = !!detailId;
  const isList = !isCreate && !isDetail;

  const dataVersion = useDataVersion(DocType.PurchaseInvoice);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(isList);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(isDetail);
  const [viewingBatch, setViewingBatch] = useState<any>(null);
  const [posting, setPosting] = useState(false);
  const [internalOrderId, setInternalOrderId] = useState<string | null>(null);
  const [externalRef, setExternalRef] = useState('');

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: DocType.PurchaseInvoice,
    apiEndpoint: '/api/purchases/invoices',
    permissions: (user as any)?.permissions?.['/purchases/invoices'],
  });
  useDocumentScanner(doc, isCreate);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  // Listado
  useEffect(() => {
    if (!isList || !token || !user?.tenantId) return;
    (async () => {
      try {
        setLoading(true);
        const data = await docsApi.list('/api/purchases/invoices');
        const withCode = (Array.isArray(data) ? data : []).map((d: any) => ({
          ...d,
          docCode: formatDocCode(d),
          partnerName: d.partnerName || '',
        }));
        setInvoices(withCode);
      } catch (e) {
        toast.error(t('doc.invoices.loadListError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [isList, token, user?.tenantId, dataVersion]);

  // Detalle
  useEffect(() => {
    if (!isDetail || !detailId || !token || !user?.tenantId) return;
    (async () => {
      try {
        setDetailLoading(true);
        const data = await docsApi.get('/api/purchases/invoices', detailId);
        setSelectedInvoice(data);
        currentTab.rename(formatDocCode(data));
      } catch (e) {
        toast.error((e instanceof Error ? e.message : undefined) || t('doc.invoices.loadError'));
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [isDetail, detailId, token, user?.tenantId, dataVersion]);

  // Clone-from-clipboard: payload pegado desde otra vista.
  useEffect(() => {
    if (!isCreate) return;
    const raw = sessionStorage.getItem('keirost:cloneInvoice:PINV');
    if (!raw) return;
    sessionStorage.removeItem('keirost:cloneInvoice:PINV');
    try {
      const { header, lines } = JSON.parse(raw);
      if (header?.partnerId) doc.setState.setPartnerId(header.partnerId);
      if (header?.internalOrderId) setInternalOrderId(header.internalOrderId);
      if (Array.isArray(lines)) {
        doc.setState.setLines(
          lines.map((l: any) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity) || 0,
            price: Number(l.price) || 0,
            taxGroupId: l.taxGroupId,
            warehouseId: l.warehouseId,
            zoneId: l.zoneId,
            uomId: l.uomId,
            uomFactor: l.uomFactor != null ? Number(l.uomFactor) : undefined,
            batchDetails: l.batchDetails,
            description: l.description,
            costCenterId: l.costCenterId,
            profitCenterId: l.profitCenterId,
            internalOrderId: l.internalOrderId,
          })),
        );
      }
    } catch (e) {
      console.error('Error parseando payload de clone', e);
    }
  }, [isCreate]);

  // Copy-from: /purchases/invoices/new?copyFrom=<id>
  useEffect(() => {
    if (!isCreate) return;
    const urlParams = new URLSearchParams(location.search);
    if (!urlParams.get('copyFrom')) return;
    const sourceData = localStorage.getItem('copy_pdn_source');
    if (!sourceData) return;
    try {
      const pdn = JSON.parse(sourceData);
      doc.setState.setPartnerId(pdn.partnerId);
      if (pdn.internalOrderId) setInternalOrderId(pdn.internalOrderId);
      doc.setState.setLines(
        pdn.lines.map((l: any) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          price: l.price,
          taxGroupId: l.taxGroupId,
          warehouseId: l.warehouseId,
          zoneId: l.zoneId,
          batchDetails: l.batchDetails,
          baseType: 'PDN',
          baseId: pdn.id,
          baseLine: l.lineNum || l.id,
        })),
      );
    } catch (e) {
      console.error('Error parsing copy_pdn_source', e);
    }
  }, [isCreate]);

  const handleSubmit = async (extra?: any) => {
    if (!externalRef.trim()) {
      toast.error(t('doc.purchaseInvoices.supplierInvoiceNoRequired'));
      return;
    }
    try {
      const pd = doc.state.pluginData || {};
      const fiscalFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(pd)) {
        if (k.startsWith('__fiscal_') && v !== '' && v != null) {
          fiscalFields[k.replace('__fiscal_', '')] = v;
        }
      }
      if ((doc.state as any).withholdingRate)
        fiscalFields.withholdingRate = (doc.state as any).withholdingRate;
      if (internalOrderId) fiscalFields.internalOrderId = internalOrderId;
      fiscalFields.externalRef = externalRef.trim();

      await doc.actions.submitDocument({ ...fiscalFields, ...extra });
      toast.success(t('doc.purchaseInvoices.created'));
      notifyDocChange(DocType.PurchaseInvoice);
      currentTab.close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    }
  };

  const handleCancel = async (id: string) => {
    // El flag de la empresa decide si se pide confirmación — no se toca.
    if (flags.confirmBeforeCancel) {
      const ok = await popup.confirm({
        title: t('doc.invoices.cancelTitle'),
        message: t('doc.purchaseInvoices.cancelMessage'),
        tone: 'danger',
        confirmLabel: t('doc.invoices.cancelTitle'),
        cancelLabel: t('doc.common.back'),
      });
      if (!ok) return;
    }
    try {
      await docsApi.cancel('/api/purchases/invoices', id);
      toast.success(t('doc.purchaseInvoices.cancelled'));
      notifyDocChange(DocType.PurchaseInvoice);
      currentTab.close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    }
  };

  const handlePost = async () => {
    if (!selectedInvoice) return;
    try {
      setPosting(true);
      await docsApi.post('/api/purchases/invoices', selectedInvoice.id);
      toast.success(t('doc.invoices.posted'));
      notifyDocChange(DocType.PurchaseInvoice);
      setSelectedInvoice({ ...selectedInvoice, status: 'O' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      setPosting(false);
    }
  };

  // Atajos creación
  useEffect(() => {
    if (!isCreate) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        doc.actions.addLine();
      }
      if (e.key === 'F10') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreate, doc.state.lines, doc.state.partnerId]);

  if (isCreate) {
    return (
      <>
        <InvoiceForm
          onBack={() => currentTab.close()}
          onSubmit={handleSubmit}
          state={doc.state}
          setState={doc.setState}
          masters={doc.masters}
          actions={doc.actions}
          computations={doc.computations}
          setViewingBatch={setViewingBatch}
          internalOrderId={internalOrderId}
          setInternalOrderId={setInternalOrderId}
          externalRef={externalRef}
          setExternalRef={setExternalRef}
        />
        {viewingBatch && (
          <BatchSelectionModal
            isOpen={true}
            onClose={() => setViewingBatch(null)}
            targetQuantity={viewingBatch.quantity}
            itemName={doc.masters.items.find((i: any) => i.id === viewingBatch.itemId)?.name || ''}
            manageBy={
              doc.masters.items.find((i: any) => i.id === viewingBatch.itemId)?.manageBy || 'B'
            }
            initialDetails={viewingBatch.batchDetails || []}
            onConfirm={() => {}}
            readOnly
          />
        )}
      </>
    );
  }

  if (isDetail) {
    if (detailLoading || !selectedInvoice) {
      return (
        <div className="p-12 flex items-center justify-center">
          <Loader />
        </div>
      );
    }
    return (
      <>
        <InvoiceDetail
          invoice={selectedInvoice}
          onBack={() => currentTab.close()}
          onCancel={handleCancel}
          onPost={handlePost}
          isPosting={posting}
          masters={doc.masters}
          setViewingBatch={setViewingBatch}
          canDelete={doc.state.canDelete}
        />
        {viewingBatch && (
          <BatchSelectionModal
            isOpen={true}
            onClose={() => setViewingBatch(null)}
            targetQuantity={viewingBatch.quantity}
            itemName={doc.masters.items.find((i: any) => i.id === viewingBatch.itemId)?.name || ''}
            manageBy={
              doc.masters.items.find((i: any) => i.id === viewingBatch.itemId)?.manageBy || 'B'
            }
            initialDetails={viewingBatch.batchDetails || []}
            onConfirm={() => {}}
            readOnly
          />
        )}
      </>
    );
  }

  return (
    <InvoiceList
      doc={doc}
      data={invoices}
      loading={loading}
      partners={doc.masters.partners}
      mastersError={doc.state.mastersError}
      onCreate={() => openTab('/purchases/invoices/new')}
      onCreateFromClone={(payload) => {
        sessionStorage.setItem('keirost:cloneInvoice:PINV', JSON.stringify(payload));
        openTab('/purchases/invoices/new');
      }}
      onDetail={(inv) => openTab(`/purchases/invoices/${inv.id}`, { title: formatDocCode(inv) })}
    />
  );
};
