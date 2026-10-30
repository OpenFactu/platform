import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { SeriesPeriodFields } from '../components/form/SeriesPeriodFields';
import { HeaderSection, LinesSection, PartnerField } from '../components/form/FormPieces';
import { DocumentTotalsBlock } from '../components/DocumentTotalsBlock';
import { useFormLineColumns } from '../hooks/useFormLineColumns';
import { buildFormSteps, formStepStatus } from '../domain/formSteps';

import { ResponsiveActions } from '@/components/common/ResponsiveActions';
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
  PageHeader,
  SearchableSelect,
  Field,
  FormGrid,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { Plus, ArrowLeft, Download, Eye } from 'lucide-react';
import { useDocument, useDataTable, DocType, decomposeDocType } from '@openfactu/common';
import { getDocTypeConfig } from '../domain/docTypeConfig';
import { useDocTypes } from '../domain/docTypeRegistry';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { downloadPdf } from '@/utils/downloadPdf';
import { formatDocCode } from '@/utils/docCode';
import { buildDetailLineColumns, statusBadgeProps } from '../components/documentLineCells';
import { MobileLineCards } from '../components/MobileLineCards';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();
  const { token, user } = useAuth();
  const toast = useToast();
  const fmt = useFormat();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());

  const handleQuickPdf = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPdf(`${config.apiEndpoint}/${id}/pdf`);
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
          label: config.partnerLabel,
          options: (data as any[])
            .filter((d) => d.partnerName)
            .map((d) => ({ label: d.partnerName, value: d.partnerId })),
        },
        {
          key: 'status',
          type: 'select',
          label: t('doc.common.status'),
          options: config.statusOptions,
        },
        { key: 'date', type: 'date', label: t('doc.common.date') },
      ],
    });

  const columns = [
    {
      header: t('doc.common.document'),
      card: 'title' as const,
      sortable: true,
      sortAccessor: (item: any) => item.docCode || '',
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
      header: config.partnerLabel,
      sortable: true,
      sortAccessor: (item: any) => item.partnerName || '',
      accessor: (item: any) => (
        <div>
          <p className="font-bold text-fg-body">{item.partnerName}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-1">
            {t('doc.generic.partnerIdShort', { id: item.partnerId?.substring(0, 6) ?? '' })}
          </p>
        </div>
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
    { label: t('doc.common.view'), icon: <Eye size={14} />, onClick: () => onDetail(item) },
    {
      label: t('doc.actions.downloadPdf'),
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
        subtitle={t('doc.generic.subtitle', { plural: config.labelPlural.toLowerCase() })}
        actions={
          canWrite && (
            <ResponsiveActions
              source="primary:create"
              actions={[
                {
                  id: 'create',
                  label: t('doc.generic.newX', { label: config.label }),
                  icon: <Plus size={19} />,
                  onClick: onCreate,
                },
              ]}
            >
              <Button type="button" onClick={onCreate} className="gap-2">
                <Plus size={16} /> {t('doc.generic.newX', { label: config.label })}
              </Button>
            </ResponsiveActions>
          )
        }
      />

      <div className="flex gap-2 mb-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('doc.generic.search', { plural: config.labelPlural.toLowerCase() })}
          className="max-w-sm"
        />
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          {t('doc.common.clearFilters')}
        </Button>
      </div>

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
  const { t, locale } = useI18n();
  const { state, setState, masters, actions, computations } = doc;
  const { kind, side } = decomposeDocType(config.docType);

  const columns = useFormLineColumns({ kind, side, state, masters, actions });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildFormSteps({ fiscal: 'none' }), [locale]);
  const status = formStepStatus(
    state,
    masters,
    { partnerLabel: config.partnerLabel.toLowerCase() },
    { batches: false },
  );

  return (
    <DocumentFormLayout
      title={t('doc.generic.newX', { label: config.label })}
      submitLabel={t('doc.common.save')}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={state.isSubmitting}
      canSubmit={!state.seriesError}
      steps={steps}
      status={status}
      totals={
        <DocumentTotalsBlock
          variant="plain"
          subtotal={computations.subtotal}
          tax={computations.taxTotal}
          total={computations.total}
        />
      }
      sections={{
        header: (
          <HeaderSection
            fields={
              <FormGrid columns={2}>
                <PartnerField
                  label={config.partnerLabel}
                  value={state.partnerId}
                  onChange={setState.setPartnerId}
                  partners={masters.partners}
                  placeholder={config.partnerPlaceholder}
                />
                <DatePicker
                  label={t('doc.common.date')}
                  required
                  value={state.date}
                  onChange={(v) => setState.setDate(v ?? '')}
                />
                {masters.warehouses.length > 0 && (
                  <Field label={t('doc.lines.warehouse')}>
                    <SearchableSelect
                      value={state.warehouseId}
                      onChange={setState.setWarehouseId}
                      options={masters.warehouses.map((w) => ({ label: w.name, value: w.id }))}
                      placeholder={t('doc.common.selectWarehouse')}
                    />
                  </Field>
                )}
              </FormGrid>
            }
            side={<SeriesPeriodFields state={state} setState={setState} masters={masters} />}
          />
        ),
        lines: (
          <LinesSection
            columns={columns}
            lines={state.lines || []}
            onAdd={() => actions.addLine()}
          />
        ),
      }}
    />
  );
};

// ── DETALLE ────────────────────────────────────────────────────────

const DocumentDetail: React.FC<{
  config: ReturnType<typeof getDocTypeConfig>;
  doc: any;
  onBack: () => void;
  onClone: (payload: { header: any; lines: any[] }) => void;
}> = ({ config, doc, onBack, onClone }) => {
  const { t } = useI18n();
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
        <ArrowLeft size={16} /> {t('doc.common.back')}
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
            <span className="text-slate-500">{t('doc.common.status')}:</span>{' '}
            <Badge>{doc.status}</Badge>
          </div>
          <div>
            <span className="text-slate-500">{t('doc.common.date')}:</span> {doc.date}
          </div>
          <div>
            <span className="text-slate-500">{t('doc.lines.total')}:</span>{' '}
            <span className="font-bold">{fmt.money(doc.total)}</span>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-bold mb-3">{t('doc.steps.lines')}</h3>
        {isMobile ? (
          <MobileLineCards columns={detailColumns} lines={doc.lines || []} />
        ) : (
          <Table responsive="scroll" columns={detailColumns} data={doc.lines || []} />
        )}
      </Card>
    </div>
  );
};

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────

const Documents: React.FC = () => {
  const { docType } = useParams<{ docType: string }>();
  const { t, locale } = useI18n();
  const { token, user } = useAuth();
  const toast = useToast();

  // Tipos registrados en el servidor (SQ, plugins...) — los 6 core resuelven
  // síncrono vía los mapas estáticos; el resto espera al fetch del registry.
  const { loading: typesLoading } = useDocTypes();
  const config = useMemo(() => {
    if (!docType) return null;
    return getDocTypeConfig(docType as DocType) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, typesLoading, locale]);

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
        toast.error(t('doc.common.loadError'));
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
      toast.error((e instanceof Error ? e.message : undefined) || t('doc.common.loadError'));
    }
  };

  const handleSubmit = async () => {
    if (!doc.state.partnerId || !doc.state.seriesId || !doc.state.periodId) {
      toast.error(t('doc.common.requiredFields'));
      return;
    }
    if (doc.state.lines.length === 0) {
      toast.error(t('doc.common.addOneLine'));
      return;
    }
    try {
      await doc.actions.submitDocument();
      toast.success(t('doc.generic.created', { label: config?.label ?? '' }));
      notifyDocChange(config.docType);
      setView('list');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('doc.common.createError'));
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
        <h2>{t('doc.generic.invalidType', { type: docType ?? '' })}</h2>
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
