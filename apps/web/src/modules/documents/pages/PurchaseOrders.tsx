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
import {
  Table,
  Card,
  Button,
  DatePicker,
  Textarea,
  useToast,
  Badge,
  FilterBar,
  PageHeader,
  SearchableSelect,
  Field,
  FormGrid,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import { useTheme } from '@/context/ThemeContext';
import { formatDocCode } from '@/utils/docCode';
import { FileDigit, Plus, AlertCircle, Copy, Download, Eye, Ban } from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';

import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { CloneDocumentActions } from '@/components/common/CloneDocumentActions';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { TraceabilityButton } from '@/components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { buildDetailLineColumns, statusBadgeProps } from '../components/documentLineCells';
import { downloadPdf } from '@/utils/downloadPdf';
import { useFormat } from '@/hooks/useFormat';

import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '@/hooks/useDocumentScanner';
import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { docsApi } from '../api';
import { useI18n } from '@/i18n/I18nContext';

// --- Sub-componente: VISTA DE LISTADO ---
const POList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onCreateFromClone?: (payload: { header: any; lines: any[] }) => void;
  onDetail: (order: any) => void;
  onCopyToDelivery: (order: any) => void;
  onCancel: (id: string) => void;
  canWrite?: boolean;
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
  canWrite,
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
      await downloadPdf(`/api/purchases/orders/${id}/pdf`);
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
            { label: t('doc.status.open'), value: 'O' },
            { label: t('doc.status.partial'), value: 'P' },
            { label: t('doc.status.closed'), value: 'C' },
          ],
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
      header: t('doc.partner.supplier'),
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
        <>
          {item.status === 'O' && <Badge variant="warning">{t('doc.status.open')}</Badge>}
          {item.status === 'P' && <Badge variant="info">{t('doc.status.partial')}</Badge>}
          {item.status === 'C' && <Badge variant="success">{t('doc.status.closed')}</Badge>}
          {item.status === 'X' && <Badge variant="error">{t('doc.status.cancelled')}</Badge>}
        </>
      ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // (abierto / parcial / cerrado) se declaran una vez en lugar de duplicarse
  // entre una columna de botones y el menú contextual.
  const rowActions = (item: any): RowAction[] => {
    const canBeCancelled = item.status === 'O' || item.status === 'P';
    const canBeReceived = item.status !== 'C' && item.status !== 'X';
    return [
      { label: t('doc.salesOrders.view'), icon: <Eye size={14} />, onClick: () => onDetail(item) },
      {
        label: t('doc.actions.downloadPdf'),
        icon: <Download size={14} />,
        onClick: () => handleQuickPdf(item.id),
      },
      ...(canBeReceived
        ? [
            {
              label: t('doc.purchaseOrders.createReceipt'),
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
              separatorBefore: !canBeReceived,
            },
          ]
        : []),
    ];
  };

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('doc.purchaseOrders.title')}
        subtitle={t('doc.purchaseOrders.subtitle')}
        icon={<FileDigit size={18} />}
        size="lg"
        divider
        toolbar={
          doc.state.mastersError ? (
            <div className="flex items-center gap-2 p-3 bg-warning-bg border border-warning rounded-lg text-warning-fg text-xs font-bold animate-in slide-in-from-top">
              <AlertCircle size={16} />
              {doc.state.mastersError}
            </div>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-3">
            {canWrite && onCreateFromClone && (
              <CloneDocumentActions docType="PO" onPaste={onCreateFromClone} show="paste" />
            )}
            <ResponsiveActions
              source="primary:create"
              actions={[
                {
                  id: 'create',
                  label: t('doc.salesOrders.new'),
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
                className="flex items-center gap-2 disabled:opacity-50"
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
              label: t('doc.partner.supplier'),
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
            { key: 'date', label: t('doc.common.date'), type: 'date' },
          ]}
          searchPlaceholder={t('doc.salesOrders.search')}
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="PO"
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
const POForm: React.FC<{
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
  // El pedido de compra no asigna lotes (se hace al recibir), pero el builder
  // de columnas pide el callback.
  const [, setBatchEditingIdx] = useState<number | null>(null);
  const { t, locale } = useI18n();
  const { flags } = useTheme();
  const warehouseLocation = flags.warehouseLocation;
  const zones = useLineZones(warehouseLocation);

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
    side: DocSide.Purchase,
    state,
    masters,
    zones,
    actions,
    onAssignBatch: setBatchEditingIdx,
    onViewBatch: setViewingBatch,
    warehouseLocation,
    pluginTable: 'PurchaseOrderLine',
    extraDep: zones,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'optional' }), [locale]);
  const status = formStepStatus(
    state,
    masters,
    { partnerLabel: t('doc.steps.theSupplier'), warehouse: warehouseLocation !== 'line' },
    { batches: false },
  );
  const partner = masters.partners.find((x: any) => x.id === state.partnerId);

  return (
    <>
      <DocumentFormLayout
        title={t('doc.purchaseOrders.newTitle')}
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
                    label={t('doc.purchaseOrders.supplierCreditor')}
                    value={state.partnerId}
                    onChange={handlePartnerChange}
                    partners={masters.partners}
                    placeholder={t('doc.common.selectSupplier')}
                  />
                  {warehouseLocation !== 'line' ? (
                    <Field label={t('doc.purchaseOrders.inWarehouse')} required>
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
                    tableName="TABLEPOForm"
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
                side="purchase"
              />
              <DocumentFiscalPanel kind="purchase" state={state} setState={setState} bare />
            </div>
          ),
        }}
      />
    </>
  );
};

