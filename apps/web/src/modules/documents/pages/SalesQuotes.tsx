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
import { useTheme } from '@/context/ThemeContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import {
  FileSignature,
  Plus,
  Pencil,
  FileText,
  Copy,
  Download,
  Eye,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { TraceabilityButton } from '@/components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { buildDetailLineColumns } from '../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { downloadPdf } from '@/utils/downloadPdf';
import { useFormat } from '@/hooks/useFormat';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';

import { usePluginLineFields } from '@/hooks/usePluginLineFields';
import { useDocument, DocKind, DocSide } from '@openfactu/common';
import { formatDocCode } from '@/utils/docCode';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';

import { useDocTypes } from '../domain/docTypeRegistry';
import { docsApi } from '../api';
import { apiClient } from '@/shared/http';
import { t } from '@/i18n/i18n';
import { useI18n } from '@/i18n/I18nContext';

const API = '/api/documents/SQ';

const statusBadge = (status: string): { label: string; variant: any } => {
  if (status === 'O') return { label: t('doc.status.open'), variant: 'warning' };
  if (status === 'A') return { label: t('doc.status.accepted'), variant: 'success' };
  if (status === 'R') return { label: t('doc.status.rejected'), variant: 'error' };
  return { label: t('doc.status.cancelled'), variant: 'neutral' };
};

