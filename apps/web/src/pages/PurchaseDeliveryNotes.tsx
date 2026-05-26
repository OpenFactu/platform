import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
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
import { useAuth } from '../context/AuthContext';
import { useTabs, useCurrentTab } from '../context/TabsContext';
import {
  Truck,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  ShoppingCart,
  Copy,
  ClipboardList,
  FileText,
  AlertCircle,
  PlusSquare,
  FileDigit,
  Barcode,
  Download,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { InternalOrderHeaderField } from '../components/InternalOrderHeaderField';
import { InternalOrderChip } from '../components/InternalOrderChip';
import { useInternalOrderLineColumn } from '../hooks/useLineInternalOrderColumn';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { CloneDocumentActions } from '../components/common/CloneDocumentActions';
import { PreparationButton } from '../components/common/PreparationButton';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { TraceabilityButton } from '../components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import {
  buildDetailLineColumns,
  buildFormLineColumns,
  statusBadgeProps,
} from '../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '../utils/dataRefresh';
import { downloadPdf } from '../utils/downloadPdf';
import { useFormat } from '../hooks/useFormat';
import { useTheme } from '../context/ThemeContext';
import { BatchSelectionModal } from '../components/BatchSelectionModal';
import { BatchAssignmentPanel } from '../components/BatchAssignmentPanel';
import { useItemUoms } from '../hooks/useItemUoms';
import { usePluginLineFields } from '../hooks/usePluginLineFields';
import { PluginFieldsPanel } from '../components/PluginFieldsPanel';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '../hooks/useDocumentScanner';
import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';

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
  const { token, user } = useAuth();
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const toast = useToast();
  const fmt = useFormat();
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
      await downloadPdf(
        `/api/purchases/delivery-notes/${id}/pdf`,
        token || '',
        user?.tenantId || '',
      );
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
          label: 'Proveedor',
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
      sortAccessor: (item: any) =>
        `${item.seriesPrefix || ''}-${String(item.docNum || 0).padStart(6, '0')}`,
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 dark:text-slate-100 leading-none">
            {item.seriesPrefix}-{item.periodCode}-{String(item.docNum).padStart(6, '0')}
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
      header: 'Pedido Origen',
      accessor: (item: any) =>
        item.orderDocNum ? (
          <Badge variant="info" className="font-mono text-[10px] opacity-80">
            {item.orderPrefix}-{item.periodCode}-{String(item.orderDocNum).padStart(6, '0')}
          </Badge>
        ) : (
          <span className="text-[10px] text-slate-300 dark:text-slate-600 font-bold italic">
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
          {item.hasActiveShipment && <Badge variant="info">En recepción</Badge>}
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
          {item.status === 'O' && !item.hasActiveShipment && (
            <div onClick={(e) => e.stopPropagation()} className="inline-flex">
              <PreparationButton docType="PDN" docId={item.id} />
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
                  (tabs as any).openTab(path, { title: 'Recepción en curso' });
                } else {
                  window.location.href = path;
                }
              }}
              className="text-accent font-bold hover:bg-accent/10 gap-1 uppercase text-[10px]"
            >
              Ver recepción
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

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-4 tracking-tighter">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-300 shadow-sm border border-emerald-100 dark:border-emerald-500/20">
              <Truck size={32} />
            </div>
            Entradas (Albaranes)
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium ml-1">
            Registro físico de entrada de productos y trazabilidad.
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
            <CloneDocumentActions docType="PDN" onPaste={onCreateFromClone} show="paste" />
          )}
          <Button
            onClick={onCreate}
            disabled={!doc.state.canWrite}
            className="flex items-center gap-2 h-12 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:grayscale"
          >
            <Plus size={20} /> Registrar Nueva Entrada
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
          docType="PDN"
          onClear={() => setSelectedKeys(new Set())}
          onSent={() => setSelectedKeys(new Set())}
        />
        <Table
          columns={columns}
          data={filteredData || []}
          isLoading={loading}
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
  const { flags } = useTheme();
  const warehouseLocation = flags.warehouseLocation;
  const pluginLineFields = usePluginLineFields('PurchaseDeliveryNoteLine');

  const duplicateLine = (idx: number) => {
    const newLine = { ...state.lines[idx], batchDetails: [] };
    const newLines = [...state.lines];
    newLines.splice(idx + 1, 0, newLine);
    setState.setLines(newLines);
  };

  const filteredZones = zones.filter(
    (z) => !state.warehouseId || z.warehouseId === state.warehouseId,
  );

  const projectCol = useInternalOrderLineColumn(actions.updateLine);
  const columns = useMemo(() => {
    const base = buildFormLineColumns({
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
      fmt,
      getItemUoms: itemUoms.get,
      pluginLineFields,
    });
    return [...base.slice(0, -1), projectCol, base[base.length - 1]];
  }, [
    state.lines,
    masters.items,
    masters.taxGroups,
    pluginLineFields,
    warehouseLocation,
    zones,
    projectCol,
  ]);

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-600 transition-all shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tighter flex items-center gap-3">
              Registro de Entrada
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
              Documento de recepción de mercancía y control de stock.
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
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Proveedor *
              </label>
              <SearchableSelect
                value={state.partnerId}
                onChange={setState.setPartnerId}
                options={masters.partners.map((p: any) => ({ label: p.name, value: p.id }))}
                placeholder="Seleccionar proveedor..."
              />
            </div>
            {warehouseLocation !== 'line' && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Almacén de Entrada *
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
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
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
            <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest border-b pb-2">
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
            tableName="PurchaseDeliveryNote"
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
                    El albarán se registrará sin retención. Si el proveedor es profesional sujeto a
                    IRPF, aplícala.
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
        <Table columns={columns} data={state.lines || []} />
        <div className="p-6 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center border-t border-slate-200 dark:border-slate-700 gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-sm">
              <button
                onClick={() => Array(1).fill(0).forEach(actions.addLine)}
                className="h-8 min-w-[36px] px-2 rounded-lg text-[10px] font-black bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
              >
                +1
              </button>
              <button
                onClick={() => Array(5).fill(0).forEach(actions.addLine)}
                className="h-8 min-w-[36px] px-2 rounded-lg text-[10px] font-black bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
              >
                +5
              </button>
              <button
                onClick={() => Array(10).fill(0).forEach(actions.addLine)}
                className="h-8 min-w-[36px] px-2 rounded-lg text-[10px] font-black bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
              >
                +10
              </button>
            </div>
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
    </div>
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
  const fmt = useFormat();
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
    [pdn.lines, masters.items, masters.taxGroups],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb="COMPRAS · ALBARÁN"
      title={`${pdn.seriesPrefix}-${pdn.periodCode}-${String(pdn.docNum).padStart(6, '0')}`}
      status={statusBadgeProps(pdn.status, DocKind.DeliveryNote)}
      actions={
        <DocumentActionBar
          docType="PDN"
          pdfUrl={`/api/purchases/delivery-notes/${pdn.id}/pdf`}
          docId={pdn.id}
          docCode={`${pdn.seriesPrefix}-${pdn.periodCode}-${String(pdn.docNum).padStart(6, '0')}`}
          onCancel={() => onCancel(pdn.id)}
          showCancel={pdn.status === 'O'}
          primary={
            pdn.status === 'O'
              ? { label: 'Facturar', icon: Copy, onClick: onCopyToInvoice }
              : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <CloneDocumentActions docType="PDN" doc={pdn} show="copy" size={14} />
        <TraceabilityButton
          type="PDN"
          id={pdn.id}
          docCode={`${pdn.seriesPrefix}-${pdn.periodCode}-${String(pdn.docNum).padStart(6, '0')}`}
        />
        <InternalOrderChip internalOrderId={pdn.internalOrderId} />
        {pdn.status === 'O' && <PreparationButton docType="PDN" docId={pdn.id} />}
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
          {pdn.orderId && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/30 rounded-xl">
              <ShoppingCart size={14} className="text-blue-600 dark:text-blue-300 shrink-0" />
              <p className="text-xs font-bold text-blue-800 dark:text-blue-200 leading-tight">
                Desde pedido {pdn.orderPrefix}-{pdn.periodCode}-
                {String(pdn.orderDocNum).padStart(6, '0')}
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
                {fmt.date(pdn.date)}
              </dd>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Líneas
              </dt>
              <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {pdn.lines?.length ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={columns} data={pdn.lines || []} />
        <DocumentTotalsBlock
          subtotal={pdn.subtotal || 0}
          tax={pdn.taxTotal || 0}
          total={pdn.total || 0}
          totalLabel="Total Albarán"
        />
      </Card>

      <PluginFieldsPanel
        tableName="PurchaseDeliveryNote"
        values={pdn}
        onChange={() => {}}
        disabled
        layout="inline"
        title="Campos de plugin"
      />
      <AttachmentsPanel entityType="PurchaseDeliveryNote" entityId={pdn.id} />
    </DocumentDetailLayout>
  );
};

const formatDocCode = (d: any): string =>
  `${d.seriesPrefix}-${d.periodCode}-${String(d.docNum).padStart(6, '0')}`;

export const PurchaseDeliveryNotes: React.FC = () => {
  const { token, user } = useAuth();
  const { flags } = useTheme();
  const toast = useToast();
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
        const res = await fetch('/api/purchases/delivery-notes', { headers: authHeaders });
        const data = await res.json();
        const withCode = (Array.isArray(data) ? data : []).map((d: any) => ({
          ...d,
          docCode: `${d.seriesPrefix || ''}-${d.periodCode || ''}-${String(d.docNum || '').padStart(6, '0')}`,
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
        const res = await fetch(`/api/purchases/delivery-notes/${detailId}`, {
          headers: authHeaders,
        });
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
      toast.success(`Albarán registrado nº ${data.docNum}`);
      notifyDocChange(DocType.PurchaseDeliveryNote);
      currentTab.close();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCancel = async (id: string) => {
    const reason = window.prompt(
      'Motivo de la cancelación (opcional — se registra en auditoría y webhooks):',
      '',
    );
    if (reason === null) return;
    if (
      flags.confirmBeforeCancel &&
      !confirm('¿Cancelar el albarán? Si hay recepción en curso también se cancelará.')
    )
      return;
    const doCall = async (force: boolean) => {
      return fetch(`/api/purchases/delivery-notes/${id}/cancel`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null, force }),
      });
    };
    try {
      let res = await doCall(false);
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        if (err.requiresForce) {
          if (!confirm('Recepción en curso. ¿Cancelar de todos modos?')) return;
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
          ? 'Albarán y recepción cancelados. Stock revertido.'
          : 'Albarán cancelado y stock revertido.',
      );
      notifyDocChange(DocType.PurchaseDeliveryNote);
      currentTab.close();
    } catch (err: any) {
      toast.error(err.message);
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
        <PDNDetail
          pdn={selectedDelivery}
          onBack={() => currentTab.close()}
          onCancel={handleCancel}
          onCopyToInvoice={() => {
            localStorage.setItem('copy_pdn_source', JSON.stringify(selectedDelivery));
            openTab(`/purchases/invoices/new?copyFrom=${selectedDelivery.id}`, {
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
        fetch(`/api/purchases/delivery-notes/${p.id}`, { headers: authHeaders })
          .then((r) => r.json())
          .then((detail) => {
            localStorage.setItem('copy_pdn_source', JSON.stringify(detail));
            openTab(`/purchases/invoices/new?copyFrom=${p.id}`, {
              title: `Factura ← ${formatDocCode(p)}`,
            });
          });
      }}
    />
  );
};
