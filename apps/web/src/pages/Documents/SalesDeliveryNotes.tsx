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
import { useAuth } from '../../context/AuthContext';
import { useTabs, useCurrentTab } from '../../context/TabsContext';
import { useTheme } from '../../context/ThemeContext';
import { formatDocCode } from '../../utils/docCode';
import {
  Truck,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  Copy,
  PlusSquare,
  Barcode,
  ShoppingCart,
  AlertCircle,
  Download,
  Eye,
  PackageSearch,
} from 'lucide-react';
import { DocumentActionBar } from '../../components/DocumentActionBar';
import { InternalOrderHeaderField } from '../../components/InternalOrderHeaderField';
import { InternalOrderChip } from '../../components/InternalOrderChip';
import { useInternalOrderLineColumn } from '../../hooks/useLineInternalOrderColumn';
import { DocumentDetailLayout } from '../../components/DocumentDetailLayout';
import { AttachmentsPanel } from '../../components/AttachmentsPanel';
import { CloneDocumentActions } from '../../components/common/CloneDocumentActions';
import { PreparationButton } from '../../components/common/PreparationButton';
import { ContextMenu } from '../../components/common/ContextMenu';
import { withRowContextMenu } from '../../components/common/withRowContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import { DocumentFiscalPanel } from '../../components/documents/DocumentFiscalPanel';
import { TraceabilityButton } from '../../components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../../components/DocumentTotalsBlock';
import {
  buildDetailLineColumns,
  buildFormLineColumns,
  statusBadgeProps,
} from '../../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '../../utils/dataRefresh';
import { downloadPdf } from '../../utils/downloadPdf';
import { useFormat } from '../../hooks/useFormat';
import { BatchSelectionModal } from '../../components/BatchSelectionModal';
import { BatchAssignmentPanel } from '../../components/BatchAssignmentPanel';
import { useItemUoms } from '../../hooks/useItemUoms';
import { useZonesWithStock } from '../../hooks/useZonesWithStock';
import { usePluginLineFields } from '../../hooks/usePluginLineFields';
import { PluginFieldsPanel } from '../../components/PluginFieldsPanel';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '../../hooks/useDocumentScanner';
import { BulkSendToolbar } from '../../components/documents/BulkSendToolbar';