// --- Sub-componente: VISTA DE LISTADO ---
const QuoteList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onDetail: (q: any) => void;
  canWrite?: boolean;
}> = ({ data, loading, partners, onCreate, onDetail, canWrite }) => {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useFormat();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`${API}/${id}/pdf`);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('doc.common.pdfError'));
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredData = useMemo(() => {
    let rows = data;
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      rows = rows.filter(
        (r) =>
          (r.docCode || '').toLowerCase().includes(term) ||
          (r.partnerName || '').toLowerCase().includes(term) ||
          String(r.total || '').includes(term),
      );
    }
    if (activeFilters.partnerId) rows = rows.filter((r) => r.partnerId === activeFilters.partnerId);
    if (activeFilters.status) rows = rows.filter((r) => r.status === activeFilters.status);
    if (activeFilters.date)
      rows = rows.filter((r) => (r.date || '').startsWith(activeFilters.date));
    return rows;
  }, [data, searchTerm, activeFilters]);

  const columns = [
    {
      header: t('doc.quotes.colNumber'),
      sortable: true,
      sortAccessor: (item: any) => formatDocCode(item),
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-fg-default leading-none">{formatDocCode(item)}</span>
          <span className="text-[10px] text-fg-subtle font-mono mt-1">
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
      header: t('doc.partner.customer'),
      card: 'subtitle' as const,
      sortable: true,
      sortAccessor: (item: any) => item.partnerName || '',
      accessor: (item: any) =>
        item.partnerName || partners.find((p) => p.id === item.partnerId)?.name || '...',
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
        const b = statusBadge(item.status);
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hay que duplicarlas
  // entre una columna de botones y el menú contextual.
  const rowActions = (item: any): RowAction[] => [
    { label: t('doc.quotes.view'), icon: <Eye size={14} />, onClick: () => onDetail(item) },
    {
      label: t('doc.actions.downloadPdf'),
      icon: <Download size={14} />,
      onClick: () => handleQuickPdf(item.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        size="lg"
        divider
        className="pb-8"
        icon={<FileSignature size={18} />}
        title={t('doc.nav.quotes')}
        subtitle={t('doc.quotes.subtitle')}
        actions={
          <ResponsiveActions
            source="primary:create"
            actions={[
              {
                id: 'create',
                label: t('doc.routes.newQuote'),
                icon: <Plus size={19} />,
                onClick: onCreate,
                disabled: !canWrite,
              },
            ]}
          >
            <Button
              type="button"
              onClick={onCreate}
              disabled={!canWrite}
              className="flex items-center gap-2 h-12 px-6 disabled:opacity-50"
            >
              <Plus size={20} /> {t('doc.routes.newQuote')}
            </Button>
          </ResponsiveActions>
        }
      />

      <Card className="overflow-hidden" noPadding>
        <FilterBar
          shortcut={false}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilters={activeFilters}
          onFilterChange={(k: string, v: string) =>
            setActiveFilters((prev) => ({ ...prev, [k]: v }))
          }
          onClear={() => {
            setSearchTerm('');
            setActiveFilters({});
          }}
          config={[
            {
              key: 'partnerId',
              label: t('doc.partner.customer'),
              type: 'select',
              options: partners.map((p) => ({ label: p.name, value: p.id })),
            },
            {
              key: 'status',
              label: t('doc.common.status'),
              type: 'select',
              options: [
                { label: t('doc.status.open'), value: 'O' },
                { label: t('doc.status.accepted'), value: 'A' },
                { label: t('doc.status.rejected'), value: 'R' },
                { label: t('doc.status.cancelled'), value: 'X' },
              ],
            },
            { key: 'date', label: t('doc.common.date'), type: 'date' },
          ]}
          searchPlaceholder={t('doc.quotes.search')}
        />
        <Table
          className="max-md:p-3"
          columns={columns}
          data={filteredData}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={onDetail}
        />
      </Card>
    </div>
  );
};

// --- Sub-componente: VISTA DE CREACIÓN ---
const QuoteForm: React.FC<{
  onSubmit: () => void;
  state: any;
  setState: any;
  masters: any;
  actions: any;
  computations: any;
  validUntil: string;
  setValidUntil: (v: string) => void;
  internalOrderId: string | null;
  setInternalOrderId: (id: string | null) => void;
  /** Código del presupuesto que se edita; sin él, es un alta. */
  editingCode?: string;
}> = ({
  onSubmit,
  state,
  setState,
  masters,
  actions,
  computations,
  validUntil,
  setValidUntil,
  internalOrderId,
  setInternalOrderId,
  editingCode,
}) => {
  const { t, locale } = useI18n();
  const columns = useFormLineColumns({
    kind: DocKind.Order,
    side: DocSide.Sale,
    state,
    masters,
    actions,
    pluginTable: 'SalesQuoteLine',
  });

  // Presupuesto: sin paso fiscal y sin lotes (no mueve stock).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'none' }), [locale]);
  // Al editar ya tiene número: no se vuelve a pedir aunque la serie sea manual.
  const status = formStepStatus(
    editingCode ? { ...state, isManualSeries: false } : state,
    masters,
    { partnerLabel: t('doc.steps.theCustomer') },
    { batches: false },
  );

  return (
    <DocumentFormLayout
      title={
        editingCode ? t('doc.common.editCode', { code: editingCode }) : t('doc.quotes.newTitle')
      }
      subtitle={t('doc.quotes.formSubtitle')}
      submitLabel={editingCode ? t('doc.common.saveChanges') : t('doc.quotes.save')}
      onSubmit={onSubmit}
      isSubmitting={state.isSubmitting}
      canSubmit={!state.seriesError && state.canWrite}
      steps={steps}
      status={status}
      totals={
        <DocumentTotalsBlock
          variant="plain"
          subtotal={computations.subtotal}
          tax={computations.taxTotal}
          total={computations.total}
          totalLabel={t('doc.quotes.totalForm')}
        />
      }
      sections={{
        header: (
          <HeaderSection
            fields={
              <FormGrid columns={2}>
                <PartnerField
                  label={t('doc.partner.customer')}
                  value={state.partnerId}
                  onChange={setState.setPartnerId}
                  partners={masters.partners}
                  placeholder={t('doc.common.selectCustomer')}
                />
                <DatePicker
                  label={t('doc.common.date')}
                  required
                  value={state.date}
                  onChange={(v) => setState.setDate(v ?? '')}
                />
                <DatePicker
                  label={t('doc.quotes.validUntil')}
                  value={validUntil || null}
                  onChange={(v) => setValidUntil(v ?? '')}
                />
                <InternalOrderHeaderField value={internalOrderId} onChange={setInternalOrderId} />
              </FormGrid>
            }
            side={
              <>
                <SeriesPeriodFields
                  state={state}
                  setState={setState}
                  masters={masters}
                  locked={!!editingCode}
                />
                <PluginFieldsPanel
                  tableName="SalesQuote"
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
            emptyMessage={t('doc.quotes.noLines')}
          />
        ),
      }}
    />
  );
};

// --- Sub-componente: VISTA DE DETALLE ---
const QuoteDetail: React.FC<{
  quote: any;
  onBack: () => void;
  onCancel: () => void;
  onStatusChange: (status: string) => void;
  onCreateOrder: () => void;
  onCreateInvoice: () => void;
  onEdit: () => void;
  canWrite: boolean;
  canDelete: boolean;
  isCancelling: boolean;
  masters: any;
}> = ({
  quote,
  onBack,
  onCancel,
  onStatusChange,
  onCreateOrder,
  onCreateInvoice,
  onEdit,
  canWrite,
  canDelete,
  isCancelling,
  masters,
}) => {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const partner = masters.partners.find((p: any) => p.id === quote.partnerId);
  const series = masters.series?.find((s: any) => s.id === quote.seriesId);
  const period = masters.periods?.find((p: any) => p.id === quote.periodId);
  const docCode = formatDocCode(quote);
  const pluginLineFields = usePluginLineFields('SalesQuoteLine');

  const columns = useMemo(
    () =>
      buildDetailLineColumns({
        kind: DocKind.Order,
        side: DocSide.Sale,
        masters,
        fmt,
        pluginLineFields,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quote.lines, masters.items, masters.taxGroups, pluginLineFields, locale],
  );

  const isOpen = quote.status === 'O';
  const isAccepted = quote.status === 'A';
  const isRejected = quote.status === 'R';
  const convertible = (isOpen || isAccepted) && canWrite;
  // Facturar el presupuesto sin pedido se puede desactivar por empresa (Ajustes → Flags).
  const { flags } = useTheme();
  const canInvoiceDirectly = convertible && flags.quoteDirectInvoiceEnabled !== false;

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb={t('doc.quotes.breadcrumb')}
      title={docCode}
      status={statusBadge(quote.status)}
      actions={
        <DocumentActionBar
          docType="SQ"
          pdfUrl={`${API}/${quote.id}/pdf`}
          docId={quote.id}
          docCode={docCode}
          onCancel={onCancel}
          showCancel={isOpen && canDelete}
          isCancelling={isCancelling}
          primary={
            convertible
              ? { label: t('doc.quotes.createOrder'), icon: Copy, onClick: onCreateOrder }
              : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <ResponsiveActions
          source="secondary:quote"
          actions={[
            ...(isOpen && canWrite
              ? [
                  {
                    id: 'edit',
                    label: t('doc.common.edit'),
                    icon: <Pencil size={19} />,
                    onClick: onEdit,
                  },
                  {
                    id: 'accept',
                    label: t('doc.quotes.accept'),
                    icon: <Check size={19} />,
                    onClick: () => onStatusChange('A'),
                  },
                  {
                    id: 'reject',
                    label: t('doc.quotes.reject'),
                    icon: <X size={19} />,
                    onClick: () => onStatusChange('R'),
                  },
                ]
              : []),
            ...((isAccepted || isRejected) && canWrite
              ? [
                  {
                    id: 'reopen',
                    label: t('doc.quotes.reopen'),
                    icon: <RotateCcw size={19} />,
                    onClick: () => onStatusChange('O'),
                  },
                ]
              : []),
            ...(canInvoiceDirectly
              ? [
                  {
                    id: 'invoice',
                    label: t('doc.quotes.createInvoice'),
                    icon: <FileText size={19} />,
                    onClick: onCreateInvoice,
                  },
                ]
              : []),
          ]}
        >
          {isOpen && canWrite && (
            <>
              <Button variant="secondary" size="sm" onClick={onEdit} className="h-9 gap-2">
                <Pencil size={14} /> {t('doc.common.edit')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onStatusChange('A')}
                className="h-9 gap-2 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
              >
                <Check size={14} /> {t('doc.quotes.accept')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onStatusChange('R')}
                className="h-9 gap-2 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-500/30"
              >
                <X size={14} /> {t('doc.quotes.reject')}
              </Button>
            </>
          )}
          {(isAccepted || isRejected) && canWrite && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onStatusChange('O')}
              className="h-9 gap-2"
            >
              <RotateCcw size={14} /> {t('doc.quotes.reopen')}
            </Button>
          )}
          {canInvoiceDirectly && (
            <Button variant="secondary" size="sm" onClick={onCreateInvoice} className="h-9 gap-2">
              <FileText size={14} /> {t('doc.quotes.createInvoiceBtn')}
            </Button>
          )}
        </ResponsiveActions>
        <TraceabilityButton type="SQ" id={quote.id} docCode={docCode} />
        <InternalOrderChip internalOrderId={quote.internalOrderId} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-border-subtle" bodyClassName="p-6 space-y-5">
          <div>
            <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-[0.15em] mb-2">
              {t('doc.partner.customer')}
            </h4>
            <p className="text-xl font-black text-fg-default tracking-tight">
              {partner?.name || '—'}
            </p>
            {partner?.nif && (
              <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider mt-0.5 font-mono">
                {t('doc.common.nif', { nif: partner.nif })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-500/5 border border-sky-100 dark:border-sky-500/30 rounded-lg">
            <FileText size={16} className="text-sky-600 dark:text-sky-300 shrink-0" />
            <p className="text-xs text-sky-800 dark:text-sky-200 font-medium leading-tight">
              {t('doc.quotes.offerNotice')}
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
                {fmt.date(quote.date)}
              </dd>
            </div>
            {quote.validUntil && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  {t('doc.quotes.validUntil')}
                </dt>
                <dd className="text-sm font-bold text-fg-default tabular-nums">
                  {fmt.date(quote.validUntil)}
                </dd>
              </div>
            )}
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
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-border-subtle" noPadding>
        {isMobile ? (
          <MobileLineCards columns={columns} lines={quote.lines || []} />
        ) : (
          <Table responsive="scroll" columns={columns} data={quote.lines || []} />
        )}
        <DocumentTotalsBlock
          subtotal={quote.subtotal}
          tax={quote.taxTotal}
          total={quote.total}
          totalLabel={t('doc.quotes.total')}
        />
      </Card>

      <PluginFieldsPanel
        tableName="SalesQuote"
        values={quote}
        onChange={() => {}}
        disabled
        layout="inline"
        title={t('doc.common.pluginFields')}
      />

      <AttachmentsPanel entityType="SalesQuote" entityId={quote.id} />
    </DocumentDetailLayout>
  );
};

// --- Componente principal ---
export const SalesQuotes: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const params = useParams();
  const location = useLocation();
  const { openTab } = useTabs();
  const currentTab = useCurrentTab();

  const detailId = params.id;
  const isCreate = location.pathname.endsWith('/new');
  const isEdit = !!detailId && location.pathname.endsWith('/edit');
  const isDetail = !!detailId && !isEdit;
  const isList = !isCreate && !isDetail && !isEdit;

  // Siembra el meta-registro de @openfactu/common con los tipos del servidor
  // (incluido el stockAction de SQ) — sin esto, la validación de lotes de
  // useDocument no sabe que un presupuesto no mueve stock.
  useDocTypes();

  const dataVersion = useDataVersion('SQ');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(isList);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(isDetail);
  const [isCancelling, setIsCancelling] = useState(false);

  const [validUntil, setValidUntil] = useState('');
  const [internalOrderId, setInternalOrderId] = useState<string | null>(null);

  const permissions = (user as any)?.permissions?.['/sales/quotes'];
  const canWrite = user?.role === 'SUPERUSER' || user?.role === 'ADMIN' || !!permissions?.write;
  const canDelete = user?.role === 'SUPERUSER' || user?.role === 'ADMIN' || !!permissions?.delete;

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: 'SQ',
    apiEndpoint: API,
    permissions: permissions ?? { read: true, write: canWrite, delete: canDelete },
  });

  // Listado
  useEffect(() => {
    if (!isList || !token || !user?.tenantId) return;
    (async () => {
      try {
        setLoading(true);
        const data = await docsApi.list(API);
        setQuotes(
          (Array.isArray(data) ? data : []).map((d: any) => ({
            ...d,
            docCode: formatDocCode(d),
            partnerName: d.partnerName || '',
          })),
        );
      } catch {
        toast.error(t('doc.quotes.loadListError'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isList, token, user?.tenantId, dataVersion]);

  // Detalle
  useEffect(() => {
    if (!isDetail || !detailId || !token || !user?.tenantId) return;
    (async () => {
      try {
        setDetailLoading(true);
        const data = await docsApi.get(API, detailId);
        setSelectedQuote(data);
        currentTab.rename(formatDocCode(data));
      } catch (e) {
        toast.error((e instanceof Error ? e.message : undefined) || t('doc.quotes.loadError'));
      } finally {
        setDetailLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetail, detailId, token, user?.tenantId, dataVersion]);

  // Edición: se carga el presupuesto y se vuelca en el mismo formulario del alta.
  const [editing, setEditing] = useState<any>(null);
  useEffect(() => {
    if (!isEdit || !detailId || !token || !user?.tenantId) return;
    (async () => {
      try {
        const q: any = await docsApi.get(API, detailId);
        setEditing(q);
        currentTab.rename(t('doc.common.editCode', { code: formatDocCode(q) }));
        doc.setState.setPartnerId(q.partnerId);
        doc.setState.setSeriesId(q.seriesId);
        doc.setState.setPeriodId(q.periodId);
        if (q.date) doc.setState.setDate(String(q.date).slice(0, 10));
        setValidUntil(q.validUntil ? String(q.validUntil).slice(0, 10) : '');
        setInternalOrderId(q.internalOrderId ?? null);
        doc.setState.setPluginData(
          Object.fromEntries(Object.entries(q).filter(([k]) => k.startsWith('p_'))),
        );
        doc.setState.setLines(
          (q.lines || []).map((l: any) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity) || 0,
            price: Number(l.price) || 0,
            taxGroupId: l.taxGroupId,
            uomId: l.uomId,
            uomFactor: l.uomFactor != null ? Number(l.uomFactor) : undefined,
            description: l.description,
            discountRate: l.discountRate != null ? Number(l.discountRate) : undefined,
            withholdingRate: l.withholdingRate != null ? Number(l.withholdingRate) : undefined,
            costCenterId: l.costCenterId,
            profitCenterId: l.profitCenterId,
            internalOrderId: l.internalOrderId,
          })),
        );
      } catch (e) {
        toast.error((e instanceof Error ? e.message : undefined) || t('doc.quotes.loadError'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, detailId, token, user?.tenantId]);

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!doc.state.partnerId || doc.state.lines.length === 0) {
      toast.error(t('doc.quotes.customerAndLine'));
      return;
    }
    try {
      await apiClient.put(`${API}/${editing.id}`, {
        partnerId: doc.state.partnerId,
        date: doc.state.date,
        warehouseId: doc.state.warehouseId,
        lines: doc.state.lines,
        ...doc.state.pluginData,
        ...(validUntil ? { validUntil } : {}),
        internalOrderId,
      });
      toast.success(t('doc.quotes.updated'));
      notifyDocChange('SQ');
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.common.saveError'));
    }
  };

  const handleSubmit = async () => {
    if (!doc.state.partnerId || !doc.state.seriesId || !doc.state.periodId) {
      toast.error(t('doc.common.requiredFields'));
      return;
    }
    if (doc.state.lines.length === 0) {
      toast.error(t('doc.common.addOneLine'));
      return;
    }
    try {
      const data = await doc.actions.submitDocument({
        ...(validUntil ? { validUntil } : {}),
        internalOrderId,
      });
      toast.success(t('doc.quotes.created', { num: data.docNum }));
      notifyDocChange('SQ');
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancel = async () => {
    if (!selectedQuote) return;
    const ok = await popup.confirm({
      title: t('doc.quotes.cancelTitle'),
      message: t('doc.quotes.cancelMessage'),
      tone: 'danger',
      confirmLabel: t('doc.quotes.cancelTitle'),
      cancelLabel: t('doc.common.back'),
    });
    if (!ok) return;
    setIsCancelling(true);
    try {
      await docsApi.cancel(API, selectedQuote.id);
      toast.success(t('doc.quotes.cancelled'));
      notifyDocChange('SQ');
      currentTab.close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedQuote) return;
    try {
      const updated: any = await apiClient.post(`${API}/${selectedQuote.id}/status`, { status });
      setSelectedQuote((prev: any) => ({ ...prev, status: updated?.status ?? status }));
      toast.success(t('doc.common.statusUpdated'));
      notifyDocChange('SQ');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('doc.common.statusError'));
    }
  };

  const handleCreateOrder = () => {
    if (!selectedQuote) return;
    localStorage.setItem('copy_quote_source', JSON.stringify(selectedQuote));
    openTab(`/sales-orders/new?copyFrom=${selectedQuote.id}`, {
      title: t('doc.quotes.orderFrom', { code: formatDocCode(selectedQuote) }),
    });
  };

  const handleCreateInvoice = () => {
    if (!selectedQuote) return;
    localStorage.setItem('copy_quote_source', JSON.stringify(selectedQuote));
    openTab(`/sales/invoices/new?copyFrom=${selectedQuote.id}`, {
      title: t('doc.quotes.invoiceFrom', { code: formatDocCode(selectedQuote) }),
    });
  };

  if (isEdit) {
    if (!editing) {
      return (
        <div className="p-12 flex items-center justify-center">
          <Loader />
        </div>
      );
    }
    return (
      <QuoteForm
        onSubmit={handleSaveEdit}
        state={doc.state}
        setState={doc.setState}
        masters={doc.masters}
        actions={doc.actions}
        computations={doc.computations}
        validUntil={validUntil}
        setValidUntil={setValidUntil}
        internalOrderId={internalOrderId}
        setInternalOrderId={setInternalOrderId}
        editingCode={formatDocCode(editing)}
      />
    );
  }

  if (isCreate) {
    return (
      <QuoteForm
        onSubmit={handleSubmit}
        state={doc.state}
        setState={doc.setState}
        masters={doc.masters}
        actions={doc.actions}
        computations={doc.computations}
        validUntil={validUntil}
        setValidUntil={setValidUntil}
        internalOrderId={internalOrderId}
        setInternalOrderId={setInternalOrderId}
      />
    );
  }

  if (isDetail) {
    if (detailLoading || !selectedQuote) {
      return (
        <div className="p-12 flex items-center justify-center">
          <Loader />
        </div>
      );
    }
    return (
      <QuoteDetail
        quote={selectedQuote}
        onBack={() => currentTab.close()}
        onCancel={handleCancel}
        onStatusChange={handleStatusChange}
        onCreateOrder={handleCreateOrder}
        onCreateInvoice={handleCreateInvoice}
        onEdit={() =>
          openTab(`/sales/quotes/${selectedQuote.id}/edit`, {
            title: t('doc.common.editCode', { code: formatDocCode(selectedQuote) }),
          })
        }
        canWrite={canWrite}
        canDelete={canDelete}
        isCancelling={isCancelling}
        masters={doc.masters}
      />
    );
  }

  return (
    <QuoteList
      data={quotes}
      loading={loading}
      partners={doc.masters.partners || []}
      onCreate={() => openTab('/sales/quotes/new', { title: 'doc.routes.newQuote' })}
      onDetail={(q) => openTab(`/sales/quotes/${q.id}`, { title: formatDocCode(q) })}
      canWrite={canWrite}
    />
  );
};
