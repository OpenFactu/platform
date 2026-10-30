import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { SeriesPeriodFields } from '../components/form/SeriesPeriodFields';
import {
  HeaderSection,
  LinesSection,
  PartnerField,
  WithholdingNotice,
} from '../components/form/FormPieces';
import { useFormLineColumns } from '../hooks/useFormLineColumns';
import { useLineZones } from '../hooks/useLineZones';
import { buildFormSteps, formStepStatus } from '../domain/formSteps';
import { defaultAddresses } from '../domain/partnerAddresses';

import { ResponsiveActions } from '@/components/common/ResponsiveActions';

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  DatePicker,
  Loader,
  Textarea,
  usePopup,
  useToast,
  Badge,
  FilterBar,
  PageHeader,
  SearchableSelect,
  Field,
  FormGrid,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import { useTheme } from '@/context/ThemeContext';
import { formatDocCode } from '@/utils/docCode';
import { FileDigit, Plus, Copy, AlertCircle, Download, Eye, Ban } from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { CloneDocumentActions } from '@/components/common/CloneDocumentActions';
import { TraceabilityButton } from '@/components/common/TraceabilityButton';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';

import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { buildDetailLineColumns, statusBadgeProps } from '../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { downloadPdf } from '@/utils/downloadPdf';
import { useFormat } from '@/hooks/useFormat';
import { BatchSelectionModal } from '@/modules/inventory/components/BatchSelectionModal';
import { BatchAssignmentPanel } from '@/modules/inventory/components/BatchAssignmentPanel';

import { useZonesWithStock } from '@/hooks/useZonesWithStock';

import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '@/hooks/useDocumentScanner';
import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';
import { docsApi } from '../api';
import { useI18n } from '@/i18n/I18nContext';

