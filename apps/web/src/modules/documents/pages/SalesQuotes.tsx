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
} from '@openfactu/ui';
import { SearchableSelect } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import {
  FileSignature,
  Plus,
  ArrowLeft,
  Save,
  FileText,
  Copy,
  PlusSquare,
  Download,
  Eye,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import { DocumentActionBar } from '../components/DocumentActionBar';
import { DocumentDetailLayout } from '../components/DocumentDetailLayout';
import { DocumentCardList } from '../components/DocumentCardList';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { TraceabilityButton } from '@/components/common/TraceabilityButton';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { buildDetailLineColumns, buildFormLineColumns } from '../components/documentLineCells';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { downloadPdf } from '@/utils/downloadPdf';
import { useFormat } from '@/hooks/useFormat';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { useItemUoms } from '@/hooks/useItemUoms';
import { usePluginLineFields } from '@/hooks/usePluginLineFields';
import { useDocument, DocKind, DocSide } from '@openfactu/common';
import { formatDocCode } from '@/utils/docCode';
import { InternalOrderHeaderField } from '@/modules/analytics/components/InternalOrderHeaderField';
import { InternalOrderChip } from '@/modules/analytics/components/InternalOrderChip';
import { useInternalOrderLineColumn } from '@/hooks/useLineInternalOrderColumn';
import { useDocTypes } from '../domain/docTypeRegistry';
import { docsApi } from '../api';
import { apiClient } from '@/shared/http';

const API = '/api/documents/SQ';

const statusBadge = (status: string): { label: string; variant: any } => {
  if (status === 'O') return { label: 'Abierto', variant: 'warning' };
  if (status === 'A') return { label: 'Aceptado', variant: 'success' };
  if (status === 'R') return { label: 'Rechazado', variant: 'error' };
  return { label: 'Cancelado', variant: 'neutral' };
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
  const toast = useToast();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`${API}/${id}/pdf`);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al descargar PDF');
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
      header: 'No. Presupuesto',
      sortable: true,
      sortAccessor: (item: any) => formatDocCode(item),
      accessor: (item: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-fg-default leading-none">{formatDocCode(item)}</span>
          <span className="text-[10px] text-fg-subtle font-mono mt-1">
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
      header: 'Total',
      align: 'right' as const,
      sortable: true,
      sortAccessor: (item: any) => Number(item.total) || 0,
      accessor: (item: any) => (
        <span className="font-black text-fg-default">{fmt.money(item.total)}</span>
      ),
    },
    {
      header: 'Estado',
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
    { label: 'Ver Presupuesto', icon: <Eye size={14} />, onClick: () => onDetail(item) },
    {
      label: 'Descargar PDF',
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
        title="Presupuestos"
        subtitle="Ofertas a clientes, convertibles en pedido o factura al aceptarse."
        actions={
          <Button
            type="button"
            onClick={onCreate}
            disabled={!canWrite}
            className="flex items-center gap-2 h-12 px-6 disabled:opacity-50"
          >
            <Plus size={20} /> Nuevo Presupuesto
          </Button>
        }
      />

      <Card className="overflow-hidden" noPadding>
        <FilterBar
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
                { label: 'Aceptado', value: 'A' },
                { label: 'Rechazado', value: 'R' },
                { label: 'Cancelado', value: 'X' },
              ],
            },
            { key: 'date', label: 'Fecha', type: 'date' },
          ]}
          searchPlaceholder="Buscar presupuesto..."
        />
        {isMobile ? (
          <DocumentCardList
            data={filteredData}
            isLoading={loading}
            onClick={onDetail}
            emptyMessage="No hay presupuestos."
            title={(item: any) => formatDocCode(item)}
            subtitle={(item: any) =>
              item.partnerName || partners.find((p) => p.id === item.partnerId)?.name || '...'
            }
            status={(item: any) => {
              const b = statusBadge(item.status);
              return <Badge variant={b.variant}>{b.label}</Badge>;
            }}
            fields={[
              { label: 'Fecha', value: (item: any) => fmt.date(item.date) },
              {
                label: 'Total',
                value: (item: any) => (
                  <span className="font-black text-fg-default">{fmt.money(item.total)}</span>
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
            columns={columns}
            data={filteredData}
            isLoading={loading}
            rowActions={rowActions}
            onRowClick={onDetail}
          />
        )}
      </Card>
    </div>
  );
};

// --- Sub-componente: VISTA DE CREACIÓN ---
const QuoteForm: React.FC<{
  onBack: () => void;
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
}> = ({
  onBack,
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
}) => {
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const itemUoms = useItemUoms();
  const pluginLineFields = usePluginLineFields('SalesQuoteLine');
  const projectCol = useInternalOrderLineColumn(actions.updateLine);

  const columns = useMemo(() => {
    const base = buildFormLineColumns({
      kind: DocKind.Order,
      side: DocSide.Sale,
      state,
      masters,
      actions,
      fmt,
      getItemUoms: itemUoms.get,
      pluginLineFields,
    });
    // El builder base ya trae su propia columna 'Proyecto' cuando hay
    // proyectos en masters — la quitamos para no duplicarla con projectCol.
    const rest = base.slice(0, -1).filter((c) => c.header !== 'Proyecto');
    return [...rest, projectCol, base[base.length - 1]];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lines, masters.items, masters.taxGroups, pluginLineFields, projectCol]);

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        size="lg"
        divider
        className="pb-8"
        breadcrumbs={
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            title="Volver"
            className="rounded-lg self-start"
          >
            <ArrowLeft size={20} />
          </Button>
        }
        title="Nuevo Presupuesto"
        subtitle={
          <span className="flex items-center gap-2">
            <FileText size={14} className="text-accent" />
            Oferta sin efecto en stock ni contabilidad.
          </span>
        }
        actions={
          <Button
            type="button"
            onClick={onSubmit}
            isLoading={state.isSubmitting}
            disabled={!!state.seriesError || !state.canWrite}
            className="flex items-center gap-2 h-12 px-8 disabled:opacity-50"
          >
            <Save size={20} /> Guardar Presupuesto
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2 space-y-6 border-border-subtle">
          <div className="border-b border-border-subtle pb-3 flex justify-between items-baseline gap-4">
            <h3 className="font-black text-fg-body uppercase text-[11px] tracking-[0.15em] leading-none">
              Cabecera del Presupuesto
            </h3>
            <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider leading-none">
              * Campos obligatorios
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-fg-subtle uppercase tracking-widest">
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
              <label className="text-xs font-black text-fg-subtle uppercase tracking-widest">
                Fecha *
              </label>
              <DatePicker value={state.date} onChange={(v) => setState.setDate(v ?? '')} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-fg-subtle uppercase tracking-widest">
                Válido hasta
              </label>
              <DatePicker value={validUntil} onChange={(v) => setValidUntil(v ?? '')} />
            </div>
            <InternalOrderHeaderField value={internalOrderId} onChange={setInternalOrderId} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 space-y-6 border-border-subtle bg-bg-muted">
            <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-widest border-b pb-2">
              Series y Periodo
            </h4>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-fg-muted">Serie de Numeración *</label>
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
                <label className="text-[10px] font-bold text-fg-muted">Periodo Contable *</label>
                <SearchableSelect
                  value={state.periodId}
                  onChange={setState.setPeriodId}
                  options={masters.periods.map((p: any) => ({ label: p.name, value: p.id }))}
                />
              </div>
            </div>
          </Card>
          <PluginFieldsPanel
            tableName="SalesQuote"
            values={state.pluginData}
            onChange={setState.setPluginField}
            disabled={state.isSubmitting}
            layout="sidebar"
          />
        </div>
      </div>

      <Card className="shadow-lg overflow-hidden border-border-subtle" noPadding>
        {isMobile ? (
          <MobileLineCards
            columns={columns}
            lines={state.lines || []}
            emptyMessage="No hay líneas en el presupuesto."
          />
        ) : (
          <Table
            columns={columns}
            data={state.lines || []}
            emptyMessage="No hay líneas en el presupuesto."
          />
        )}
        <div className="p-6 bg-bg-muted flex flex-col md:flex-row justify-between items-start md:items-center border-t border-border-subtle gap-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => actions.addLine()}
            className="text-sky-600 dark:text-sky-300 font-bold flex items-center gap-2 h-10 border-border-default bg-bg-card"
          >
            <PlusSquare size={16} /> Añadir Línea
          </Button>
          <div className="flex flex-col items-end min-w-[240px] space-y-2 bg-bg-card p-4 rounded-lg border border-border-subtle shadow-sm">
            <div className="flex justify-between w-full text-[10px] font-black text-fg-subtle uppercase tracking-widest px-1">
              <span>Base Imponible:</span>
              <span className="text-fg-body">{computations.subtotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between w-full text-[10px] font-black text-sky-500 uppercase tracking-widest px-1">
              <span>Cuota IVA:</span>
              <span>{computations.taxTotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between w-full pt-3 mt-1 border-t items-baseline px-1 border-slate-50">
              <span className="text-[10px] uppercase font-black text-fg-subtle tracking-widest">
                Total Presupuesto:
              </span>
              <span className="text-2xl font-black text-fg-default tracking-tighter ml-4">
                {computations.total.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
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
  canWrite,
  canDelete,
  isCancelling,
  masters,
}) => {
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
    [quote.lines, masters.items, masters.taxGroups, pluginLineFields],
  );

  const isOpen = quote.status === 'O';
  const isAccepted = quote.status === 'A';
  const isRejected = quote.status === 'R';
  const convertible = (isOpen || isAccepted) && canWrite;

  return (
    <DocumentDetailLayout
      onBack={onBack}
      breadcrumb="VENTAS · PRESUPUESTO"
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
            convertible ? { label: 'Crear Pedido', icon: Copy, onClick: onCreateOrder } : undefined
          }
        />
      }
    >
      <div className="flex items-center gap-3 mb-4 -mt-2 flex-wrap">
        {isOpen && canWrite && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onStatusChange('A')}
              className="h-9 gap-2 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
            >
              <Check size={14} /> Aceptar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onStatusChange('R')}
              className="h-9 gap-2 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-500/30"
            >
              <X size={14} /> Rechazar
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
            <RotateCcw size={14} /> Reabrir
          </Button>
        )}
        {convertible && (
          <Button variant="secondary" size="sm" onClick={onCreateInvoice} className="h-9 gap-2">
            <FileText size={14} /> Crear Factura
          </Button>
        )}
        <TraceabilityButton type="SQ" id={quote.id} docCode={docCode} />
        <InternalOrderChip internalOrderId={quote.internalOrderId} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-border-subtle" bodyClassName="p-6 space-y-5">
          <div>
            <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-[0.15em] mb-2">
              Cliente
            </h4>
            <p className="text-xl font-black text-fg-default tracking-tight">
              {partner?.name || '—'}
            </p>
            {partner?.nif && (
              <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider mt-0.5 font-mono">
                NIF: {partner.nif}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-500/5 border border-sky-100 dark:border-sky-500/30 rounded-lg">
            <FileText size={16} className="text-sky-600 dark:text-sky-300 shrink-0" />
            <p className="text-xs text-sky-800 dark:text-sky-200 font-medium leading-tight">
              Documento de oferta — no mueve stock ni genera apuntes contables.
            </p>
          </div>
        </Card>

        <Card className="border-border-subtle" bodyClassName="p-6 space-y-4">
          <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-[0.15em] border-b border-border-subtle pb-2">
            Información
          </h4>
          <dl className="space-y-2.5">
            <div className="flex justify-between items-baseline gap-4">
              <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                Fecha
              </dt>
              <dd className="text-sm font-bold text-fg-default tabular-nums">
                {fmt.date(quote.date)}
              </dd>
            </div>
            {quote.validUntil && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  Válido hasta
                </dt>
                <dd className="text-sm font-bold text-fg-default tabular-nums">
                  {fmt.date(quote.validUntil)}
                </dd>
              </div>
            )}
            {series && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  Serie
                </dt>
                <dd className="text-sm font-bold text-fg-default truncate">{series.name}</dd>
              </div>
            )}
            {period && (
              <div className="flex justify-between items-baseline gap-4">
                <dt className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  Periodo
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
          <Table columns={columns} data={quote.lines || []} />
        )}
        <DocumentTotalsBlock
          subtotal={quote.subtotal}
          tax={quote.taxTotal}
          total={quote.total}
          totalLabel="Total Presupuesto"
        />
      </Card>

      <PluginFieldsPanel
        tableName="SalesQuote"
        values={quote}
        onChange={() => {}}
        disabled
        layout="inline"
        title="Campos de plugin"
      />

      <AttachmentsPanel entityType="SalesQuote" entityId={quote.id} />
    </DocumentDetailLayout>
  );
};

