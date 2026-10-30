import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { SeriesPeriodFields } from '../components/form/SeriesPeriodFields';
import {
  HeaderSection,
  LinesSection,
  PartnerField,
  WithholdingNotice,
} from '../components/form/FormPieces';
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
  SearchableSelect,
  Field,
  FormGrid,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import {
  Truck,
  Plus,
  ShoppingCart,
  Copy,
  AlertCircle,
  Download,
  Eye,
  PackageSearch,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';

import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { CloneDocumentActions } from '@/components/common/CloneDocumentActions';
import { PreparationButton } from '@/components/common/PreparationButton';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
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
import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';
import { docsApi } from '../api';
import { apiClient, ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';

// Eliminamos SerialBadges inline para usar el modo Popup

// --- Sub-componente: VISTA DE LISTADO ---
const PDNList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onCreateFromClone?: (payload: { header: any; lines: any[] }) => void;
  onDetail: (pdn: any) => void;
  onCopyToInvoice: (pdn: any) => void;
  doc: any;
}> = ({ data, loading, partners, onCreate, onCreateFromClone, onDetail, onCopyToInvoice, doc }) => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const toast = useToast();
  const fmt = useFormat();
  const { flags } = useTheme();
  const tabs = (() => {
    try {
      return useTabs();
    } catch {
      return null;
    }
  })();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`/api/purchases/delivery-notes/${id}/pdf`);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('doc.common.pdfError'));
    } finally {
      setDownloadingId(null);
    }
  };

  const { filteredData, searchTerm, setSearchTerm, activeFilters, setFilter, clearFilters } =
    useDataTable({
      data,
      searchColumns: ['docCode', 'orderCode', 'partnerName', 'total'] as any,
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
            { label: t('doc.status.invoiced'), value: 'C' },
            { label: t('doc.status.cancelled'), value: 'X' },
          ],
        },
        { key: 'date', type: 'date', label: t('doc.common.date') },
      ],
    });

  const columns = [
    {
      header: t('doc.salesDeliveryNotes.colNumber'),
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
      header: t('doc.deliveryNotes.sourceOrder'),
      accessor: (item: any) =>
        item.orderDocNum ? (
          <Badge variant="info" className="font-mono text-[10px] opacity-80">
            {item.orderPrefix}-{item.periodCode}-{String(item.orderDocNum).padStart(6, '0')}
          </Badge>
        ) : (
          <span className="text-[10px] text-fg-subtle font-bold italic">
            {t('doc.deliveryNotes.direct')}
          </span>
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
      cell: (item: any) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.status === 'O' && <Badge variant="warning">{t('doc.status.open')}</Badge>}
          {item.status === 'C' && <Badge variant="success">{t('doc.status.invoiced')}</Badge>}
          {item.status === 'X' && <Badge variant="error">{t('doc.status.cancelled')}</Badge>}
          {item.hasActiveShipment && (
            <Badge variant="info">{t('doc.purchaseDeliveryNotes.inReceipt')}</Badge>
          )}
        </div>
      ),
    },
    {
      // `PreparationButton` es un componente con estado propio (loading, toast,
      // llamada a /api/logistics/prep) y no cabe en un `RowAction`, así que se
      // queda como columna. El resto de acciones pasan a `rowActions`.
      header: t('doc.common.actions'),
      align: 'right' as const,
      cell: (item: any) =>
        item.status === 'O' && !item.hasActiveShipment && flags.logisticsEnabled ? (
          <div onClick={(e) => e.stopPropagation()} className="inline-flex">
            <PreparationButton docType="PDN" docId={item.id} compact />
          </div>
        ) : null,
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // se declaran una vez en lugar de duplicarse entre una columna de botones y
  // el menú contextual.
  const rowActions = (item: any): RowAction[] => [
    {
      label: t('doc.salesDeliveryNotes.view'),
      icon: <Eye size={14} />,
      onClick: () => onDetail(item),
    },
    {
      label: t('doc.actions.downloadPdf'),
      icon: <Download size={14} />,
      onClick: () => handleQuickPdf(item.id),
    },
    ...(item.status === 'O'
      ? [
          {
            label: t('doc.deliveryNotes.invoice'),
            icon: <Copy size={14} />,
            onClick: () => onCopyToInvoice(item),
            separatorBefore: true,
          },
        ]
      : []),
    ...(item.hasActiveShipment && item.activeShipmentId
      ? [
          {
            label: t('doc.purchaseDeliveryNotes.viewReceipt'),
            icon: <PackageSearch size={14} />,
            onClick: () => {
              const path = `/logistics/shipments/${item.activeShipmentId}`;
              if (tabs && (tabs as any).openTab) {
                (tabs as any).openTab(path, {
                  title: t('doc.purchaseDeliveryNotes.receiptInProgress'),
                });
              } else {
                window.location.href = path;
              }
            },
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('doc.purchaseDeliveryNotes.title')}
        subtitle={t('doc.purchaseDeliveryNotes.subtitle')}
        icon={<Truck size={18} />}
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
            {doc.state.canWrite && onCreateFromClone && (
              <CloneDocumentActions docType="PDN" onPaste={onCreateFromClone} show="paste" />
            )}
            <ResponsiveActions
              source="primary:create"
              actions={[
                {
                  id: 'create',
                  label: t('doc.purchaseDeliveryNotes.new'),
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
                <Plus size={20} /> {t('doc.purchaseDeliveryNotes.new')}
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
                { label: t('doc.status.invoiced'), value: 'C' },
                { label: t('doc.status.cancelled'), value: 'X' },
              ],
            },
            { key: 'date', label: t('doc.common.date'), type: 'date' },
          ]}
          searchPlaceholder={t('doc.deliveryNotes.search')}
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="PDN"
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
const PDNForm: React.FC<{
  onSubmit: (e: any) => void;
  state: any;
  setState: any;
  masters: any;
  actions: any;
  computations: any;
  zones: any[];
  orderId: string | null;
  internalOrderId: string | null;
  setInternalOrderId: (id: string | null) => void;
  setViewingBatch: (l: any) => void;
}> = ({
  onSubmit,
  state,
  setState,
  masters,
  actions,
  computations,
  zones,
  orderId,
  internalOrderId,
  setInternalOrderId,
  setViewingBatch,
}) => {
  const { t, locale } = useI18n();
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);
  const { flags } = useTheme();
  const warehouseLocation = flags.warehouseLocation;

  const duplicateLine = (idx: number) => {
    const newLine = { ...state.lines[idx], batchDetails: [] };
    const newLines = [...state.lines];
    newLines.splice(idx + 1, 0, newLine);
    setState.setLines(newLines);
  };

  const filteredZones = zones.filter(
    (z) => !state.warehouseId || z.warehouseId === state.warehouseId,
  );

  const columns = useFormLineColumns({
    kind: DocKind.DeliveryNote,
    side: DocSide.Purchase,
    state,
    masters,
    zones: warehouseLocation === 'line' ? zones : filteredZones,
    actions,
    onAssignBatch: setBatchEditingIdx,
    onViewBatch: setViewingBatch,
    onDuplicateLine: duplicateLine,
    warehouseLocation,
    pluginTable: 'PurchaseDeliveryNoteLine',
    extraDep: `${state.warehouseId}|${zones.length}`,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'optional' }), [locale]);
  const status = formStepStatus(state, masters, {
    partnerLabel: t('doc.steps.theSupplier'),
    warehouse: warehouseLocation !== 'line',
  });
  const partner = masters.partners.find((x: any) => x.id === state.partnerId);

  return (
    <>
      <DocumentFormLayout
        title={
          <span className="flex items-center gap-3">
            {t('doc.purchaseDeliveryNotes.formTitle')}
            {orderId && <Badge variant="info">{t('doc.deliveryNotes.fromOrder')}</Badge>}
          </span>
        }
        subtitle={t('doc.purchaseDeliveryNotes.formSubtitle')}
        submitLabel={t('doc.deliveryNotes.submit')}
        onSubmit={() => onSubmit(undefined)}
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
            withholdingRate={state.withholdingRate}
            totalLabel={t('doc.deliveryNotes.totalForm')}
          />
        }
        sections={{
          header: (
            <HeaderSection
              fields={
                <FormGrid columns={2}>
                  <PartnerField
                    label={t('doc.partner.supplier')}
                    value={state.partnerId}
                    onChange={setState.setPartnerId}
                    partners={masters.partners}
                    placeholder={t('doc.common.selectSupplier')}
                  />
                  {warehouseLocation !== 'line' ? (
                    <Field label={t('doc.purchaseDeliveryNotes.inWarehouse')} required>
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
                  <DatePicker
                    label={t('doc.deliveryNotes.date')}
                    required
                    value={state.date}
                    onChange={(v) => setState.setDate(v ?? '')}
                  />
                  <InternalOrderHeaderField value={internalOrderId} onChange={setInternalOrderId} />
                </FormGrid>
              }
              side={
                <>
                  <SeriesPeriodFields state={state} setState={setState} masters={masters} />
                  <PluginFieldsPanel
                    tableName="PurchaseDeliveryNote"
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
              emptyMessage={t('doc.deliveryNotes.noLines')}
            />
          ),
          fiscal: (
            <div className="space-y-4">
              <WithholdingNotice
                partner={partner}
                currentRate={state.withholdingRate}
                onApply={setState.setWithholdingRate}
                docLabel={t('doc.nouns.goodsReceipt')}
                side="purchase"
              />
              <DocumentFiscalPanel kind="purchase" state={state} setState={setState} bare />
            </div>
          ),
        }}
      />

      <BatchAssignmentPanel
        isOpen={batchEditingIdx !== null}
        onClose={() => setBatchEditingIdx(null)}
        lines={state.lines}
        masters={masters}
        zones={zones}
        warehouseId={state.warehouseId}
        warehouseLocation={warehouseLocation}
        initialLineIdx={batchEditingIdx}
        isSale={false}
        onSave={(updates) => {
          const nextLines = [...state.lines];
          const extraLines: any[] = [];
          for (const u of updates) {
            const base = nextLines[u.idx];
            if (!base) continue;
            const groups = new Map<string, typeof u.batchDetails>();
            for (const bd of u.batchDetails) {
              const key = bd.zoneId || base.zoneId || '';
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(bd);
            }
            const groupArr = Array.from(groups.entries());
            if (groupArr.length <= 1) {
              const [zoneId, batches] = groupArr[0] ?? ['', []];
              nextLines[u.idx] = {
                ...base,
                zoneId: zoneId || base.zoneId,
                batchDetails: batches,
              };
            } else {
              const [firstZone, firstBatches] = groupArr[0];
              const firstQty = firstBatches.reduce((a, b) => a + Number(b.quantity || 0), 0);
              nextLines[u.idx] = {
                ...base,
                zoneId: firstZone || base.zoneId,
                quantity: firstQty,
                batchDetails: firstBatches,
              };
              for (let g = 1; g < groupArr.length; g++) {
                const [zId, batches] = groupArr[g];
                const qty = batches.reduce((a, b) => a + Number(b.quantity || 0), 0);
                const { baseId, ...rest } = base;
                extraLines.push({
                  ...rest,
                  zoneId: zId || base.zoneId,
                  quantity: qty,
                  batchDetails: batches,
                });
              }
            }
          }
          setState.setLines([...nextLines, ...extraLines]);
        }}
      />
    </>
  );
};

// --- Sub-componente: VISTA DE DETALLE ---
const PDNDetail: React.FC<{
  pdn: any;
  onBack: () => void;
  onCancel: (id: string) => void;
  onCopyToInvoice: () => void;
  masters: any;
  zones: any[];
  setViewingBatch: (l: any) => void;
}> = ({ pdn, onBack, onCancel, onCopyToInvoice, masters, zones, setViewingBatch }) => {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const { flags } = useTheme();
  const partner = masters.partners.find((p: any) => p.id === pdn.partnerId);

  const columns = useMemo(
    () =>
      buildDetailLineColumns({
        kind: DocKind.DeliveryNote,
        side: DocSide.Purchase,
        masters,
        zones,
        onViewBatch: setViewingBatch,
        fmt,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pdn.lines, masters.items, masters.taxGroups, locale],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb={t('doc.purchaseDeliveryNotes.breadcrumb')}
      title={formatDocCode(pdn)}
      status={statusBadgeProps(pdn.status, DocKind.DeliveryNote)}
      actions={
        <DocumentActionBar
          docType="PDN"
          pdfUrl={`/api/purchases/delivery-notes/${pdn.id}/pdf`}
          docId={pdn.id}
          docCode={formatDocCode(pdn)}
          onCancel={() => onCancel(pdn.id)}
          showCancel={pdn.status === 'O'}
          primary={
            pdn.status === 'O'
              ? { label: t('doc.deliveryNotes.invoice'), icon: Copy, onClick: onCopyToInvoice }
              : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <CloneDocumentActions docType="PDN" doc={pdn} show="copy" size={14} />
        <TraceabilityButton type="PDN" id={pdn.id} docCode={formatDocCode(pdn)} />
        <InternalOrderChip internalOrderId={pdn.internalOrderId} />
        {pdn.status === 'O' && flags.logisticsEnabled && (
          <PreparationButton docType="PDN" docId={pdn.id} />
        )}
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
          {pdn.orderId && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/30 rounded-lg">
              <ShoppingCart size={14} className="text-blue-600 dark:text-blue-300 shrink-0" />
              <p className="text-xs font-bold text-blue-800 dark:text-blue-200 leading-tight">
                {t('doc.deliveryNotes.fromOrderCode', {
                  code: `${pdn.orderPrefix}-${pdn.periodCode}-${String(pdn.orderDocNum).padStart(6, '0')}`,
                })}
              </p>
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
                {fmt.date(pdn.date)}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                {t('doc.steps.lines')}
              </dt>
              <dd className="text-sm font-bold text-fg-default tabular-nums">
                {pdn.lines?.length ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-border-subtle" noPadding>
        {isMobile ? (
          <MobileLineCards columns={columns} lines={pdn.lines || []} />
        ) : (
          <Table responsive="scroll" columns={columns} data={pdn.lines || []} />
        )}
        <DocumentTotalsBlock
          subtotal={pdn.subtotal || 0}
          tax={pdn.taxTotal || 0}
          total={pdn.total || 0}
          totalLabel={t('doc.deliveryNotes.total')}
        />
      </Card>

      <PluginFieldsPanel
        tableName="PurchaseDeliveryNote"
        values={pdn}
        onChange={() => {}}
        disabled
        layout="inline"
        title={t('doc.common.pluginFields')}
      />
      <AttachmentsPanel entityType="PurchaseDeliveryNote" entityId={pdn.id} />
    </DocumentDetailLayout>
  );
};

export const PurchaseDeliveryNotes: React.FC = () => {
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

  const dataVersion = useDataVersion(DocType.PurchaseDeliveryNote);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(isList);
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(isDetail);
  const [zones, setZones] = useState<any[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [internalOrderId, setInternalOrderId] = useState<string | null>(null);
  const [viewingBatch, setViewingBatch] = useState<any>(null);

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: DocType.PurchaseDeliveryNote,
    apiEndpoint: '/api/purchases/delivery-notes',
    permissions: (user as any)?.permissions?.['/purchases/delivery-notes'],
  });
  useDocumentScanner(doc, isCreate);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    (async () => {
      try {
        const data = await docsApi.list('/api/zones');
        setZones(Array.isArray(data) ? data : []);
      } catch {}
    })();
  }, [user?.tenantId]);

  // Listado
  useEffect(() => {
    if (!isList || !user?.tenantId) return;
    (async () => {
      try {
        setLoading(true);
        const data = await docsApi.list('/api/purchases/delivery-notes');
        const withCode = (Array.isArray(data) ? data : []).map((d: any) => ({
          ...d,
          docCode: formatDocCode(d),
          partnerName: d.partnerName || '',
        }));
        setDeliveries(withCode);
      } catch {
        toast.error(t('doc.deliveryNotes.loadListError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [isList, user?.tenantId, dataVersion]);

  // Detalle
  useEffect(() => {
    if (!isDetail || !detailId || !user?.tenantId) return;
    (async () => {
      try {
        setDetailLoading(true);
        const data = await docsApi.get('/api/purchases/delivery-notes', detailId);
        setSelectedDelivery(data);
        currentTab.rename(formatDocCode(data));
      } catch (e) {
        toast.error(
          (e instanceof Error ? e.message : undefined) || t('doc.deliveryNotes.loadError'),
        );
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [isDetail, detailId, user?.tenantId, dataVersion]);

  // Clone from clipboard
  useEffect(() => {
    if (!isCreate) return;
    const raw = sessionStorage.getItem('keirost:cloneInvoice:PDN');
    if (!raw) return;
    sessionStorage.removeItem('keirost:cloneInvoice:PDN');
    try {
      const { header, lines } = JSON.parse(raw);
      if (header?.partnerId) doc.setState.setPartnerId(header.partnerId);
      if (header?.internalOrderId) setInternalOrderId(header.internalOrderId);
      if (header?.warehouseId) doc.setState.setWarehouseId(header.warehouseId);
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

  // Copy-from: /purchases/delivery-notes/new?copyFrom=<id>
  useEffect(() => {
    if (!isCreate) return;
    const urlParams = new URLSearchParams(location.search);
    if (!urlParams.get('copyFrom')) return;
    const sourceData = localStorage.getItem('copy_order_source');
    if (!sourceData) return;
    try {
      const order = JSON.parse(sourceData);
      setOrderId(order.id);
      doc.setState.setPartnerId(order.partnerId);
      doc.setState.setWarehouseId(order.warehouseId);
      if (order.internalOrderId) setInternalOrderId(order.internalOrderId);
      doc.setState.setLines(
        order.lines.map((l: any) => ({
          itemId: l.itemId,
          quantity: Number(l.orderedQty) - Number(l.receivedQty),
          price: l.price,
          taxGroupId: l.taxGroupId,
          warehouseId: l.warehouseId || order.warehouseId,
          zoneId: l.zoneId || '',
          batchNum: l.batchNum,
          baseLine: l.lineNum,
          lineNum: l.lineNum,
          uomId: l.uomId,
          uomFactor: l.uomFactor != null ? Number(l.uomFactor) : undefined,
          description: l.description,
          discountRate: l.discountRate != null ? Number(l.discountRate) : undefined,
          discountAmount: l.discountAmount != null ? Number(l.discountAmount) : undefined,
          withholdingRate: l.withholdingRate != null ? Number(l.withholdingRate) : undefined,
          withholdingAmount: l.withholdingAmount != null ? Number(l.withholdingAmount) : undefined,
          costCenterId: l.costCenterId,
          profitCenterId: l.profitCenterId,
          internalOrderId: l.internalOrderId,
        })),
      );
    } catch (e) {
      console.error('Error parsing copy_order_source', e);
    }
  }, [isCreate]);

  const handleSubmit = async (e: any) => {
    try {
      const data = await doc.actions.submitDocument({ orderId, internalOrderId });
      toast.success(t('doc.deliveryNotes.created', { num: data.docNum }));
      notifyDocChange(DocType.PurchaseDeliveryNote);
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancel = async (id: string) => {
    const reason = window.prompt(t('doc.purchaseDeliveryNotes.cancelReasonPrompt'), '');
    if (reason === null) return;
    // El flag de la empresa decide si se pide confirmación — no se toca.
    if (flags.confirmBeforeCancel) {
      const ok = await popup.confirm({
        title: t('doc.deliveryNotes.cancelTitle'),
        message: t('doc.purchaseDeliveryNotes.cancelMessage'),
        tone: 'danger',
        confirmLabel: t('doc.deliveryNotes.cancelTitle'),
        cancelLabel: t('doc.common.back'),
      });
      if (!ok) return;
    }
    const doCall = (force: boolean) =>
      apiClient.post<any>(`/api/purchases/delivery-notes/${id}/cancel`, {
        reason: reason || null,
        force,
      });
    try {
      let d: any;
      try {
        d = await doCall(false);
      } catch (err) {
        // 409 con requiresForce = recepción en curso — pedir confirmación y forzar.
        if (err instanceof ApiError && err.status === 409 && (err.body as any)?.requiresForce) {
          const forceOk = await popup.confirm({
            title: t('doc.purchaseDeliveryNotes.receiptInProgress'),
            message: t('doc.purchaseDeliveryNotes.inProgressMessage'),
            tone: 'danger',
            confirmLabel: t('doc.salesDeliveryNotes.cancelAnyway'),
            cancelLabel: t('doc.common.back'),
          });
          if (!forceOk) return;
          d = await doCall(true);
        } else {
          throw err;
        }
      }
      toast.success(
        d?.shipmentCancelled
          ? t('doc.purchaseDeliveryNotes.cancelledWithReceipt')
          : t('doc.deliveryNotes.cancelled'),
      );
      notifyDocChange(DocType.PurchaseDeliveryNote);
      currentTab.close();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : undefined) || t('doc.common.cancelError'));
    }
  };

  useEffect(() => {
    if (!isCreate) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        doc.actions.addLine();
      }
      if (e.key === 'F10') {
        e.preventDefault();
        handleSubmit(e);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreate, doc.state.lines, doc.state.partnerId]);

  if (isCreate) {
    return (
      <>
        <PDNForm
          onSubmit={handleSubmit}
          state={doc.state}
          setState={doc.setState}
          masters={doc.masters}
          actions={doc.actions}
          computations={doc.computations}
          zones={zones}
          orderId={orderId}
          internalOrderId={internalOrderId}
          setInternalOrderId={setInternalOrderId}
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
    if (detailLoading || !selectedDelivery) {
      return (
        <div className="p-12 flex items-center justify-center">
          <Loader />
        </div>
      );
    }
    return (
      <>
        <PDNDetail
          pdn={selectedDelivery}
          onBack={() => currentTab.close()}
          onCancel={handleCancel}
          onCopyToInvoice={() => {
            localStorage.setItem('copy_pdn_source', JSON.stringify(selectedDelivery));
            openTab(`/purchases/invoices/new?copyFrom=${selectedDelivery.id}`, {
              title: t('doc.quotes.invoiceFrom', { code: formatDocCode(selectedDelivery) }),
            });
          }}
          masters={doc.masters}
          zones={zones}
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

  return (
    <PDNList
      doc={doc}
      data={deliveries}
      loading={loading}
      partners={doc.masters.partners}
      onCreate={() => openTab('/purchases/delivery-notes/new')}
      onCreateFromClone={(payload) => {
        sessionStorage.setItem('keirost:cloneInvoice:PDN', JSON.stringify(payload));
        openTab('/purchases/delivery-notes/new');
      }}
      onDetail={(p) => openTab(`/purchases/delivery-notes/${p.id}`, { title: formatDocCode(p) })}
      onCopyToInvoice={(p) => {
        docsApi.get('/api/purchases/delivery-notes', p.id).then((detail) => {
          localStorage.setItem('copy_pdn_source', JSON.stringify(detail));
          openTab(`/purchases/invoices/new?copyFrom=${p.id}`, {
            title: t('doc.quotes.invoiceFrom', { code: formatDocCode(p) }),
          });
        });
      }}
    />
  );
};
