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
  cn,
} from '@openfactu/ui';
import { useAuth } from '../context/AuthContext';
import { CloneDocumentActions } from '../components/common/CloneDocumentActions';
import { useTabs, useCurrentTab } from '../context/TabsContext';
import {
  FileStack,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  FileText,
  Copy,
  PlusSquare,
  Barcode,
  AlertCircle,
  Download,
  CreditCard,
  Mail,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { TraceabilityButton } from '../components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import {
  buildDetailLineColumns,
  buildFormLineColumns,
  findFirstIncompleteBatchLine,
  statusBadgeProps,
} from '../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '../utils/dataRefresh';
import { downloadPdf } from '../utils/downloadPdf';
import { useFormat } from '../hooks/useFormat';
import { BatchSelectionModal } from '../components/BatchSelectionModal';
import { BatchAssignmentPanel } from '../components/BatchAssignmentPanel';
import { PluginFieldsPanel } from '../components/PluginFieldsPanel';
import { useItemUoms } from '../hooks/useItemUoms';
import { usePluginLineFields } from '../hooks/usePluginLineFields';
import { usePluginListColumns } from '../components/plugin-fields';
import { useDocument, useDataTable, DocType, DocKind, DocSide } from '@openfactu/common';
import { useDocumentScanner } from '../hooks/useDocumentScanner';
import { InternalOrderHeaderField } from '../components/InternalOrderHeaderField';
import { InternalOrderChip } from '../components/InternalOrderChip';
import { useInternalOrderLineColumn } from '../hooks/useLineInternalOrderColumn';
import { PaymentStatusBadge } from '../components/payments/PaymentStatusBadge';
import { RegisterPaymentModal } from '../components/payments/RegisterPaymentModal';
import { DocumentFiscalPanel } from '../components/documents/DocumentFiscalPanel';
import { SendInvoiceModal } from '../components/documents/SendInvoiceModal';
import { InvoicePaymentsList } from '../components/payments/InvoicePaymentsList';
import { BulkSendToolbar } from '../components/documents/BulkSendToolbar';