// --- Sub-componente: VISTA DE LISTADO ---
const SDNList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onCreateFromClone?: (payload: { header: any; lines: any[] }) => void;
  onDetail: (sdn: any) => void;
  onCopyToInvoice: (sdn: any) => void;
  doc: any;
}> = ({ data, loading, partners, onCreate, onCreateFromClone, onDetail, onCopyToInvoice, doc }) => {
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
      await downloadPdf(`/api/sales/delivery-notes/${id}/pdf`, token || '', user?.tenantId || '');
    } catch (e: any) {
      toast.error(e.message || 'Error al descargar PDF');
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
          label: 'Cliente',
          options: partners.map((p) => ({ label: p.name, value: p.id })),
        },
        {
          key: 'status',
          type: 'select',
          label: 'Estado',
          options: [
            { label: 'Abierto', value: 'O' },
            { label: 'Facturado', value: 'C' },
            { label: 'Cancelado', value: 'X' },
          ],
        },
        { key: 'date', type: 'date', label: 'Fecha' },
      ],
    });

  const columns = [
    {
      header: 'No. Albarán',
      sortable: true,
      sortAccessor: (item: any) => formatDocCode(item),
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 dark:text-slate-100 leading-none">
            {formatDocCode(item)}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono mt-1">
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
      header: 'Cliente',
      sortable: true,
      sortAccessor: (item: any) => item.partnerName || '',
      accessor: (item: any) =>
        item.partnerName || partners.find((p) => p.id === item.partnerId)?.name || '...',
    },
    {
      header: 'Pedido Origen',
      accessor: (item: any) =>
        item.orderDocNum ? (
          <Badge variant="info" className="font-mono text-[10px] opacity-80">
            {item.orderPrefix}-{item.periodCode}-{String(item.orderDocNum).padStart(6, '0')}
          </Badge>
        ) : (
          <span className="text-[10px] text-slate-300 dark:text-slate-300 font-bold italic">
            Directo
          </span>
        ),
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
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.status === 'O' && <Badge variant="warning">Abierto</Badge>}
          {item.status === 'C' && <Badge variant="success">Facturado</Badge>}
          {item.status === 'X' && <Badge variant="error">Cancelado</Badge>}
          {item.hasActiveShipment && item.activeShipmentStatus === 'delivered' && (
            <Badge variant="success">Entregado</Badge>
          )}
          {item.hasActiveShipment && item.activeShipmentStatus !== 'delivered' && (
            <Badge variant="info">En preparación</Badge>
          )}
        </div>
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
          {item.status === 'O' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCopyToInvoice(item);
              }}
              className="text-blue-600 dark:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-500/10 gap-1 uppercase text-[10px]"
            >
              <Copy size={12} /> Facturar
            </Button>
          )}
          {item.status === 'O' && !item.hasActiveShipment && flags.logisticsEnabled && (
            <div onClick={(e) => e.stopPropagation()} className="inline-flex">
              <PreparationButton docType="SDN" docId={item.id} compact />
            </div>
          )}
          {item.hasActiveShipment && item.activeShipmentId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                const path = `/logistics/shipments/${item.activeShipmentId}`;
                if (tabs && (tabs as any).openTab) {
                  (tabs as any).openTab(path, { title: 'Envío en preparación' });
                } else {
                  window.location.href = path;
                }
              }}
              className="text-accent font-bold hover:bg-accent/10 gap-1 uppercase text-[10px]"
            >
              Ver preparación
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDetail(item);
            }}
          >
            Ver
          </Button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (item: any) => [
    { label: 'Ver Albarán', icon: <Eye size={14} />, onClick: () => onDetail(item) },
    {
      label: 'Descargar PDF',
      icon: <Download size={14} />,
      onClick: () => handleQuickPdf(item.id),
    },
    ...(item.status === 'O'
      ? [
          {
            label: 'Facturar',
            icon: <Copy size={14} />,
            onClick: () => onCopyToInvoice(item),
            separatorBefore: true,
          },
        ]
      : []),
    ...(item.hasActiveShipment && item.activeShipmentId
      ? [
          {
            label: 'Ver preparación',
            icon: <PackageSearch size={14} />,
            onClick: () => {
              const path = `/logistics/shipments/${item.activeShipmentId}`;
              if (tabs && (tabs as any).openTab) {
                (tabs as any).openTab(path, { title: 'Envío en preparación' });
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-4 tracking-tighter">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-300 shadow-sm border border-emerald-100 dark:border-emerald-500/20">
              <Truck size={32} />
            </div>
            Salidas (Albaranes)
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium ml-1">
            Registro físico de salida de productos y control de expedición.
          </p>
          {doc.state.mastersError && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-200 text-xs font-bold animate-in slide-in-from-top">
              <AlertCircle size={16} />
              {doc.state.mastersError}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {doc.state.canWrite && onCreateFromClone && (
            <CloneDocumentActions docType="SDN" onPaste={onCreateFromClone} show="paste" />
          )}
          <Button
            onClick={onCreate}
            disabled={!doc.state.canWrite}
            className="flex items-center gap-2 h-12 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:grayscale"
          >
            <Plus size={20} /> Registrar Nueva Salida
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
              label: 'Cliente',
              type: 'select',
              options: partners.map((p) => ({ label: p.name, value: p.id })),
            },
            {
              key: 'status',
              label: 'Estado',
              type: 'select',
              options: [
                { label: 'Abierto', value: 'O' },
                { label: 'Facturado', value: 'C' },
                { label: 'Cancelado', value: 'X' },
              ],
            },
            { key: 'date', label: 'Fecha', type: 'date' },
          ]}
          searchPlaceholder="Buscar albarán..."
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="SDN"
          onClear={() => setSelectedKeys(new Set())}
          onSent={() => setSelectedKeys(new Set())}
        />
        <Table
          columns={ctxColumns}
          data={filteredData || []}
          isLoading={loading}
          onRowClick={onDetail}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
        />
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
const SDNForm: React.FC<{
  onBack: () => void;
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
  onBack,
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
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);
  const fmt = useFormat();
  const itemUoms = useItemUoms();
  const zonesWithStock = useZonesWithStock();
  const { flags } = useTheme();
  const warehouseLocation = flags.warehouseLocation;
  const pluginLineFields = usePluginLineFields('SalesDeliveryNoteLine');

  const filteredZones = zones.filter(
    (z) => !state.warehouseId || z.warehouseId === state.warehouseId,
  );

  const projectCol = useInternalOrderLineColumn(actions.updateLine);
  const columns = useMemo(() => {
    const base = buildFormLineColumns({
      kind: DocKind.DeliveryNote,
      side: DocSide.Sale,
      state,
      masters,
      zones: warehouseLocation === 'line' ? zones : filteredZones,
      actions,
      onAssignBatch: setBatchEditingIdx,
      onViewBatch: setViewingBatch,
      fmt,
      getItemUoms: itemUoms.get,
      warehouseLocation,
      pluginLineFields,
      getAvailableZones: zonesWithStock.get,
    });
    return [...base.slice(0, -1), projectCol, base[base.length - 1]];
  }, [
    state.lines,
    state.warehouseId,
    masters.items,
    masters.taxGroups,
    warehouseLocation,
    zones,
    pluginLineFields,
    projectCol,
  ]);

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-600 transition-all shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tighter flex items-center gap-3">
              Registro de Salida
              {orderId && (
                <Badge
                  variant="info"
                  className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-500/20 italic"
                >
                  De Pedido
                </Badge>
              )}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium ml-1 flex items-center gap-2">
              <PlusSquare size={14} className="text-emerald-500" />
              Documento de expedición y control de stock de salida.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={onSubmit}
            isLoading={state.isSubmitting}
            disabled={!!state.seriesError}
            className="flex items-center gap-2 h-12 px-8"
          >
            <Save size={20} /> Registrar Albarán
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2 space-y-6 border-t-4 border-t-emerald-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">
                Cliente *
              </label>
              <SearchableSelect
                value={state.partnerId}
                onChange={setState.setPartnerId}
                options={masters.partners.map((p: any) => ({ label: p.name, value: p.id }))}
                placeholder="Seleccionar cliente..."
              />
            </div>
            {warehouseLocation !== 'line' && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">
                  Almacén de Salida *
                </label>
                <SearchableSelect
                  value={state.warehouseId}
                  onChange={setState.setWarehouseId}
                  options={masters.warehouses.map((w: any) => ({ label: w.name, value: w.id }))}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">
                Fecha Albarán *
              </label>
              <Input
                type="date"
                value={state.date}
                onChange={(e) => setState.setDate(e.target.value)}
                className="font-bold h-10"
              />
            </div>
            <InternalOrderHeaderField value={internalOrderId} onChange={setInternalOrderId} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 space-y-6 bg-slate-50/50 dark:bg-slate-800/50">
            <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 tracking-widest border-b pb-2">
              Logística y Series
            </h4>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  Serie de Albarán *
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
            tableName="SalesDeliveryNote"
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
                    Este cliente tiene retención IRPF por defecto del {partnerRate}%
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
                    El albarán se emitirá sin retención. Si aplica, aplícala aquí para que herede a
                    la factura.
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

      <DocumentFiscalPanel kind="sales" state={state} setState={setState} collapsible />

      <Card className="shadow-lg overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={columns} data={state.lines || []} />
        <div className="p-6 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center border-t border-slate-200 dark:border-slate-700 gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => actions.addLine()}
              className="text-emerald-600 dark:text-emerald-300 font-bold flex items-center gap-2 h-10 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <PlusSquare size={16} /> Añadir Línea Libre
            </Button>
          </div>
          <div className="flex flex-col items-end min-w-[240px] space-y-2 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="flex justify-between w-full text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              <span>Base Imponible:</span>
              <span className="text-slate-600 dark:text-slate-300">
                {computations.subtotal.toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between w-full text-[10px] font-black text-blue-500 dark:text-blue-300 uppercase tracking-widest px-1">
              <span>Cuota IVA:</span>
              <span>{computations.taxTotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between w-full pt-3 mt-1 border-t items-baseline px-1 border-slate-50">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-widest">
                Total Albarán:
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tighter ml-4">
                {computations.total.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      </Card>

      <BatchAssignmentPanel
        isOpen={batchEditingIdx !== null}
        onClose={() => setBatchEditingIdx(null)}
        lines={state.lines}
        masters={masters}
        zones={zones}
        warehouseId={state.warehouseId}
        warehouseLocation={warehouseLocation}
        initialLineIdx={batchEditingIdx}
        isSale={true}
        onSave={(updates) => {
          const nextLines = [...state.lines];
          const extraLines: any[] = [];
          for (const u of updates) {
            const base = nextLines[u.idx];
            if (!base) continue;
            // Agrupamos batchDetails por zoneId
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
              // Primer grupo → mantiene la línea original con su cantidad recalculada
              const [firstZone, firstBatches] = groupArr[0];
              const firstQty = firstBatches.reduce((a, b) => a + Number(b.quantity || 0), 0);
              nextLines[u.idx] = {
                ...base,
                zoneId: firstZone || base.zoneId,
                quantity: firstQty,
                batchDetails: firstBatches,
              };
              // Grupos adicionales → nuevas sub-líneas clon
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
    </div>
  );
};

// --- Sub-componente: VISTA DE DETALLE ---
const SDNDetail: React.FC<{
  sdn: any;
  onBack: () => void;
  onCancel: (id: string) => void;
  onCopyToInvoice: () => void;
  masters: any;
  zones: any[];
  setViewingBatch: (l: any) => void;
}> = ({ sdn, onBack, onCancel, onCopyToInvoice, masters, zones, setViewingBatch }) => {
  const fmt = useFormat();
  const { flags } = useTheme();
  const tabs = useTabs();
  const partner = masters.partners.find((p: any) => p.id === sdn.partnerId);

  const columns = useMemo(
    () =>
      buildDetailLineColumns({
        kind: DocKind.DeliveryNote,
        side: DocSide.Sale,
        masters,
        zones,
        onViewBatch: setViewingBatch,
        fmt,
      }),
    [sdn.lines, masters.items, masters.taxGroups],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb="VENTAS · ALBARÁN"
      title={formatDocCode(sdn)}
      status={statusBadgeProps(sdn.status, DocKind.DeliveryNote)}
      actions={
        <DocumentActionBar
          docType="SDN"
          pdfUrl={`/api/sales/delivery-notes/${sdn.id}/pdf`}
          docId={sdn.id}
          docCode={formatDocCode(sdn)}
          onCancel={() => onCancel(sdn.id)}
          showCancel={sdn.status === 'O'}
          primary={
            sdn.status === 'O'
              ? { label: 'Facturar', icon: Copy, onClick: onCopyToInvoice }
              : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <CloneDocumentActions docType="SDN" doc={sdn} show="copy" size={14} />
        <TraceabilityButton
          type="SDN"
          id={sdn.id}
          docCode={formatDocCode(sdn)}
        />
        <InternalOrderChip internalOrderId={sdn.internalOrderId} />
        {sdn.status === 'O' && !sdn.hasActiveShipment && flags.logisticsEnabled && (
          <PreparationButton docType="SDN" docId={sdn.id} />
        )}
        {sdn.hasActiveShipment && sdn.activeShipmentId && (
          <Button
            variant="secondary"
            onClick={() => {
              const path = `/logistics/shipments/${sdn.activeShipmentId}`;
              if (tabs && (tabs as any).openTab) {
                (tabs as any).openTab(path, { title: 'Envío en preparación' });
              } else {
                window.location.href = path;
              }
            }}
          >
            Ver preparación
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className="md:col-span-2 border-slate-100 dark:border-slate-800"
          bodyClassName="p-6 space-y-5"
        >
          <div>
            <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] mb-2">
              Cliente
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
          {sdn.orderId && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/30 rounded-xl">
              <ShoppingCart size={14} className="text-blue-600 dark:text-blue-300 shrink-0" />
              <p className="text-xs font-bold text-blue-800 dark:text-blue-200 leading-tight">
                Desde pedido {sdn.orderPrefix}-{sdn.periodCode}-
                {String(sdn.orderDocNum).padStart(6, '0')}
              </p>
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
                {fmt.date(sdn.date)}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Líneas
              </dt>
              <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {sdn.lines?.length ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={columns} data={sdn.lines || []} />
        <DocumentTotalsBlock
          subtotal={sdn.subtotal}
          tax={sdn.taxTotal}
          total={sdn.total}
          totalLabel="Total Albarán"
        />
      </Card>

      <PluginFieldsPanel
        tableName="SalesDeliveryNote"
        values={sdn}
        onChange={() => {}}
        disabled
        layout="inline"
        title="Campos de plugin"
      />
      <AttachmentsPanel entityType="SalesDeliveryNote" entityId={sdn.id} />
    </DocumentDetailLayout>
  );
};


export const SalesDeliveryNotes: React.FC = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const params = useParams();
  const toast = useToast();
  const { openTab } = useTabs();
  const currentTab = useCurrentTab();

  const detailId = params.id;
  const isCreate = location.pathname.endsWith('/new');
  const isDetail = !!detailId;
  const isList = !isCreate && !isDetail;

  const dataVersion = useDataVersion(DocType.SalesDeliveryNote);
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
    docType: DocType.SalesDeliveryNote,
    apiEndpoint: '/api/sales/delivery-notes',
    permissions: user?.permissions?.['/sales/delivery-notes'],
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
        const res = await fetch('/api/zones', { headers: authHeaders });
        const data = await res.json();
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
        const res = await fetch('/api/sales/delivery-notes', { headers: authHeaders });
        const data = await res.json();
        const withCode = (Array.isArray(data) ? data : []).map((d: any) => ({
          ...d,
          docCode: formatDocCode(d),
          partnerName: d.partnerName || '',
        }));
        setDeliveries(withCode);
      } catch {
        toast.error('Error al cargar albaranes');
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
        const res = await fetch(`/api/sales/delivery-notes/${detailId}`, { headers: authHeaders });
        if (!res.ok) throw new Error('No encontrado');
        const data = await res.json();
        setSelectedDelivery(data);
        currentTab.rename(formatDocCode(data));
      } catch (e: any) {
        toast.error(e.message || 'Error al cargar el albarán');
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [isDetail, detailId, user?.tenantId, dataVersion]);

  // Clone from clipboard
  useEffect(() => {
    if (!isCreate) return;
    const raw = sessionStorage.getItem('keirost:cloneInvoice:SDN');
    if (!raw) return;
    sessionStorage.removeItem('keirost:cloneInvoice:SDN');
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

  // Copy-from: /sales/delivery-notes/new?copyFrom=<id>
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
          quantity: Number(l.orderedQty) - Number(l.deliveredQty),
          price: l.price,
          taxGroupId: l.taxGroupId,
          warehouseId: l.warehouseId || order.warehouseId,
          zoneId: l.zoneId || '',
          baseLine: l.lineNum,
          lineNum: l.lineNum,
          uomId: l.uomId,
          uomFactor: l.uomFactor != null ? Number(l.uomFactor) : undefined,
          // Desglose fiscal heredado del pedido.
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
      toast.success(`Albarán registrado nº ${data.docNum}`);
      notifyDocChange(DocType.SalesDeliveryNote);
      currentTab.close();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCancel = async (id: string) => {
    const reason = window.prompt(
      'Motivo de la cancelación (opcional — quedará registrado en auditoría y se enviará en emails/webhooks):',
      '',
    );
    if (reason === null) return;
    if (
      !confirm(
        '¿Cancelar el albarán? Se devolverá el stock, se reabrirá el pedido origen y, si hay envío en curso, también se cancelará.',
      )
    )
      return;
    const doCall = async (force: boolean) => {
      const res = await fetch(`/api/sales/delivery-notes/${id}/cancel`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null, force }),
      });
      return res;
    };
    try {
      let res = await doCall(false);
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        if (err.requiresForce) {
          // Envío ya en ruta — pedir confirmación explícita antes de forzar.
          if (
            !confirm(
              'El envío está en ruta. El conductor tendrá que volver sin entregar.\n\n¿Cancelar de todos modos?',
            )
          )
            return;
          res = await doCall(true);
        } else {
          toast.error(err.error || 'No se puede cancelar');
          return;
        }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al cancelar');
      }
      const d = await res.json().catch(() => ({}));
      toast.success(
        d.shipmentCancelled
          ? 'Albarán y envío cancelados. Stock revertido.'
          : 'Albarán cancelado y stock revertido.',
      );
      notifyDocChange(DocType.SalesDeliveryNote);
      currentTab.close();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isCreate) {
    return (
      <>
        <SDNForm
          onBack={() => currentTab.close()}
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
        <SDNDetail
          sdn={selectedDelivery}
          onBack={() => currentTab.close()}
          onCancel={handleCancel}
          onCopyToInvoice={() => {
            localStorage.setItem('copy_pdn_source', JSON.stringify(selectedDelivery));
            openTab(`/sales/invoices/new?copyFrom=${selectedDelivery.id}`, {
              title: `Factura ← ${formatDocCode(selectedDelivery)}`,
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
    <SDNList
      doc={doc}
      data={deliveries}
      loading={loading}
      partners={doc.masters.partners}
      onCreate={() => openTab('/sales/delivery-notes/new')}
      onCreateFromClone={(payload) => {
        sessionStorage.setItem('keirost:cloneInvoice:SDN', JSON.stringify(payload));
        openTab('/sales/delivery-notes/new');
      }}
      onDetail={(p) => openTab(`/sales/delivery-notes/${p.id}`, { title: formatDocCode(p) })}
      onCopyToInvoice={(p) => {
        fetch(`/api/sales/delivery-notes/${p.id}`, { headers: authHeaders })
          .then((r) => r.json())
          .then((detail) => {
            localStorage.setItem('copy_pdn_source', JSON.stringify(detail));
            openTab(`/sales/invoices/new?copyFrom=${p.id}`, {
              title: `Factura ← ${formatDocCode(p)}`,
            });
          });
      }}
    />
  );
};
