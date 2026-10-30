import React, { useEffect, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Loader,
  useToast,
  Badge,
  FilterBar,
  PageHeader,
  SearchableSelect,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useDataTable } from '@openfactu/common';
import { useLocation } from 'react-router-dom';
import { FileDigit, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { seriesApi } from '../api';
import { crudApi } from '@/shared/api';
import { useDocTypes } from '../domain/docTypeRegistry';
import { useI18n } from '@/i18n/I18nContext';

// Fallback estático mientras llega (o si falla) GET /api/documents/types —
// mismas etiquetas que se mostraban hardcodeadas antes del registry. Guarda la
// clave de i18n; se traduce al pintar.
const FALLBACK_DOC_TYPE_OPTIONS = [
  { label: 'doc.types.PO', value: 'PO' },
  { label: 'doc.types.PDN', value: 'PDN' },
  { label: 'doc.types.PINV', value: 'PINV' },
  { label: 'doc.types.SO', value: 'SO' },
  { label: 'doc.types.SDN', value: 'SDN' },
  { label: 'doc.types.SINV', value: 'SINV' },
];

export const DocumentSeries: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const [series, setSeries] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [docType, setDocType] = useState('PO'); // Default Purchase Order
  const [numberingMode, setNumberingMode] = useState('AUTO'); // AUTO | MANUAL
  const [firstNumber, setFirstNumber] = useState(1);
  const [lastNumber, setLastNumber] = useState(99999);
  const [prefix, setPrefix] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  // Tipos de documento desde el registry del servidor (incluye SQ y tipos de
  // plugins); fallback estático a los 6 core mientras carga.
  const { types: serverDocTypes } = useDocTypes();
  const docTypeOptions =
    serverDocTypes.length > 0
      ? serverDocTypes.map((s) => ({ label: s.label, value: s.docType }))
      : FALLBACK_DOC_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }));
  const docTypeLabel = (dt: string) => {
    const fallback = FALLBACK_DOC_TYPE_OPTIONS.find((o) => o.value === dt)?.label;
    return serverDocTypes.find((s) => s.docType === dt)?.label ?? (fallback ? t(fallback) : dt);
  };
  const modeOptions = [
    { label: t('doc.series.auto'), value: 'AUTO' },
    { label: t('doc.series.manual'), value: 'MANUAL' },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sData, pData] = await Promise.all([
        seriesApi.list(),
        crudApi.list<any>('/api/periods'),
      ]);
      setSeries(Array.isArray(sData) ? sData : []);
      setPeriods(Array.isArray(pData) ? pData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchData();
  }, [user?.tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await seriesApi.create({
        name,
        description: `Serie ${name}`,
        periodId,
        docType,
        numberingMode,
        // En manual el rango no aplica; enviamos defaults para las columnas NOT NULL.
        firstNumber: numberingMode === 'MANUAL' ? 1 : Number(firstNumber),
        nextNumber: numberingMode === 'MANUAL' ? 1 : Number(firstNumber), // Inicialmente el siguiente es el primero
        lastNumber: numberingMode === 'MANUAL' ? 999999 : Number(lastNumber),
        prefix: prefix.trim() || null,
        suffix: null,
        isDefault: true, // Por defecto lo hacemos default
      });
      setName('');
      setPrefix('');
      setNumberingMode('AUTO');
      setFirstNumber(1);
      setLastNumber(99999);
      fetchData();
      toast.success(t('doc.series.created'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? t('doc.common.errorWithMessage', { message: err.message })
          : t('doc.series.createError'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await seriesApi.remove(id);
      fetchData();
      toast.success(t('doc.series.deleted'));
    } catch (err) {
      toast.error(t('doc.common.deleteError'));
    }
  };

  const { filteredData, searchTerm, setSearchTerm, activeFilters, setFilter, clearFilters } =
    useDataTable({
      data: series,
      searchColumns: ['name', 'description'] as any,
      filters: [
        {
          key: 'docType',
          type: 'select',
          label: t('doc.series.type'),
          options: docTypeOptions,
        },
        {
          key: 'numberingMode',
          type: 'select',
          label: t('doc.series.mode'),
          options: modeOptions,
        },
        {
          key: 'periodId',
          type: 'select',
          label: t('doc.series.period'),
          options: periods.map((p: any) => ({ label: p.code, value: p.id })),
        },
      ],
    });

  const columns = [
    {
      header: t('doc.series.colName'),
      sortable: true,
      primary: true,
      sortAccessor: (i: any) => i.name ?? '',
      cell: (c: any) => c.name || '—',
    },
    {
      header: t('doc.series.type'),
      cell: (c: any) => docTypeLabel(c.docType),
    },
    {
      header: t('doc.series.mode'),
      cell: (c: any) => (
        <Badge variant={c.numberingMode === 'MANUAL' ? 'warning' : 'neutral'}>
          {c.numberingMode === 'MANUAL' ? t('doc.series.manual') : t('doc.series.auto')}
        </Badge>
      ),
    },
    {
      header: t('doc.series.period'),
      cell: (c: any) => periods.find((p) => p.id === c.periodId)?.code || '-',
    },
    {
      header: t('doc.series.colRange'),
      cell: (c: any) =>
        c.numberingMode === 'MANUAL' ? (
          <span className="text-slate-400 text-xs italic">{t('doc.series.manual')}</span>
        ) : (
          <span className="font-mono text-xs">
            {c.prefix ? `${c.prefix}-` : ''}
            {c.firstNumber} ... {c.prefix ? `${c.prefix}-` : ''}
            {c.lastNumber}
          </span>
        ),
    },
    {
      header: t('doc.series.colNext'),
      cell: (c: any) =>
        c.numberingMode === 'MANUAL' ? (
          <span className="text-slate-400">—</span>
        ) : (
          <Badge variant="neutral" className="font-mono">
            {c.nextNumber}
          </Badge>
        ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que el permiso se declara una
  // vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (c: any): RowAction[] => [
    {
      label: t('doc.lines.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(c.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        size="lg"
        title={t('doc.series.title')}
        subtitle={t('doc.series.subtitle')}
        icon={<FileDigit size={18} />}
      />

      <Card className="border-border-subtle shadow-lg" noPadding>
        <form
          onSubmit={handleSubmit}
          className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-fg-muted uppercase">
              {t('doc.series.name')}
            </label>
            <Input
              placeholder={t('doc.series.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-fg-muted uppercase">
              {t('doc.series.docType')}
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={docType}
                onChange={(v) => setDocType(v)}
                options={docTypeOptions.map((o) => ({
                  label: `${o.label} (${o.value})`,
                  value: o.value,
                }))}
                placeholder={t('doc.series.selectType')}
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-fg-muted uppercase">
              {t('doc.series.numbering')}
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={numberingMode}
                onChange={(v) => setNumberingMode(v)}
                options={modeOptions}
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-fg-muted uppercase">
              {t('doc.series.appliesToPeriod')}
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={periodId}
                onChange={(v) => setPeriodId(v)}
                options={periods.map((p) => ({ label: `${p.code} - ${p.name}`, value: p.id }))}
                placeholder={t('doc.common.select')}
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-fg-muted uppercase">
              {t('doc.series.prefix')}
            </label>
            <Input
              placeholder={t('doc.series.prefixPlaceholder')}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </div>
          {numberingMode === 'MANUAL' ? (
            <div className="md:col-span-2 flex items-end">
              <p className="text-xs text-fg-muted italic">{t('doc.series.manualHint')}</p>
            </div>
          ) : (
            <>
              <div className="md:col-span-1">
                <label className="text-xs font-bold text-fg-muted uppercase">
                  {t('doc.series.rangeStart')}
                </label>
                <Input
                  type="number"
                  value={firstNumber}
                  onChange={(e) => setFirstNumber(Number(e.target.value))}
                  required
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-bold text-fg-muted uppercase">
                  {t('doc.series.rangeEnd')}
                </label>
                <Input
                  type="number"
                  value={lastNumber}
                  onChange={(e) => setLastNumber(Number(e.target.value))}
                  required
                />
              </div>
            </>
          )}
          <div className="md:col-span-2 flex justify-end">
            <Button
              type="submit"
              disabled={isSubmitting || periods.length === 0 || !canWrite}
              className="flex items-center gap-2 px-8 disabled:opacity-50 disabled:grayscale transition-all"
            >
              {isSubmitting ? <Loader size="sm" variant="white" /> : <Plus size={18} />}
              {t('doc.series.add')}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <FilterBar
          shortcut={false}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
          onClear={clearFilters}
          searchPlaceholder={t('doc.series.search')}
          config={[
            {
              key: 'docType',
              label: t('doc.series.type'),
              type: 'select',
              options: docTypeOptions,
            },
            {
              key: 'numberingMode',
              label: t('doc.series.mode'),
              type: 'select',
              options: modeOptions,
            },
            {
              key: 'periodId',
              label: t('doc.series.period'),
              type: 'select',
              options: periods.map((p: any) => ({ label: p.code, value: p.id })),
            },
          ]}
        />
        <Table
          className="max-md:p-3"
          columns={columns}
          data={filteredData}
          isLoading={loading}
          rowActions={rowActions}
        />
      </Card>
    </div>
  );
};