// --- Sub-componente: VISTA DE DETALLE ---
const PODetail: React.FC<{
  order: any;
  onBack: () => void;
  onCopyToDelivery: () => void;
  onCancel?: (id: string) => void;
  masters: any;
  setViewingBatch?: (l: any) => void;
}> = ({ order, onBack, onCopyToDelivery, onCancel, masters, setViewingBatch }) => {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const partner = masters.partners.find((p: any) => p.id === order.partnerId);
  const canBeCancelled = order.status === 'O' || order.status === 'P';
  const canBeReceived = order.status !== 'C' && order.status !== 'X';

  const columns = useMemo(
    () =>
      buildDetailLineColumns({
        kind: DocKind.Order,
        side: DocSide.Purchase,
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
      breadcrumb={t('doc.purchaseOrders.breadcrumb')}
      title={formatDocCode(order)}
      status={statusBadgeProps(order.status, DocKind.Order)}
      actions={
        <DocumentActionBar
          docType="PO"
          pdfUrl={`/api/purchases/orders/${order.id}/pdf`}
          docId={order.id}
          docCode={formatDocCode(order)}
          onCancel={onCancel ? () => onCancel(order.id) : undefined}
          showCancel={canBeCancelled && !!onCancel}
          primary={
            canBeReceived
              ? {
                  label: t('doc.purchaseOrders.createReceipt'),
                  icon: Copy,
                  onClick: onCopyToDelivery,
                }
              : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <CloneDocumentActions docType="PO" doc={order} show="copy" size={14} />
        <TraceabilityButton type="PO" id={order.id} docCode={formatDocCode(order)} />
        <InternalOrderChip internalOrderId={order.internalOrderId} />
      </div>
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
        tableName="PurchaseOrder"
        values={order}
        onChange={() => {}}
        disabled
        layout="inline"
        title={t('doc.common.pluginFields')}
      />
      <AttachmentsPanel entityType="PurchaseOrder" entityId={order.id} />
    </DocumentDetailLayout>
  );
};

// --- COMPONENTE PRINCIPAL ---
export const PurchaseOrders: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const toast = useToast();
  const { openTab } = useTabs();
  const params = useParams();
  const location = useLocation();
  const currentTab = useCurrentTab();

  const detailId = params.id;
  const isCreate = location.pathname.endsWith('/new');
  const isDetail = !!detailId;
  const isList = !isCreate && !isDetail;

  const dataVersion = useDataVersion(DocType.PurchaseOrder);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(isList);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(isDetail);

  // Estados extras del formulario
  const [deliveryDate, setDeliveryDate] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [internalOrderId, setInternalOrderId] = useState<string | null>(null);

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: DocType.PurchaseOrder,
    apiEndpoint: '/api/purchases/orders',
    permissions: (user as any)?.permissions?.['/purchase-orders'],
  });
  useDocumentScanner(doc, isCreate);

  // Clone from clipboard (se dispara cuando entramos en modo create).
  useEffect(() => {
    if (!isCreate) return;
    const raw = sessionStorage.getItem('keirost:cloneInvoice:PO');
    if (!raw) return;
    sessionStorage.removeItem('keirost:cloneInvoice:PO');
    try {
      const { header, lines } = JSON.parse(raw);
      if (header?.partnerId) doc.setState.setPartnerId(header.partnerId);
      if (header?.internalOrderId) setInternalOrderId(header.internalOrderId);
      if (header?.warehouseId) doc.setState.setWarehouseId?.(header.warehouseId);
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

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await docsApi.list('/api/purchases/orders');
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
  };

  useEffect(() => {
    if (!isList) return;
    if (token && user?.tenantId) {
      fetchOrders();
    } else if (token) {
      setLoading(false);
    }
  }, [isList, token, user, dataVersion]);

  // Detalle — carga por URL /:id.
  useEffect(() => {
    if (!isDetail || !detailId || !token || !user?.tenantId) return;
    (async () => {
      try {
        setDetailLoading(true);
        const data = await docsApi.get('/api/purchases/orders', detailId);
        setSelectedOrder(data);
        currentTab.rename(formatDocCode(data));
      } catch (err) {
        toast.error(
          (err instanceof Error ? (err instanceof Error ? err.message : undefined) : undefined) ||
            t('doc.purchaseOrders.networkLoadError'),
        );
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [isDetail, detailId, token, user?.tenantId, dataVersion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCreate) {
        if (e.key === 'F2') {
          e.preventDefault();
          doc.actions.addLine();
        }
        if (e.key === 'F10') {
          e.preventDefault();
          handleSubmit(e);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreate, doc.state.lines, doc.state.partnerId]);

  const handleSubmit = async (e: any) => {
    try {
      const data = await doc.actions.submitDocument({
        deliveryDate,
        billToAddress,
        shipToAddress,
        internalOrderId,
      });
      toast.success(t('doc.salesOrders.created', { num: data.docNum }));
      notifyDocChange(DocType.PurchaseOrder);
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancelOrder = async (id: string) => {
    try {
      await docsApi.cancel('/api/purchases/orders', id);
      toast.success(t('doc.salesOrders.cancelled'));
      notifyDocChange(DocType.PurchaseOrder);
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  if (isCreate)
    return (
      <POForm
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
      />
    );
  if (isDetail) {
    if (detailLoading || !selectedOrder) {
      return (
        <div className="p-8 text-center text-fg-subtle text-sm">
          {t('doc.purchaseOrders.loading')}
        </div>
      );
    }
    return (
      <PODetail
        order={selectedOrder}
        onBack={() => currentTab.close()}
        onCopyToDelivery={() => {
          localStorage.setItem('copy_order_source', JSON.stringify(selectedOrder));
          openTab(`/purchases/delivery-notes/new?copyFrom=${selectedOrder.id}`, {
            title: t('doc.purchaseOrders.receiptFrom', { code: formatDocCode(selectedOrder) }),
          });
        }}
        onCancel={handleCancelOrder}
        masters={doc.masters}
      />
    );
  }

  return (
    <POList
      doc={doc}
      data={orders}
      loading={loading}
      partners={doc.masters.partners}
      onCreate={() => openTab('/purchase-orders/new')}
      onCreateFromClone={(payload) => {
        sessionStorage.setItem('keirost:cloneInvoice:PO', JSON.stringify(payload));
        openTab('/purchase-orders/new');
      }}
      canWrite={doc.state.canWrite}
      onDetail={(p) => openTab(`/purchase-orders/${p.id}`, { title: formatDocCode(p) })}
      onCopyToDelivery={(order) => {
        localStorage.setItem('copy_order_source', JSON.stringify(order));
        openTab(`/purchases/delivery-notes/new?copyFrom=${order.id}`, {
          title: t('doc.purchaseOrders.receiptFrom', { code: formatDocCode(order) }),
        });
      }}
      onCancel={handleCancelOrder}
    />
  );
};
