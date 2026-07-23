import { crudApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Loader,
  useToast,
  Badge,
  FilterBar,
  SearchableSelect,
} from '@openfactu/ui';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import { useTheme } from '@/context/ThemeContext';
import { formatDocCode } from '@/utils/docCode';
import {
  FileDigit,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  ShoppingCart,
  FileText,
  AlertCircle,
  Copy,
  PlusSquare,
  Download,
  Eye,
  Ban,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';
import { useInternalOrderLineColumn } from '@/hooks/useLineInternalOrderColumn';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { DocumentCardList } from '../components/DocumentCardList';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { CloneDocumentActions } from '@/components/common/CloneDocumentActions';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { TraceabilityButton } from '@/components/common/TraceabilityButton';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import {
  buildDetailLineColumns,
  buildFormLineColumns,
  statusBadgeProps,
} from '../components/documentLineCells';
import { downloadPdf } from '@/utils/downloadPdf';
import { useFormat } from '@/hooks/useFormat';
import { useItemUoms } from '@/hooks/useItemUoms';
import { usePluginLineFields } from '@/hooks/usePluginLineFields';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '@/hooks/useDocumentScanner';
import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { docsApi } from '../api';

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
  const { token, user } = useAuth();
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const toast = useToast();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`/api/purchases/orders/${id}/pdf`);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al descargar PDF');
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
          label: 'Proveedor',
          options: partners.map((p) => ({ label: p.name, value: p.id })),
        },
        {
          key: 'status',
          type: 'select',
          label: 'Estado',
          options: [
            { label: 'Abierto', value: 'O' },
            { label: 'Parcial', value: 'P' },
            { label: 'Cerrado', value: 'C' },
          ],
        },
        { key: 'date', type: 'date', label: 'Fecha' },
      ],
    });

  const columns = [
    {
      header: 'No. Pedido',
      sortable: true,
      sortAccessor: (item: any) => formatDocCode(item),
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 dark:text-slate-100 leading-none">
            {formatDocCode(item)}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
            ID: {item.id.substring(0, 8)}
          </span>
        </div>
      ),
    },
    {
      header: 'Fecha',
      sortable: true,
      sortAccessor: (item: any) => new Date(item.date).getTime(),
      accessor: (item: any) => fmt.date(item.date),
    },
    {
      header: 'Proveedor',
      sortable: true,
      sortAccessor: (item: any) => item.partnerName || '',
      accessor: (item: any) =>
        item.partnerName || partners.find((p) => p.id === item.partnerId)?.name || '...',
    },
    {
      header: 'Total',
      align: 'right' as const,
      sortable: true,
      sortAccessor: (item: any) => Number(item.total) || 0,
      accessor: (item: any) => (
        <span className="font-black text-slate-900 dark:text-slate-100">
          {fmt.money(item.total)}
        </span>
      ),
    },
    {
      header: 'Estado',
      align: 'center' as const,
      sortable: true,
      sortAccessor: (item: any) => item.status || '',
      cell: (item: any) => (
        <>
          {item.status === 'O' && <Badge variant="warning">Abierto</Badge>}
          {item.status === 'P' && <Badge variant="info">Parcial</Badge>}
          {item.status === 'C' && <Badge variant="success">Cerrado</Badge>}
          {item.status === 'X' && <Badge variant="error">Cancelado</Badge>}
        </>
      ),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (item: any) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleQuickPdf(item.id);
            }}
            isLoading={downloadingId === item.id}
            className="h-8 w-8 p-0 text-ink-500 dark:text-ink-400 hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/15"
            title="Descargar PDF"
          >
            <Download size={14} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDetail(item);
            }}
          >
            Ver Pedido
          </Button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (item: any) => {
    const canBeCancelled = item.status === 'O' || item.status === 'P';
    const canBeReceived = item.status !== 'C' && item.status !== 'X';
    return [
      { label: 'Ver Pedido', icon: <Eye size={14} />, onClick: () => onDetail(item) },
      {
        label: 'Descargar PDF',
        icon: <Download size={14} />,
        onClick: () => handleQuickPdf(item.id),
      },
      ...(canBeReceived
        ? [
            {
              label: 'Generar Albarán',
              icon: <Copy size={14} />,
              onClick: () => onCopyToDelivery(item),
              separatorBefore: true,
            },
          ]
        : []),
      ...(canBeCancelled
        ? [
            {
              label: 'Anular pedido',
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-4 tracking-tighter">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-300 shadow-sm border border-blue-100 dark:border-blue-500/20">
              <FileDigit size={32} />
            </div>
            Pedidos de Compra
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium ml-1">
            Gestión de aprovisionamiento y órdenes a proveedores.
          </p>
          {doc.state.mastersError && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-200 text-xs font-bold animate-in slide-in-from-top">
              <AlertCircle size={16} />
              {doc.state.mastersError}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canWrite && onCreateFromClone && (
            <CloneDocumentActions docType="PO" onPaste={onCreateFromClone} show="paste" />
          )}
          <Button
            onClick={onCreate}
            disabled={!canWrite}
            className="flex items-center gap-2 h-12 px-6 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:grayscale"
          >
            <Plus size={20} /> Nuevo Pedido
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden" noPadding>
        <FilterBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
          onClear={clearFilters}
          config={[
            {
              key: 'partnerId',
              label: 'Proveedor',
              type: 'select',
              options: partners.map((p) => ({ label: p.name, value: p.id })),
            },
            {
              key: 'status',
              label: 'Estado',
              type: 'select',
              options: [
                { label: 'Abierto', value: 'O' },
                { label: 'Parcial', value: 'P' },
                { label: 'Cerrado', value: 'C' },
              ],
            },
            { key: 'date', label: 'Fecha', type: 'date' },
          ]}
          searchPlaceholder="Buscar pedido..."
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="PO"
          onClear={() => setSelectedKeys(new Set())}
          onSent={() => setSelectedKeys(new Set())}
        />
        {isMobile ? (
          <DocumentCardList
            data={filteredData || []}
            isLoading={loading}
            onClick={onDetail}
            emptyMessage="No hay pedidos."
            title={(item: any) => formatDocCode(item)}
            subtitle={(item: any) =>
              item.partnerName || partners.find((p) => p.id === item.partnerId)?.name || '...'
            }
            status={(item: any) => (
              <>
                {item.status === 'O' && <Badge variant="warning">Abierto</Badge>}
                {item.status === 'P' && <Badge variant="info">Parcial</Badge>}
                {item.status === 'C' && <Badge variant="success">Cerrado</Badge>}
                {item.status === 'X' && <Badge variant="error">Cancelado</Badge>}
              </>
            )}
            fields={[
              { label: 'Fecha', value: (item: any) => fmt.date(item.date) },
              {
                label: 'Total',
                value: (item: any) => (
                  <span className="font-black text-slate-900 dark:text-slate-100">
                    {fmt.money(item.total)}
                  </span>
                ),
              },
            ]}
            actions={(item: any) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleQuickPdf(item.id)}
                isLoading={downloadingId === item.id}
                className="h-8 gap-2 text-ink-500 dark:text-ink-400"
              >
                <Download size={14} /> PDF
              </Button>
            )}
          />
        ) : (
          <Table
            columns={ctxColumns}
            data={filteredData || []}
            isLoading={loading}
            onRowClick={onDetail}
            selectable
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          />
        )}
      </Card>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  );
};

// --- Sub-componente: VISTA DE FORMULARIO ---
const POForm: React.FC<{
  onBack: () => void;
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
}> = ({ onBack, onSubmit, state, setState, masters, actions, computations, extraState }) => {
  const fmt = useFormat();
  const itemUoms = useItemUoms();
  const isMobile = useIsMobile();
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);
  const { flags } = useTheme();
  const warehouseLocation = flags.warehouseLocation;
  const { token: authToken, user: authUser } = useAuth();
  const pluginLineFields = usePluginLineFields('PurchaseOrderLine');
  const [zones, setZones] = useState<any[]>([]);
  useEffect(() => {
    if (warehouseLocation !== 'line' || !authToken || !authUser?.tenantId) return;
    crudApi
      .list<any>('/api/zones')
      .then((d) => setZones(Array.isArray(d) ? d : []))
      .catch(() => setZones([]));
  }, [warehouseLocation, authToken, authUser?.tenantId]);
  const handlePartnerChange = (id: string) => {
    setState.setPartnerId(id);
    const p = masters.partners.find((x: any) => x.id === id);
    if (p && p.addresses) {
      const defBill =
        p.addresses.find((a: any) => a.type === 'B' && a.isDefault) ||
        p.addresses.find((a: any) => a.type === 'B') ||
        null;
      const defShip =
        p.addresses.find((a: any) => a.type === 'S' && a.isDefault) ||
        p.addresses.find((a: any) => a.type === 'S') ||
        null;
      const formatAddr = (a: any) =>
        a
          ? `${a.street || ''}\n${a.zipCode || ''} ${a.city || ''}\n${a.state ? a.state + '\n' : ''}${a.country || ''}`.trim()
          : '';
      extraState.setBillToAddress(formatAddr(defBill));
      extraState.setShipToAddress(formatAddr(defShip));
    }
  };

  const projectCol = useInternalOrderLineColumn(actions.updateLine);
  const columns = useMemo(() => {
    const base = buildFormLineColumns({
      kind: DocKind.Order,
      side: DocSide.Purchase,
      state,
      masters,
      zones,
      actions,
      onAssignBatch: setBatchEditingIdx,
      fmt,
      getItemUoms: itemUoms.get,
      warehouseLocation,
      pluginLineFields,
    });
    // El builder base ya trae su propia columna 'Proyecto' cuando hay
    // proyectos en masters — la quitamos para no duplicarla con projectCol.
    const rest = base.slice(0, -1).filter((c) => c.header !== 'Proyecto');
    return [...rest, projectCol, base[base.length - 1]];
  }, [
    state.lines,
    masters.items,
    masters.taxGroups,
    warehouseLocation,
    zones,
    pluginLineFields,
    projectCol,
  ]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white dark:hover:bg-slate-900 rounded-lg transition shadow-sm border"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Nuevo Pedido de Compra
          </h1>
        </div>
        <Button
          onClick={onSubmit}
          isLoading={state.isSubmitting}
          disabled={!!state.seriesError || !state.canWrite}
          className="px-8 flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
        >
          <Save size={18} /> Confirmar Pedido
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2 space-y-6 border-t-4 border-t-blue-500">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Proveedor / Acreedor *
              </label>
              <SearchableSelect
                value={state.partnerId}
                onChange={handlePartnerChange}
                options={masters.partners.map((p: any) => ({ label: p.name, value: p.id }))}
                placeholder="Seleccionar..."
              />
            </div>
            {warehouseLocation !== 'line' && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Almacén Destino *
                </label>
                <SearchableSelect
                  value={state.warehouseId}
                  onChange={setState.setWarehouseId}
                  options={masters.warehouses.map((w: any) => ({ label: w.name, value: w.id }))}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Dirección Facturación
              </label>
              <textarea
                value={extraState.billToAddress}
                onChange={(e) => extraState.setBillToAddress(e.target.value)}
                className="w-full h-20 border rounded-lg p-2 text-xs bg-slate-50 dark:bg-slate-800/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Dirección de Envío
              </label>
              <textarea
                value={extraState.shipToAddress}
                onChange={(e) => extraState.setShipToAddress(e.target.value)}
                className="w-full h-20 border rounded-lg p-2 text-xs bg-slate-50 dark:bg-slate-800/50"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 pt-2">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">
                Fec. Contabilización
              </label>
              <Input
                type="date"
                value={state.date}
                onChange={(e) => setState.setDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">
                Fec. Entrega Prevista
              </label>
              <Input
                type="date"
                value={extraState.deliveryDate}
                onChange={(e) => extraState.setDeliveryDate(e.target.value)}
                className="h-10 border-blue-100 dark:border-blue-500/20 bg-blue-50/20"
              />
            </div>
            <InternalOrderHeaderField
              value={extraState.internalOrderId}
              onChange={extraState.setInternalOrderId}
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 space-y-6 bg-slate-50/50 dark:bg-slate-800/50">
            <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest border-b pb-2">
              Control de Series
            </h4>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  Serie de Pedido *
                </label>
                <SearchableSelect
                  value={state.seriesId}
                  onChange={setState.setSeriesId}
                  options={masters.series.map((s: any) => ({ label: s.name, value: s.id }))}
                />
                {state.isManualSeries && (
                  <div className="mt-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      Número de documento (manual) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={state.manualNumber}
                      onChange={(e) => setState.setManualNumber(e.target.value)}
                      placeholder="Ej: 1050"
                      className="w-full h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                )}
                {state.seriesError && (
                  <p className="text-[10px] text-rose-500 font-bold mt-1">{state.seriesError}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  Periodo Contable *
                </label>
                <SearchableSelect
                  value={state.periodId}
                  onChange={setState.setPeriodId}
                  options={masters.periods.map((p: any) => ({ label: p.name, value: p.id }))}
                />
              </div>
            </div>
          </Card>
          <PluginFieldsPanel
            tableName="PurchaseOrder"
            values={state.pluginData}
            onChange={setState.setPluginField}
            disabled={state.isSubmitting}
            layout="sidebar"
          />
        </div>
      </div>

      {(() => {
        const p = masters.partners.find((x: any) => x.id === state.partnerId);
        const partnerRate = Number(p?.defaultWithholdingRate || 0);
        const docRate = Number(state.withholdingRate || 0);
        if (partnerRate > 0 && docRate === 0) {
          return (
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">
              <div className="flex items-start gap-3 min-w-0">
                <AlertCircle
                  size={18}
                  className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                    Este proveedor tiene retención IRPF por defecto del {partnerRate}%
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
                    El pedido se registrará sin retención. Si el proveedor es profesional sujeto a
                    IRPF, aplícala — tú eres el retenedor.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setState.setWithholdingRate(partnerRate)}
                className="shrink-0"
              >
                Aplicar {partnerRate}%
              </Button>
            </div>
          );
        }
        return null;
      })()}

      <DocumentFiscalPanel kind="purchase" state={state} setState={setState} collapsible />

      <Card className="shadow-lg overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        {isMobile ? (
          <MobileLineCards columns={columns} lines={state.lines || []} />
        ) : (
          <Table columns={columns} data={state.lines} />
        )}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center border-t border-slate-200 dark:border-slate-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.addLine()}
            className="text-blue-600 dark:text-blue-300 font-bold flex items-center gap-2"
          >
            <PlusSquare size={16} /> Añadir Línea de Pedido
          </Button>
          <div className="space-y-1 text-right min-w-[200px]">
            <div className="flex justify-between px-2">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
                Subtotal:
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {computations.subtotal.toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between px-2 text-amber-600 dark:text-amber-300">
              <span className="text-[10px] font-black uppercase">Impuestos:</span>
              <span className="font-bold">{computations.taxTotal.toFixed(2)} €</span>
            </div>
            {Number(computations.withholdingAmount) > 0 && (
              <div className="flex justify-between px-2 text-rose-600 dark:text-rose-400">
                <span className="text-[10px] font-black uppercase">Retención IRPF:</span>
                <span className="font-bold">
                  − {Number(computations.withholdingAmount).toFixed(2)} €
                </span>
              </div>
            )}
            <div className="flex justify-between px-2 pt-2 mt-1 border-t text-xl font-black text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase">Total Pedido:</span>
              <span>{computations.total.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
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
    [order.lines, masters.items, masters.taxGroups],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb="COMPRAS · PEDIDO"
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
              ? { label: 'Generar Albarán', icon: Copy, onClick: onCopyToDelivery }
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
        <Card
          className="md:col-span-2 border-slate-100 dark:border-slate-800"
          bodyClassName="p-6 space-y-5"
        >
          <div>
            <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] mb-2">
              Proveedor
            </h4>
            <p className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {partner?.name || '—'}
            </p>
            {partner?.nif && (
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5 font-mono">
                NIF: {partner.nif}
              </p>
            )}
          </div>
          {(order.billToAddress || order.shipToAddress) && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Facturar a
                </span>
                <pre className="text-[11px] font-sans text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-snug mt-1">
                  {order.billToAddress || '—'}
                </pre>
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Enviar a
                </span>
                <pre className="text-[11px] font-sans text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-snug mt-1">
                  {order.shipToAddress || '—'}
                </pre>
              </div>
            </div>
          )}
        </Card>

        <Card className="border-slate-100 dark:border-slate-800" bodyClassName="p-6 space-y-4">
          <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] border-b border-slate-100 dark:border-slate-800 pb-2">
            Información
          </h4>
          <dl className="space-y-2.5">
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Fecha
              </dt>
              <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {fmt.date(order.date)}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Entrega
              </dt>
              <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {order.deliveryDate ? fmt.date(order.deliveryDate) : '—'}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Líneas
              </dt>
              <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {order.lines?.length ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        {isMobile ? (
          <MobileLineCards columns={columns} lines={order.lines || []} />
        ) : (
          <Table columns={columns} data={order.lines || []} />
        )}
        <DocumentTotalsBlock
          subtotal={order.subtotal}
          tax={Number(order.total) - Number(order.subtotal)}
          total={order.total}
          totalLabel="Total Pedido"
        />
      </Card>

      <PluginFieldsPanel
        tableName="PurchaseOrder"
        values={order}
        onChange={() => {}}
        disabled
        layout="inline"
        title="Campos de plugin"
      />
      <AttachmentsPanel entityType="PurchaseOrder" entityId={order.id} />
    </DocumentDetailLayout>
  );
};

// --- COMPONENTE PRINCIPAL ---
export const PurchaseOrders: React.FC = () => {
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
      toast.error('Error al cargar pedidos');
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
            'Error de red al cargar el pedido',
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
      toast.success(`Pedido registrado nº ${data.docNum}`);
      notifyDocChange(DocType.PurchaseOrder);
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancelOrder = async (id: string) => {
    try {
      await docsApi.cancel('/api/purchases/orders', id);
      toast.success('Pedido cancelado');
      notifyDocChange(DocType.PurchaseOrder);
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  if (isCreate)
    return (
      <POForm
        onBack={() => currentTab.close()}
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
        <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
          Cargando pedido…
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
            title: `Albarán ← ${formatDocCode(selectedOrder)}`,
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
          title: `Albarán ← ${formatDocCode(order)}`,
        });
      }}
      onCancel={handleCancelOrder}
    />
  );
};
