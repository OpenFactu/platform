import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Input,
  useToast,
  Badge,
  FilterBar,
  SearchableSelect,
} from '@openfactu/ui';
import { Plus, ArrowLeft, Save, Download, Eye } from 'lucide-react';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import {
  useDocument,
  useDataTable,
  DocType,
  DocKind,
  DocSide,
  getDocTypeConfig,
  DOC_TYPE_CONFIGS,
  decomposeDocType,
} from '@openfactu/common';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { downloadPdf } from '@/utils/downloadPdf';
import { formatDocCode } from '@/utils/docCode';
import { buildDetailLineColumns, buildFormLineColumns, statusBadgeProps } from '../components/documentLineCells';
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`${config.apiEndpoint}/${id}/pdf`, token || '', user?.tenantId || '');
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
      header: config.partnerLabel,
      sortable: true,
      sortAccessor: (item: any) => item.partnerName || '',
      accessor: (item: any) => (
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200">{item.partnerName}</p>
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
        const props = statusBadgeProps[item.status] || {
          variant: 'neutral' as const,
          label: item.status,
        };
        return <Badge variant={props.variant}>{props.label}</Badge>;
      },
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
            className="h-8 w-8 p-0"
            title="PDF"
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
            Ver
          </Button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (item: any) => [
    { label: 'Ver', icon: <Eye size={14} />, onClick: () => onDetail(item) },
    {
      label: 'Descargar PDF',
      icon: <Download size={14} />,
      onClick: () => handleQuickPdf(item.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100">
            {config.labelPlural}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona todos los {config.labelPlural.toLowerCase()}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-3">
            <Button onClick={onCreate} className="gap-2">
              <Plus size={16} /> Nuevo {config.label}
            </Button>
          </div>
        )}
      </div>

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

      <Table
        columns={ctxColumns}
        data={filteredData || []}
        isLoading={loading}
        onRowClick={onDetail}
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
      />
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

// ── FORMULARIO ─────────────────────────────────────────────────────

const DocumentForm: React.FC<{
  config: ReturnType<typeof getDocTypeConfig>;
  doc: ReturnType<typeof useDocument>;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ config, doc, onSubmit, onCancel }) => {
  const { state, setState, masters, actions, computations } = doc;
  const fmt = useFormat();
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
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-slate-500">
          <ArrowLeft size={16} /> Volver
        </button>
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
            <Input
              type="date"
              value={state.date}
              onChange={(e) => setState.setDate(e.target.value)}
            />
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
        <Table columns={formColumns} data={state.lines} />
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
  const [downloading, setDownloading] = useState(false);
  const { kind, side } = decomposeDocType(config.docType);

  const detailColumns = buildDetailLineColumns({ kind, side, masters: { items: [] }, fmt });

  const handlePdf = async () => {
    setDownloading(true);
    try {
      await downloadPdf(`${config.apiEndpoint}/${doc.id}/pdf`, token || '', user?.tenantId || '');
    } catch {
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500">
        <ArrowLeft size={16} /> Volver
      </button>
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
        <Table columns={detailColumns} data={doc.lines || []} />
      </Card>
    </div>
  );
};

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────

const Documents: React.FC = () => {
  const { docType } = useParams<{ docType: string }>();
  const { token, user } = useAuth();
  const toast = useToast();

  const config = useMemo(() => {
    if (!docType || !DOC_TYPE_CONFIGS[docType as DocType]) return null;
    return getDocTypeConfig(docType as DocType);
  }, [docType]);

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
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar');
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
    } catch (e: any) {
      toast.error(e.message || 'Error al crear');
    }
  };

  if (!config) {
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