// --- Sub-componente: VISTA DE LISTADO ---
const SOList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onCreateFromClone?: (payload: { header: any; lines: any[] }) => void;
  onDetail: (order: any) => void;
  onCopyToDelivery: (order: any) => void;
  onCancel: (id: string) => void;

  doc: any;
}> = ({
  data,
  loading,
  partners,
  onCreate,
  onCreateFromClone,
  onDetail,
  onCopyToDelivery,
  onCancel,
  doc,
}) => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const toast = useToast();
  const fmt = useFormat();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`/api/sales/${id}/pdf`);
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
          label: t('doc.partner.customer'),
          options: partners.map((p) => ({ label: p.name, value: p.id })),
        },
        {
          key: 'status',
          type: 'select',
          label: t('doc.common.status'),
          options: [
            { label: t('doc.status.open'), value: 'O' },
            { label: t('doc.status.partial'), value: 'P' },
            { label: t('doc.status.closed'), value: 'C' },
          ],
        },
        {
          key: 'origin',
          type: 'select',
          label: t('doc.common.origin'),
          options: [{ label: t('doc.common.originWeb'), value: 'web' }],
        },
        { key: 'date', type: 'date', label: t('doc.common.date') },
      ],
    });

  const columns = [
    {
      header: t('doc.salesOrders.colNumber'),
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
      cell: (item: any) => (
        <span className="inline-flex items-center gap-1.5">
          {item.status === 'O' && <Badge variant="warning">{t('doc.status.open')}</Badge>}
          {item.status === 'P' && <Badge variant="info">{t('doc.status.partial')}</Badge>}
          {item.status === 'C' && <Badge variant="success">{t('doc.status.closed')}</Badge>}
          {item.origin === 'web' && <Badge variant="info">{t('doc.common.originWeb')}</Badge>}
        </span>
      ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // (abierto / parcial / cerrado) se declaran una vez en lugar de duplicarse
  // entre una columna de botones y el menú contextual.
  const rowActions = (item: any): RowAction[] => {
    const canBeCancelled = item.status === 'O' || item.status === 'P';
    const canBeDelivered = item.status !== 'C' && item.status !== 'X';
    return [
      { label: t('doc.salesOrders.view'), icon: <Eye size={14} />, onClick: () => onDetail(item) },
      {
        label: t('doc.actions.downloadPdf'),
        icon: <Download size={14} />,
        onClick: () => handleQuickPdf(item.id),
      },
      ...(canBeDelivered
        ? [
            {
              label: t('doc.salesOrders.createDeliveryNote'),
              icon: <Copy size={14} />,
              onClick: () => onCopyToDelivery(item),
              separatorBefore: true,
            },
          ]
        : []),
      ...(canBeCancelled
        ? [
            {
              label: t('doc.salesOrders.void'),
              icon: <Ban size={14} />,
              destructive: true,
              onClick: () => onCancel(item.id),
              separatorBefore: !canBeDelivered,
            },
          ]
        : []),
    ];
  };

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        size="lg"
        divider
        className="pb-8"
        icon={<FileDigit size={18} />}
        title={t('doc.salesOrders.title')}
        subtitle={t('doc.salesOrders.subtitle')}
        toolbar={
          doc.state.mastersError && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-200 text-xs font-bold animate-in slide-in-from-top">
              <AlertCircle size={16} />
              {doc.state.mastersError}
            </div>
          )
        }
        actions={
          <div className="flex items-center gap-3">
            {doc.state.canWrite && onCreateFromClone && (
              <CloneDocumentActions docType="SO" onPaste={onCreateFromClone} show="paste" />
            )}
            <ResponsiveActions
              source="primary:create"
              actions={[
                {
                  id: 'create',
                  label: t('doc.salesOrders.new'),
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
                className="flex items-center gap-2 h-12 px-6 disabled:opacity-50"
              >
                <Plus size={20} /> {t('doc.salesOrders.new')}
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
                { label: t('doc.status.partial'), value: 'P' },
                { label: t('doc.status.closed'), value: 'C' },
              ],
            },
            {
              key: 'origin',
              label: t('doc.common.origin'),
              type: 'select',
              options: [{ label: t('doc.common.originWeb'), value: 'web' }],
            },
            { key: 'date', label: t('doc.common.date'), type: 'date' },
          ]}
          searchPlaceholder={t('doc.salesOrders.search')}
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="SO"
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

// --- Sub-componente: VISTA DE FORMULARIO ---
const SOForm: React.FC<{
  onSubmit: (e: any) => void;
  state: any;
  setState: any;
  masters: any;
  actions: any;
  computations: any;
  extraState: {
    deliveryDate: string;
    setDeliveryDate: any;
    internalOrderId: string | null;
    setInternalOrderId: (id: string | null) => void;
    billToAddress: string;
    setBillToAddress: any;
    shipToAddress: string;
    setShipToAddress: any;
  };
  setViewingBatch?: (l: any) => void;
}> = ({
  onSubmit,
  state,
  setState,
  masters,
  actions,
  computations,
  extraState,
  setViewingBatch,
}) => {
  const { t, locale } = useI18n();
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);
  const { flags } = useTheme();
  const warehouseLocation = flags.warehouseLocation;
  const zones = useLineZones(warehouseLocation);
  const zonesWithStock = useZonesWithStock();
  // Al elegir el interlocutor se rellenan sus direcciones por defecto.
  const handlePartnerChange = (id: string) => {
    setState.setPartnerId(id);
    const addr = defaultAddresses(masters.partners.find((x: any) => x.id === id));
    if (addr) {
      extraState.setBillToAddress(addr.bill);
      extraState.setShipToAddress(addr.ship);
    }
  };

  const columns = useFormLineColumns({
    kind: DocKind.Order,
    side: DocSide.Sale,
    state,
    masters,
    zones,
    actions,
    onAssignBatch: setBatchEditingIdx,
    onViewBatch: setViewingBatch,
    warehouseLocation,
    pluginTable: 'SalesOrderLine',
    getAvailableZones: zonesWithStock.get,
    extraDep: zones,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'optional' }), [locale]);
  const status = formStepStatus(
    state,
    masters,
    { partnerLabel: t('doc.steps.theCustomer'), warehouse: warehouseLocation !== 'line' },
    { batches: false },
  );
  const partner = masters.partners.find((x: any) => x.id === state.partnerId);

  return (
    <>
      <DocumentFormLayout
        title={t('doc.salesOrders.newTitle')}
        submitLabel={t('doc.salesOrders.confirm')}
        onSubmit={() => onSubmit(undefined)}
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
            withholdingAmount={computations.withholdingAmount}
            withholdingRate={state.withholdingRate}
            totalLabel={t('doc.salesOrders.totalForm')}
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
                    onChange={handlePartnerChange}
                    partners={masters.partners}
                    placeholder={t('doc.common.selectCustomer')}
                  />
                  {warehouseLocation !== 'line' ? (
                    <Field label={t('doc.salesOrders.outWarehouse')} required>
                      <SearchableSelect
                        value={state.warehouseId}
                        onChange={setState.setWarehouseId}
                        options={masters.warehouses.map((w: any) => ({
                          label: w.name,
                          value: w.id,
                        }))}
                        required
                      />
                    </Field>
                  ) : (
                    <span />
                  )}
                  <Textarea
                    label={t('doc.common.billTo')}
                    value={extraState.billToAddress}
                    onChange={(e) => extraState.setBillToAddress(e.target.value)}
                    rows={3}
                  />
                  <Textarea
                    label={t('doc.common.shipTo')}
                    value={extraState.shipToAddress}
                    onChange={(e) => extraState.setShipToAddress(e.target.value)}
                    rows={3}
                  />
                  <DatePicker
                    label={t('doc.salesOrders.date')}
                    required
                    value={state.date}
                    onChange={(v) => setState.setDate(v ?? '')}
                  />
                  <DatePicker
                    label={t('doc.salesOrders.expectedDelivery')}
                    value={extraState.deliveryDate || null}
                    onChange={(v) => extraState.setDeliveryDate(v ?? '')}
                  />
                  <InternalOrderHeaderField
                    value={extraState.internalOrderId}
                    onChange={extraState.setInternalOrderId}
                  />
                </FormGrid>
              }
              side={
                <>
                  <SeriesPeriodFields state={state} setState={setState} masters={masters} />
                  <PluginFieldsPanel
                    tableName="TABLESOForm"
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
              emptyMessage={t('doc.salesOrders.noLines')}
            />
          ),
          fiscal: (
            <div className="space-y-4">
              <WithholdingNotice
                partner={partner}
                currentRate={state.withholdingRate}
                onApply={setState.setWithholdingRate}
                docLabel={t('doc.nouns.order')}
                side="sale"
              />
              <DocumentFiscalPanel kind="sales" state={state} setState={setState} bare />
            </div>
          ),
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

// --- Sub-componente: VISTA DE DETALLE ---
const SODetail: React.FC<{
  onBack: () => void;
  onCopyToDelivery: () => void;
  onCancel: (id: string) => void;
  masters: any;
  setViewingBatch: (l: any) => void;
  order: any;
  doc: any;
}> = ({ order, onBack, onCopyToDelivery, onCancel, masters, setViewingBatch }) => {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const partner = masters.partners.find((p: any) => p.id === order.partnerId);
  const canBeCancelled = order.status === 'O' || order.status === 'P';
  const canBeDelivered = order.status !== 'C' && order.status !== 'X';

  const columns = useMemo(
    () =>
      buildDetailLineColumns({
        kind: DocKind.Order,
        side: DocSide.Sale,
        masters,
        onViewBatch: setViewingBatch,
        fmt,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order.lines, masters.items, masters.taxGroups, locale],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb={t('doc.salesOrders.breadcrumb')}
      title={formatDocCode(order)}
      status={statusBadgeProps(order.status, DocKind.Order)}
      actions={
        <DocumentActionBar
          docType="SO"
          pdfUrl={`/api/sales/${order.id}/pdf`}
          docId={order.id}
          docCode={formatDocCode(order)}
          onCancel={() => onCancel(order.id)}
          showCancel={canBeCancelled}
          primary={
            canBeDelivered
              ? {
                  label: t('doc.salesOrders.createDeliveryNote'),
                  icon: Copy,
                  onClick: onCopyToDelivery,
                }
              : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <CloneDocumentActions docType="SO" doc={order} show="copy" size={14} />
        <TraceabilityButton type="SO" id={order.id} docCode={formatDocCode(order)} />
        <InternalOrderChip internalOrderId={order.internalOrderId} />
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
          {(order.billToAddress || order.shipToAddress) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border-subtle">
              <div>
                <span className="text-[10px] font-black text-fg-subtle uppercase tracking-wider">
                  {t('doc.common.billToShort')}
                </span>
                <pre className="text-[11px] font-sans text-fg-body whitespace-pre-wrap leading-snug mt-1">
                  {order.billToAddress || '—'}
                </pre>
              </div>
              <div>
                <span className="text-[10px] font-black text-fg-subtle uppercase tracking-wider">
                  {t('doc.common.shipToShort')}
                </span>
                <pre className="text-[11px] font-sans text-fg-body whitespace-pre-wrap leading-snug mt-1">
                  {order.shipToAddress || '—'}
                </pre>
              </div>
            </div>
          )}
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
                {fmt.date(order.date)}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                {t('doc.salesOrders.delivery')}
              </dt>
              <dd className="text-sm font-bold text-fg-default tabular-nums">
                {order.deliveryDate ? fmt.date(order.deliveryDate) : '—'}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                {t('doc.steps.lines')}
              </dt>
              <dd className="text-sm font-bold text-fg-default tabular-nums">
                {order.lines?.length ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-border-subtle" noPadding>
        {isMobile ? (
          <MobileLineCards columns={columns} lines={order.lines || []} />
        ) : (
          <Table responsive="scroll" columns={columns} data={order.lines || []} />
        )}
        <DocumentTotalsBlock
          subtotal={order.subtotal}
          tax={Number(order.total) - Number(order.subtotal)}
          total={order.total}
          totalLabel={t('doc.salesOrders.total')}
        />
      </Card>

      <PluginFieldsPanel
        tableName="SalesOrder"
        values={order}
        onChange={() => {}}
        disabled
        layout="inline"
        title={t('doc.common.pluginFields')}
      />
      <AttachmentsPanel entityType="SalesOrder" entityId={order.id} />
    </DocumentDetailLayout>
  );
};

export const SalesOrders: React.FC = () => {
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
  const isDetail = !!detailId;
  const isList = !isCreate && !isDetail;

  const dataVersion = useDataVersion(DocType.SalesOrder);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(isList);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(isDetail);
  const [viewingBatch, setViewingBatch] = useState<any>(null);

  // Extras del formulario
  const [deliveryDate, setDeliveryDate] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [internalOrderId, setInternalOrderId] = useState<string | null>(null);
  // Presupuesto origen (flujo "Crear Pedido" desde un presupuesto).
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: DocType.SalesOrder,
    apiEndpoint: '/api/sales',
    permissions: (user as any)?.permissions?.['/sales-orders'],
  });
  useDocumentScanner(doc, isCreate);

  // Clone from clipboard
  useEffect(() => {
    if (!isCreate) return;
    const raw = sessionStorage.getItem('keirost:cloneInvoice:SO');
    if (!raw) return;
    sessionStorage.removeItem('keirost:cloneInvoice:SO');
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
            description: l.description,
            costCenterId: l.costCenterId,
            profitCenterId: l.profitCenterId,
            internalOrderId: l.internalOrderId,
          })),
        );
      }
    } catch (e) {
      console.error('Error parseando clone payload', e);
    }
  }, [isCreate]);

  // Copy-from presupuesto: /sales-orders/new?copyFrom=<id> ("Crear Pedido"
  // desde el detalle de un presupuesto). El pedido queda enlazado vía quoteId
  // y el presupuesto pasa a Aceptado en el servidor al crearse.
  useEffect(() => {
    if (!isCreate) return;
    const urlParams = new URLSearchParams(location.search);
    if (!urlParams.get('copyFrom')) return;
    const sourceData = localStorage.getItem('copy_quote_source');
    if (!sourceData) return;
    localStorage.removeItem('copy_quote_source');
    try {
      const quote = JSON.parse(sourceData);
      setQuoteId(quote.id);
      doc.setState.setPartnerId(quote.partnerId);
      if (quote.internalOrderId) setInternalOrderId(quote.internalOrderId);
      doc.setState.setLines(
        (quote.lines || []).map((l: any) => ({
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
      console.error('Error parsing copy_quote_source', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate]);

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
        const data = await docsApi.list('/api/sales');
        const withCode = (Array.isArray(data) ? data : []).map((d: any) => ({
          ...d,
          docCode: formatDocCode(d),
          partnerName: d.partnerName || '',
        }));
        setOrders(withCode);
      } catch {
        toast.error(t('doc.salesOrders.loadListError'));
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
        const data = await docsApi.get('/api/sales', detailId);
        setSelectedOrder(data);
        currentTab.rename(formatDocCode(data));
      } catch (e) {
        toast.error((e instanceof Error ? e.message : undefined) || t('doc.salesOrders.loadError'));
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [isDetail, detailId, token, user?.tenantId, dataVersion]);

  const handleSubmit = async (e: any) => {
    try {
      const data = await doc.actions.submitDocument({
        deliveryDate,
        billToAddress,
        shipToAddress,
        internalOrderId,
        ...(quoteId ? { quoteId } : {}),
      });
      toast.success(t('doc.salesOrders.created', { num: data.docNum }));
      notifyDocChange(DocType.SalesOrder);
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancel = async (id: string) => {
    const ok = await popup.confirm({
      title: t('doc.salesOrders.cancelTitle'),
      message: t('doc.salesOrders.cancelMessage'),
      tone: 'danger',
      confirmLabel: t('doc.salesOrders.cancelTitle'),
      cancelLabel: t('doc.common.back'),
    });
    if (!ok) return;
    try {
      await docsApi.cancel('/api/sales', id);
      toast.success(t('doc.salesOrders.cancelled'));
      notifyDocChange(DocType.SalesOrder);
      currentTab.close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    }
  };

  if (isCreate) {
    return (
      <>
        <SOForm
          onSubmit={handleSubmit}
          state={doc.state}
          setState={doc.setState}
          masters={doc.masters}
          actions={doc.actions}
          computations={doc.computations}
          extraState={{
            deliveryDate,
            setDeliveryDate,
            internalOrderId,
            setInternalOrderId,
            billToAddress,
            setBillToAddress,
            shipToAddress,
            setShipToAddress,
          }}
          setViewingBatch={setViewingBatch}
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
    if (detailLoading || !selectedOrder) {
      return (
        <div className="p-12 flex items-center justify-center">
          <Loader />
        </div>
      );
    }
    return (
      <>
        <SODetail
          doc={doc}
          order={selectedOrder}
          onBack={() => currentTab.close()}
          onCopyToDelivery={() => {
            localStorage.setItem('copy_order_source', JSON.stringify(selectedOrder));
            openTab(`/sales/delivery-notes/new?copyFrom=${selectedOrder.id}`, {
              title: t('doc.salesOrders.deliveryFrom', { code: formatDocCode(selectedOrder) }),
            });
          }}
          onCancel={handleCancel}
          masters={doc.masters}
          setViewingBatch={setViewingBatch}
        />
        {viewingBatch && (
          <BatchSelectionModal
            isOpen={true}
            onClose={() => setViewingBatch(null)}
            targetQuantity={viewingBatch.quantity || viewingBatch.orderedQty}
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
    <SOList
      doc={doc}
      data={orders}
      loading={loading}
      partners={doc.masters.partners}
      onCreate={() => openTab('/sales-orders/new')}
      onCreateFromClone={(payload) => {
        sessionStorage.setItem('keirost:cloneInvoice:SO', JSON.stringify(payload));
        openTab('/sales-orders/new');
      }}
      onDetail={(p) => openTab(`/sales-orders/${p.id}`, { title: formatDocCode(p) })}
      onCopyToDelivery={(order) => {
        localStorage.setItem('copy_order_source', JSON.stringify(order));
        openTab(`/sales/delivery-notes/new?copyFrom=${order.id}`, {
          title: t('doc.salesOrders.deliveryFrom', { code: formatDocCode(order) }),
        });
      }}
      onCancel={handleCancel}
    />
  );
};
