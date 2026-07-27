import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Input,
  DatePicker,
  Loader,
  useToast,
  Badge,
  FilterBar,
  PageHeader,
  SearchableSelect,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { Plus, ArrowLeft, Save, Download, Eye } from 'lucide-react';
import {
  useDocument,
  useDataTable,
  DocType,
  DocKind,
  DocSide,
  decomposeDocType,
} from '@openfactu/common';
import { getDocTypeConfig } from '../domain/docTypeConfig';
import { useDocTypes } from '../domain/docTypeRegistry';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { downloadPdf } from '@/utils/downloadPdf';
import { formatDocCode } from '@/utils/docCode';
import {
  buildDetailLineColumns,
  buildFormLineColumns,
  statusBadgeProps,
} from '../components/documentLineCells';
import { DocumentCardList } from '../components/DocumentCardList';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useItemUoms } from '@/hooks/useItemUoms';
import { notifyDocChange, useDataVersion } from '@/utils/dataRefresh';
import { docsApi } from '../api';

// ── LISTADO ────────────────────────────────────────────────────────

const DocumentList: React.FC<{
  config: ReturnType<typeof getDocTypeConfig>;
  data: any[];
  loading: boolean;
  onCreate: () => void;
  onDetail: (doc: any) => void;
  canWrite: boolean;
}> = ({ config, data, loading, onCreate, onDetail, canWrite }) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`${config.apiEndpoint}/${id}/pdf`);
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
          label: config.partnerLabel,
          options: (data as any[])
            .filter((d) => d.partnerName)
            .map((d) => ({ label: d.partnerName, value: d.partnerId })),
        },
        {
          key: 'status',
          type: 'select',
          label: 'Estado',
          options: config.statusOptions,
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
      header: config.partnerLabel,
      sortable: true,
      sortAccessor: (item: any) => item.partnerName || '',
      accessor: (item: any) => (
        <div>
          <p className="font-bold text-fg-body">{item.partnerName}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-1">
            CIE: {item.partnerId?.substring(0, 6)}
          </p>
        </div>
      ),
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
        const props = statusBadgeProps(item.status, decomposeDocType(config.docType).kind) || {
          variant: 'neutral' as const,
          label: item.status,
        };
        return <Badge variant={props.variant}>{props.label}</Badge>;
      },
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hay que duplicarlas
  // entre una columna de botones y el menú contextual.
  const rowActions = (item: any): RowAction[] => [
    { label: 'Ver', icon: <Eye size={14} />, onClick: () => onDetail(item) },
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
        title={config.labelPlural}
        subtitle={`Gestiona todos los ${config.labelPlural.toLowerCase()}`}
        actions={
          canWrite && (
            <Button type="button" onClick={onCreate} className="gap-2">
              <Plus size={16} /> Nuevo {config.label}
            </Button>
          )
        }
      />

      <div className="flex gap-2 mb-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={`Buscar ${config.labelPlural.toLowerCase()}...`}
          className="max-w-sm"
        />
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Limpiar filtros
        </Button>
      </div>

      {isMobile ? (
        <DocumentCardList
          data={filteredData || []}
          isLoading={loading}
          onClick={onDetail}
          emptyMessage="No hay documentos."
          title={(item: any) => formatDocCode(item)}
          subtitle={(item: any) => item.partnerName}
          status={(item: any) => {
            const props = statusBadgeProps(item.status, decomposeDocType(config.docType).kind) || {
              variant: 'neutral' as const,
              label: item.status,
            };
            return <Badge variant={props.variant}>{props.label}</Badge>;
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
          data={filteredData || []}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={onDetail}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
        />
      )}
    </div>
  );
};

// ── FORMULARIO ─────────────────────────────────────────────────────

const DocumentForm: React.FC<{
  config: ReturnType<typeof getDocTypeConfig>;
  doc: ReturnType<typeof useDocument>;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ config, doc, onSubmit, onCancel }) => {
  const { state, setState, masters, actions, computations } = doc;
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const { get: getItemUoms } = useItemUoms();
  const { kind, side } = decomposeDocType(config.docType);

  const formColumns = buildFormLineColumns({
    kind,
    side,
    state: { lines: state.lines, warehouseId: state.warehouseId },
    masters: { items: masters.items, taxGroups: masters.taxGroups, warehouses: masters.warehouses },
    actions: { updateLine: actions.updateLine, removeLine: actions.removeLine },
    fmt,
    getItemUoms,
  });

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="gap-2">
          <ArrowLeft size={16} /> Volver
        </Button>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} isLoading={state.isSubmitting} className="gap-2">
            <Save size={16} /> Guardar
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-bold mb-4">Nuevo {config.label}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-mono uppercase text-slate-500 mb-1">
              {config.partnerLabel} *
            </label>
            <SearchableSelect
              value={state.partnerId}
              onChange={setState.setPartnerId}
              options={masters.partners.map((p) => ({ label: p.name, value: p.id }))}
              placeholder={config.partnerPlaceholder}
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase text-slate-500 mb-1">Serie *</label>
            <SearchableSelect
              value={state.seriesId}
              onChange={setState.setSeriesId}
              options={masters.series.map((s) => ({ label: s.name, value: s.id }))}
              placeholder="Seleccionar serie..."
            />
          </div>
          {state.isManualSeries && (
            <div>
              <label className="block text-xs font-mono uppercase text-slate-500 mb-1">
                Nº documento (manual) *
              </label>
              <Input
                type="number"
                min={1}
                step={1}
                value={state.manualNumber}
                onChange={(e) => setState.setManualNumber(e.target.value)}
                placeholder="Ej: 1050"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-mono uppercase text-slate-500 mb-1">
              Período *
            </label>
            <SearchableSelect
              value={state.periodId}
              onChange={setState.setPeriodId}
              options={masters.periods.map((p) => ({ label: p.name, value: p.id }))}
              placeholder="Seleccionar período..."
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase text-slate-500 mb-1">Fecha</label>
            <DatePicker value={state.date} onChange={(v) => setState.setDate(v ?? '')} />
          </div>
          {masters.warehouses.length > 0 && (
            <div>
              <label className="block text-xs font-mono uppercase text-slate-500 mb-1">
                Almacén
              </label>
              <SearchableSelect
                value={state.warehouseId}
                onChange={setState.setWarehouseId}
                options={masters.warehouses.map((w) => ({ label: w.name, value: w.id }))}
                placeholder="Seleccionar almacén..."
              />
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-bold">Líneas</h2>
          <Button variant="secondary" size="sm" onClick={() => actions.addLine()} className="gap-1">
            <Plus size={14} /> Añadir
          </Button>
        </div>
        {isMobile ? (
          <MobileLineCards columns={formColumns} lines={state.lines || []} />
        ) : (
          <Table columns={formColumns} data={state.lines} />
        )}
        <div className="mt-4 flex justify-end gap-6 text-sm">
          <div>
            <span className="text-slate-500">Subtotal:</span>{' '}
            <span className="font-bold">{fmt.money(computations.subtotal)}</span>
          </div>
          <div>
            <span className="text-slate-500">Total:</span>{' '}
            <span className="font-black">{fmt.money(computations.total)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ── DETALLE ────────────────────────────────────────────────────────

const DocumentDetail: React.FC<{
  config: ReturnType<typeof getDocTypeConfig>;
  doc: any;
  onBack: () => void;
  onClone: (payload: { header: any; lines: any[] }) => void;
}> = ({ config, doc, onBack, onClone }) => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [downloading, setDownloading] = useState(false);
  const { kind, side } = decomposeDocType(config.docType);

  const detailColumns = buildDetailLineColumns({ kind, side, masters: { items: [] }, fmt });

  const handlePdf = async () => {
    setDownloading(true);
    try {
      await downloadPdf(`${config.apiEndpoint}/${doc.id}/pdf`);
    } catch {
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-2">
        <ArrowLeft size={16} /> Volver
      </Button>
      <Card className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">{config.label}</h2>
            <p className="text-sm text-slate-500">{doc.docCode || doc.id}</p>
          </div>
          <Button variant="secondary" onClick={handlePdf} isLoading={downloading} className="gap-2">
            <Download size={14} /> PDF
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Estado:</span> <Badge>{doc.status}</Badge>
          </div>
          <div>
            <span className="text-slate-500">Fecha:</span> {doc.date}
          </div>
          <div>
            <span className="text-slate-500">Total:</span>{' '}
            <span className="font-bold">{fmt.money(doc.total)}</span>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-bold mb-3">Líneas</h3>
        {isMobile ? (
          <MobileLineCards columns={detailColumns} lines={doc.lines || []} />
        ) : (
          <Table columns={detailColumns} data={doc.lines || []} />
        )}
      </Card>
    </div>
  );
};

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────

const Documents: React.FC = () => {
  const { docType } = useParams<{ docType: string }>();
  const { token, user } = useAuth();
  const toast = useToast();

  // Tipos registrados en el servidor (SQ, plugins...) — los 6 core resuelven
  // síncrono vía los mapas estáticos; el resto espera al fetch del registry.
  const { loading: typesLoading } = useDocTypes();
  const config = useMemo(() => {
    if (!docType) return null;
    return getDocTypeConfig(docType as DocType) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, typesLoading]);

  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [listData, setListData] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: config?.docType || 'SINV',
    apiEndpoint: config?.apiEndpoint || '/api/sales/invoices',
    permissions: { read: true, write: true, delete: true },
  });

  const dataVersion = useDataVersion(config?.docType || 'SINV');

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  // Cargar lista
  useEffect(() => {
    if (view !== 'list' || !token || !user?.tenantId || !config) return;
    (async () => {
      try {
        setListLoading(true);
        const data = await docsApi.list(config.apiEndpoint);
        setListData(
          (Array.isArray(data) ? data : []).map((d: any) => ({
            ...d,
            docCode: formatDocCode(d),
            partnerName: d.partnerName || '',
          })),
        );
      } catch {
        toast.error('Error al cargar');
      } finally {
        setListLoading(false);
      }
    })();
  }, [view, token, user?.tenantId, config, dataVersion]);

  const handleCreate = () => {
    doc.setState.setPartnerId('');
    doc.setState.setSeriesId('');
    doc.setState.setPeriodId('');
    doc.setState.setDate(new Date().toISOString().slice(0, 10));
    doc.setState.setLines([]);
    doc.setState.setWarehouseId('');
    setView('form');
  };

  const handleDetail = async (item: any) => {
    try {
      const data = await docsApi.get(config!.apiEndpoint, item.id);
      setSelectedDoc(data);
      setView('detail');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al cargar');
    }
  };

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
      await doc.actions.submitDocument();
      toast.success(`${config?.label} creado`);
      notifyDocChange(config.docType);
      setView('list');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al crear');
    }
  };

  if (!config) {
    if (typesLoading) {
      return (
        <div className="p-8 flex justify-center">
          <Loader />
        </div>
      );
    }
    return (
      <div className="p-8 text-center">
        <h2>Tipo no válido: {docType}</h2>
      </div>
    );
  }

  const canWrite = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';

  return (
    <>
      {view === 'list' && (
        <DocumentList
          config={config}
          data={listData}
          loading={listLoading}
          onCreate={handleCreate}
          onDetail={handleDetail}
          canWrite={canWrite}
        />
      )}
      {view === 'form' && (
        <DocumentForm
          config={config}
          doc={doc}
          onSubmit={handleSubmit}
          onCancel={() => setView('list')}
        />
      )}
      {view === 'detail' && selectedDoc && (
        <DocumentDetail
          config={config}
          doc={selectedDoc}
          onBack={() => setView('list')}
          onClone={(payload) => {
            doc.setState.setPartnerId(payload.header.partnerId || '');
            doc.setState.setSeriesId(payload.header.seriesId || '');
            doc.setState.setPeriodId(payload.header.periodId || '');
            doc.setState.setDate(payload.header.date || new Date().toISOString().slice(0, 10));
            doc.setState.setLines(payload.lines || []);
            setView('form');
          }}
        />
      )}
    </>
  );
};

export default Documents;