// --- Componente principal ---
export const SalesQuotes: React.FC = () => {
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
        toast.error('Error al cargar presupuestos');
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
        toast.error(
          (e instanceof Error ? e.message : undefined) || 'Error al cargar el presupuesto',
        );
      } finally {
        setDetailLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetail, detailId, token, user?.tenantId, dataVersion]);

  const handleSubmit = async () => {
    if (!doc.state.partnerId || !doc.state.seriesId || !doc.state.periodId) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    if (doc.state.lines.length === 0) {
      toast.error('Añade al menos una línea');
      return;
    }
    try {
      const data = await doc.actions.submitDocument({
        ...(validUntil ? { validUntil } : {}),
        internalOrderId,
      });
      toast.success(`Presupuesto registrado nº ${data.docNum}`);
      notifyDocChange('SQ');
      currentTab.close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancel = async () => {
    if (!selectedQuote) return;
    const ok = await popup.confirm({
      title: 'Cancelar presupuesto',
      message: '¿Seguro que deseas cancelar este presupuesto?',
      tone: 'danger',
      confirmLabel: 'Cancelar presupuesto',
      cancelLabel: 'Volver',
    });
    if (!ok) return;
    setIsCancelling(true);
    try {
      await docsApi.cancel(API, selectedQuote.id);
      toast.success('Presupuesto cancelado');
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
      toast.success('Estado actualizado');
      notifyDocChange('SQ');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al cambiar estado');
    }
  };

  const handleCreateOrder = () => {
    if (!selectedQuote) return;
    localStorage.setItem('copy_quote_source', JSON.stringify(selectedQuote));
    openTab(`/sales-orders/new?copyFrom=${selectedQuote.id}`, {
      title: `Pedido ← ${formatDocCode(selectedQuote)}`,
    });
  };

  const handleCreateInvoice = () => {
    if (!selectedQuote) return;
    localStorage.setItem('copy_quote_source', JSON.stringify(selectedQuote));
    openTab(`/sales/invoices/new?copyFrom=${selectedQuote.id}`, {
      title: `Factura ← ${formatDocCode(selectedQuote)}`,
    });
  };

  if (isCreate) {
    return (
      <QuoteForm
        onBack={() => currentTab.close()}
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
      onCreate={() => openTab('/sales/quotes/new', { title: 'Nuevo Presupuesto' })}
      onDetail={(q) => openTab(`/sales/quotes/${q.id}`, { title: formatDocCode(q) })}
      canWrite={canWrite}
    />
  );
};