// --- Sub-componente: VISTA DE LISTADO ---
const InvoiceList: React.FC<{
  data: any[];
  loading: boolean;
  partners: any[];
  onCreate: () => void;
  onCreateFromClone?: (payload: { header: any; lines: any[] }) => void;
  onDetail: (inv: any) => void;
  canWrite?: boolean;
  doc: any;
}> = ({ data, loading, partners, onCreate, onCreateFromClone, onDetail, canWrite, doc }) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const fmt = useFormat();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`/api/sales/invoices/${id}/pdf`, token || '', user?.tenantId || '');
    } catch (e: any) {
      toast.error(e.message || 'Error al descargar PDF');
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
          label: 'Cliente',
          options: partners.map((p) => ({ label: p.name, value: p.id })),
        },
        {
          key: 'status',
          type: 'select',
          label: 'Estado',
          options: [
            { label: 'Borrador', value: 'D' },
            { label: 'Asentado', value: 'O' },
            { label: 'Cancelado', value: 'X' },
          ],
        },
        { key: 'date', type: 'date', label: 'Fecha' },
      ],
    });

  const columns = [
    {
      header: 'Documento',
      sortable: true,
      sortAccessor: (item: any) => item.docCode || '',
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 dark:text-slate-100 leading-none">
            {item.seriesPrefix}-{item.periodCode}-{String(item.docNum).padStart(6, '0')}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1 uppercase tracking-tighter">
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
      accessor: (item: any) => (
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200 leading-tight">
            {item.partnerName}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mt-1">
            CIE: {item.partnerId.substring(0, 6)}
          </p>
        </div>
      ),
    },
    {
      header: 'Desde Albarán',
      sortable: true,
      sortAccessor: (item: any) => item.baseDocCode || '',
      cell: (item: any) =>
        item.baseDocCode ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/30 text-[10px] font-black text-indigo-700 dark:text-indigo-200 uppercase tracking-tight">
            <FileText size={11} /> {item.baseDocCode}
          </span>
        ) : (
          <span className="text-[10px] text-slate-300 dark:text-slate-600 font-bold italic">
            Directa
          </span>
        ),
    },
    {
      header: 'Retención',
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
          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
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
      cell: (item: any) => {
        if (item.status === 'D') return <Badge variant="warning">Borrador</Badge>;
        if (item.status === 'O') return <Badge variant="success">Asentado</Badge>;
        if (item.status === 'X') return <Badge variant="error">Cancelado</Badge>;
        return <Badge variant="neutral">{item.status}</Badge>;
      },
    },
    {
      header: 'Cobro',
      align: 'center' as const,
      sortable: true,
      sortAccessor: (item: any) => item.paymentStatus || 'pending',
      cell: (item: any) => (
        <PaymentStatusBadge status={item.paymentStatus} isLocked={item.isLocked} compact />
      ),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (item: any) => (
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
      ),
    },
  ];

  const pluginCols = usePluginListColumns('SalesInvoice', { fmt });
  const actionsCol = columns[columns.length - 1];
  const restCols = columns.slice(0, -1);
  const allColumns = [...restCols, ...pluginCols, actionsCol];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-4 tracking-tighter">
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-300 shadow-sm border border-amber-100 dark:border-amber-500/20">
              <FileStack size={32} />
            </div>
            Facturas de Venta
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium ml-1">
            Emisión de facturas a clientes y contabilidad de ingresos.
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
            <CloneDocumentActions docType="SINV" onPaste={onCreateFromClone} show="paste" />
          )}
          <Button
            onClick={onCreate}
            disabled={!canWrite}
            className="flex items-center gap-2 h-12 px-6 disabled:opacity-50"
          >
            <Plus size={20} /> Nueva Factura Directa
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
                { label: 'Asentado', value: 'O' },
                { label: 'Cancelado', value: 'X' },
              ],
            },
            { key: 'date', label: 'Fecha', type: 'date' },
          ]}
          searchPlaceholder="Buscar por factura..."
        />
        <BulkSendToolbar
          selectedKeys={selectedKeys}
          rows={filteredData || []}
          partners={partners}
          docType="SINV"
          onClear={() => setSelectedKeys(new Set())}
          onSent={() => setSelectedKeys(new Set())}
        />
        <Table
          columns={allColumns}
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
}> = ({ onBack, onSubmit, state, setState, masters, actions, computations, setViewingBatch, internalOrderId, setInternalOrderId }) => {
  const [batchEditingIdx, setBatchEditingIdx] = useState<number | null>(null);
  const fmt = useFormat();
  const toast = useToast();
  const itemUoms = useItemUoms();

  const handleFormSubmit = () => {
    const incomplete = findFirstIncompleteBatchLine(state.lines, masters);
    if (incomplete !== null) {
      toast.error('Hay líneas con trazabilidad pendiente — asigna los lotes antes de guardar.');
      setBatchEditingIdx(incomplete);
      return;
    }
    onSubmit();
  };

  // Autocompletar IRPF del cliente en silencio cuando cambie el partner y el
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

  const pluginLineFields = usePluginLineFields('SalesInvoiceLine');
  const projectCol = useInternalOrderLineColumn(actions.updateLine);
  const columns = useMemo(
    () => {
      const base = buildFormLineColumns({
        kind: DocKind.Invoice,
        side: DocSide.Sale,
        state,
        masters,
        actions,
        onAssignBatch: setBatchEditingIdx,
        onViewBatch: setViewingBatch,
        fmt,
        getItemUoms: itemUoms.get,
        pluginLineFields,
      });
      return [...base.slice(0, -1), projectCol, base[base.length - 1]];
    },
    [state.lines, masters.items, masters.taxGroups, pluginLineFields, projectCol],
  );

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
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter flex items-center gap-3">
              {state.lines.some((l: any) => l.baseId)
                ? 'Facturación de Albarán'
                : 'Nueva Factura Directa'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium ml-1 flex items-center gap-2">
              <FileText size={14} className="text-amber-500" />
              Ingreso de venta y contabilización de impuestos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => onSubmit()}
            isLoading={state.isSubmitting}
            disabled={!!state.seriesError || !state.canWrite}
            className="flex items-center gap-2 h-12 px-8 focus:ring-4 ring-blue-500/10 transition-all disabled:opacity-50"
          >
            <Save size={20} /> Asentar Factura
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2 space-y-6 border-slate-100 dark:border-slate-800">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-baseline gap-4">
            <h3 className="font-black text-slate-700 dark:text-slate-200 uppercase text-[11px] tracking-[0.15em] leading-none">
              Cabecera de Factura
            </h3>
            <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider leading-none">
              * Campos obligatorios
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Cliente *
              </label>
              <SearchableSelect
                value={state.partnerId}
                onChange={setState.setPartnerId}
                options={masters.partners.map((p: any) => ({ label: p.name, value: p.id }))}
                placeholder="Seleccionar cliente..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Fecha Factura *
              </label>
              <Input
                type="date"
                value={state.date}
                onChange={(e) => setState.setDate(e.target.value)}
                className="font-bold text-slate-700 dark:text-slate-200 h-10 border-slate-200 dark:border-slate-700"
              />
            </div>
            <InternalOrderHeaderField
              value={internalOrderId}
              onChange={setInternalOrderId}
            />
          </div>
        </Card>

        {/* Panel fiscal y pago — campos nuevos (mig 032) */}
        <DocumentFiscalPanel kind="sales" state={state} setState={setState} />

        <div className="space-y-6">
          <Card className="p-6 space-y-6 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest border-b pb-2">
              Series y Periodo
            </h4>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                Serie de Numeración *
              </label>
              <SearchableSelect
                value={state.seriesId}
                onChange={setState.setSeriesId}
                options={masters.series.map((s: any) => ({ label: s.name, value: s.id }))}
              />
              {state.seriesError && (
                <p className="text-[10px] text-rose-500 font-bold mt-1 italic">
                  {state.seriesError}
                </p>
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
            tableName="SalesInvoice"
            values={state.pluginData}
            onChange={setState.setPluginField}
            disabled={state.isSubmitting}
            layout="sidebar"
          />
        </div>
      </div>

      <Card className="shadow-lg overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table
          columns={columns}
          data={state.lines || []}
          emptyMessage="No hay líneas en la factura."
        />
        <div className="p-6 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center border-t border-slate-100 dark:border-slate-800 gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => actions.addLine()}
              className="text-amber-600 dark:text-amber-300 font-bold flex items-center gap-2 h-10 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
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
            <div className="flex justify-between w-full text-[10px] font-black text-amber-500 uppercase tracking-widest px-1">
              <span>Cuota IVA:</span>
              <span>{computations.taxTotal.toFixed(2)} €</span>
            </div>
            {Number(computations.withholdingAmount) > 0 && (
              <div className="flex justify-between w-full text-[10px] font-black text-rose-500 uppercase tracking-widest px-1">
                <span>Retención IRPF:</span>
                <span>− {Number(computations.withholdingAmount).toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between w-full pt-3 mt-1 border-t items-baseline px-1 border-slate-50">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-widest">
                Total Factura:
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
        initialLineIdx={batchEditingIdx}
        isSale={true}
        onSave={(updates) => {
          updates.forEach((u) => actions.updateLine(u.idx, 'batchDetails', u.batchDetails));
        }}
      />
    </div>
  );
};

// --- Sub-componente: VISTA DE DETALLE ---
const InvoiceDetail: React.FC<{
  invoice: any;
  onBack: () => void;
  onCancel: () => void;
  onPost?: () => void;
  isPosting?: boolean;
  canDelete: boolean;
  isCancelling: boolean;
  masters: any;
  setViewingBatch: (l: any) => void;
}> = ({ invoice, onBack, onCancel, onPost, isPosting, canDelete, isCancelling, masters, setViewingBatch }) => {
  const fmt = useFormat();
  const partner = masters.partners.find((p: any) => p.id === invoice.partnerId);
  const series = masters.series?.find((s: any) => s.id === invoice.seriesId);
  const period = masters.periods?.find((p: any) => p.id === invoice.periodId);

  // Catálogos para pintar nombres de tipo doc / método / plazo.
  const { token, user } = useAuth();
  const [docTypes, setDocTypes] = React.useState<any[]>([]);
  const [payMethods, setPayMethods] = React.useState<any[]>([]);
  const [payTerms, setPayTerms] = React.useState<any[]>([]);
  React.useEffect(() => {
    const h = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };
    Promise.all([
      fetch('/api/document-types', { headers: h }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/payment-methods', { headers: h }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/payment-terms', { headers: h }).then((r) => (r.ok ? r.json() : [])),
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
  const docCode = `${invoice.seriesPrefix}-${invoice.periodCode}-${String(invoice.docNum).padStart(6, '0')}`;

  const pluginLineFields = usePluginLineFields('SalesInvoiceLine');
  const columns = useMemo(
    () => buildDetailLineColumns({
      kind: DocKind.Invoice,
      side: DocSide.Sale,
      masters,
      onViewBatch: setViewingBatch,
      fmt,
      pluginLineFields,
    }),
    [invoice.lines, masters.items, masters.taxGroups, pluginLineFields],
  );

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb="VENTAS · FACTURA"
      title={`${invoice.seriesPrefix}-${invoice.periodCode}-${String(invoice.docNum).padStart(6, '0')}`}
      status={statusBadgeProps(invoice.status, DocKind.Invoice)}
      actions={
        <DocumentActionBar
          docType="SINV"
          pdfUrl={`/api/sales/invoices/${invoice.id}/pdf`}
          docId={invoice.id}
          docCode={docCode}
          onCancel={onCancel}
          showCancel={(invoice.status === 'O' || invoice.status === 'D') && canDelete}
          isCancelling={isCancelling}
          onSendEmail={invoice.status === 'O' ? () => setEmailModalOpen(true) : undefined}
          primary={
            invoice.status === 'D' && onPost
              ? { label: 'Asentar Factura', icon: Save, onClick: onPost, isLoading: isPosting }
              : invoice.status === 'O' && remaining > 0
                ? {
                    label: 'Registrar cobro',
                    icon: CreditCard,
                    onClick: () => setPayModalOpen(true),
                  }
                : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        <PaymentStatusBadge status={invoice.paymentStatus} isLocked={invoice.isLocked} />
        <CloneDocumentActions docType="SINV" doc={invoice} show="copy" size={14} />
        <TraceabilityButton type="SINV" id={invoice.id} docCode={docCode} />
        <InternalOrderChip internalOrderId={invoice.internalOrderId} />
        {invoice.amountPaid != null && Number(invoice.amountPaid) > 0 && (
          <span className="text-xs font-mono text-ink-500 dark:text-ink-400">
            Pagado {fmt.money(Number(invoice.amountPaid))} ·{' '}
            {remaining > 0 ? `Pendiente ${fmt.money(remaining)}` : 'Completo'}
          </span>
        )}
      </div>
      <RegisterPaymentModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        kind="sales"
        invoiceId={invoice.id}
        invoiceCode={docCode}
        remaining={remaining}
        onSuccess={() => setPaymentsRefreshKey((v) => v + 1)}
      />
      <SendInvoiceModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        docType="SINV"
        docId={invoice.id}
        docCode={docCode}
        partnerName={partner?.name}
        partnerEmail={partner?.email}
      />
      {invoice.status === 'O' && (
        <div className="mb-4">
          <InvoicePaymentsList
            kind="sales"
            invoiceId={invoice.id}
            refreshKey={paymentsRefreshKey}
            onChanged={() => setPaymentsRefreshKey((v) => v + 1)}
          />
        </div>
      )}
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
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/30 rounded-xl">
            <FileText size={16} className="text-amber-600 dark:text-amber-300 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-200 font-medium leading-tight">
              Documento contable firme — genera obligación de cobro.
            </p>
          </div>
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
                {fmt.date(invoice.date)}
              </dd>
            </div>
            {series && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Serie
                </dt>
                <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {series.name}
                </dd>
              </div>
            )}
            {period && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Periodo
                </dt>
                <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {period.name}
                </dd>
              </div>
            )}
            {docType && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Tipo de factura
                </dt>
                <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                  {docType.name}
                  {docType.isRectify && (
                    <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      Rectificativa
                    </span>
                  )}
                </dd>
              </div>
            )}
            {payMethod && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Método de pago
                </dt>
                <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {payMethod.name}
                </dd>
              </div>
            )}
            {payTerm && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Plazo de pago
                </dt>
                <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {payTerm.name}
                </dd>
              </div>
            )}
            {invoice.dueDate && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Vencimiento
                </dt>
                <dd className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {fmt.date(invoice.dueDate)}
                </dd>
              </div>
            )}
            {Number(invoice.withholdingRate) > 0 && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  Retención IRPF
                </dt>
                <dd className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  {invoice.withholdingRate}% ({fmt.money(invoice.withholdingAmount || 0)})
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={columns} data={invoice.lines || []} />
        <DocumentTotalsBlock
          subtotal={invoice.subtotal}
          tax={invoice.taxTotal}
          total={invoice.total}
          withholdingAmount={invoice.withholdingAmount}
          withholdingRate={invoice.withholdingRate}
          totalLabel="Total Factura"
        />
      </Card>

      <PluginFieldsPanel
        tableName="SalesInvoice"
        values={invoice}
        onChange={() => {}}
        disabled
        layout="inline"
        title="Campos de plugin"
      />

      <AttachmentsPanel entityType="SalesInvoice" entityId={invoice.id} />
    </DocumentDetailLayout>
  );
};

const formatDocCode = (inv: any): string =>
  `${inv.seriesPrefix}-${inv.periodCode}-${String(inv.docNum).padStart(6, '0')}`;

export const SalesInvoices: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const params = useParams();
  const location = useLocation();
  const { openTab } = useTabs();
  const currentTab = useCurrentTab();

  const detailId = params.id;
  const isCreate = location.pathname.endsWith('/new');
  const isDetail = !!detailId;
  const isList = !isCreate && !isDetail;

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(isList);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(isDetail);
  const [cancelling, setCancelling] = useState(false);
  const [posting, setPosting] = useState(false);
  const [viewingBatch, setViewingBatch] = useState<any>(null);
  const [internalOrderId, setInternalOrderId] = useState<string | null>(null);
  const dataVersion = useDataVersion(DocType.SalesInvoice);

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: DocType.SalesInvoice,
    apiEndpoint: '/api/sales/invoices',
    permissions: (user as any)?.permissions?.['/sales/invoices'],
  });

  // Escáner HID + cámara → añade línea automáticamente cuando estamos
  // editando una factura (isCreate o isDetail editable).
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
        const res = await fetch('/api/sales/invoices', { headers: authHeaders });
        const data = await res.json();
        const withCode = (Array.isArray(data) ? data : []).map((d: any) => ({
          ...d,
          docCode: `${d.seriesPrefix || ''}-${d.periodCode || ''}-${String(d.docNum || '').padStart(6, '0')}`,
          partnerName: d.partnerName || '',
        }));
        setInvoices(withCode);
      } catch (e) {
        toast.error('Error al cargar facturas');
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
        const res = await fetch(`/api/sales/invoices/${detailId}`, { headers: authHeaders });
        if (!res.ok) throw new Error('No encontrada');
        const data = await res.json();
        setSelectedInvoice(data);
        currentTab.rename(formatDocCode(data));
      } catch (e: any) {
        toast.error(e.message || 'Error al cargar el detalle de la factura');
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [isDetail, detailId, token, user?.tenantId, dataVersion]);

  // Clone-from-clipboard: si hay payload pegado desde otra vista, pre-rellena.
  useEffect(() => {
    if (!isCreate) return;
    const raw = sessionStorage.getItem('keirost:cloneInvoice:SINV');
    if (!raw) return;
    sessionStorage.removeItem('keirost:cloneInvoice:SINV');
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

  // Copy-from flow: /sales/invoices/new?copyFrom=<id>
  useEffect(() => {
    if (!isCreate) return;
    const urlParams = new URLSearchParams(location.search);
    if (!urlParams.get('copyFrom')) return;
    const sourceData = localStorage.getItem('copy_pdn_source');
    if (!sourceData) return;
    try {
      const sdn = JSON.parse(sourceData);
      doc.setState.setPartnerId(sdn.partnerId);
      if (sdn.internalOrderId) setInternalOrderId(sdn.internalOrderId);
      doc.setState.setLines(
        sdn.lines.map((l: any) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          price: l.price,
          taxGroupId: l.taxGroupId,
          warehouseId: l.warehouseId,
          zoneId: l.zoneId,
          batchDetails: l.batchDetails,
          baseType: 'SDN',
          baseId: sdn.id,
          baseLine: l.lineNum || l.id,
        })),
      );
    } catch (e) {
      console.error('Error parsing copy_pdn_source', e);
    }
  }, [isCreate]);

  const handleSubmit = async (extra?: any) => {
    try {
      // Desprefijar los campos fiscales que el DocumentFiscalPanel guarda en
      // pluginData con prefijo "__fiscal_" y pasarlos como top-level al body.
      const pd = doc.state.pluginData || {};
      const fiscalFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(pd)) {
        if (k.startsWith('__fiscal_') && v !== '' && v != null) {
          fiscalFields[k.replace('__fiscal_', '')] = v;
        }
      }
      if ((doc.state as any).withholdingRate) fiscalFields.withholdingRate = (doc.state as any).withholdingRate;
      if (internalOrderId) fiscalFields.internalOrderId = internalOrderId;

      const created = await doc.actions.submitDocument({ ...fiscalFields, ...extra });
      toast.success('Factura emitida correctamente');
      notifyDocChange(DocType.SalesInvoice);
      if (created?.id) {
        openTab(`/sales/invoices/${created.id}`, {
          title: `FA-${String(created.docNum || '').padStart(6, '0')}`,
        });
      }
      currentTab.close();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCancel = async () => {
    if (!selectedInvoice) return;
    if (!confirm('¿Seguro que deseas cancelar esta factura?')) return;
    try {
      setCancelling(true);
      const res = await fetch(`/api/sales/invoices/${selectedInvoice.id}/cancel`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al cancelar la factura');
      }
      toast.success('Factura cancelada');
      notifyDocChange(DocType.SalesInvoice);
      currentTab.close();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCancelling(false);
    }
  };

  const handlePost = async () => {
    if (!selectedInvoice) return;
    try {
      setPosting(true);
      const res = await fetch(`/api/sales/invoices/${selectedInvoice.id}/post`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al asentar');
      }
      toast.success('Factura asentada');
      notifyDocChange(DocType.SalesInvoice);
      // Refetch el detalle para reflejar el nuevo status
      setSelectedInvoice({ ...selectedInvoice, status: 'O' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPosting(false);
    }
  };

  // Atajos de teclado en creación
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
          canDelete={doc.state.canDelete}
          isCancelling={cancelling}
          masters={doc.masters}
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
    <InvoiceList
      doc={doc}
      data={invoices}
      loading={loading}
      partners={doc.masters.partners}
      onCreate={() => openTab('/sales/invoices/new')}
      onCreateFromClone={(payload) => {
        sessionStorage.setItem('keirost:cloneInvoice:SINV', JSON.stringify(payload));
        openTab('/sales/invoices/new');
      }}
      canWrite={doc.state.canWrite}
      onDetail={(inv) => openTab(`/sales/invoices/${inv.id}`, { title: formatDocCode(inv) })}
    />
  );
};
