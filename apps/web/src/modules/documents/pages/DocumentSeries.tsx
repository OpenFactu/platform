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
  SearchableSelect,
} from '@openfactu/ui';
import { useDataTable } from '@openfactu/common';
import { useLocation } from 'react-router-dom';
import { FileDigit, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { seriesApi } from '../api';
import { crudApi } from '@/shared/api';
import { useDocTypes } from '../domain/docTypeRegistry';

// Fallback estático mientras llega (o si falla) GET /api/documents/types —
// mismas etiquetas que se mostraban hardcodeadas antes del registry.
const FALLBACK_DOC_TYPE_OPTIONS = [
  { label: 'Pedido Compra', value: 'PO' },
  { label: 'Albarán Compra', value: 'PDN' },
  { label: 'Factura Compra', value: 'PINV' },
  { label: 'Pedido Venta', value: 'SO' },
  { label: 'Albarán Venta', value: 'SDN' },
  { label: 'Factura Venta', value: 'SINV' },
];

export const DocumentSeries: React.FC = () => {
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
      ? serverDocTypes.map((t) => ({ label: t.label, value: t.docType }))
      : FALLBACK_DOC_TYPE_OPTIONS;
  const docTypeLabel = (dt: string) =>
    serverDocTypes.find((t) => t.docType === dt)?.label ??
    FALLBACK_DOC_TYPE_OPTIONS.find((o) => o.value === dt)?.label ??
    dt;

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
      toast.success('Serie creada correctamente');
    } catch (err) {
      toast.error(err instanceof Error ? `Error: ${err.message}` : 'Error al crear Serie');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await seriesApi.remove(id);
      fetchData();
      toast.success('Serie eliminada');
    } catch (err) {
      toast.error('Error al eliminar');
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
          label: 'Tipo',
          options: docTypeOptions,
        },
        {
          key: 'numberingMode',
          type: 'select',
          label: 'Modo',
          options: [
            { label: 'Automática', value: 'AUTO' },
            { label: 'Manual', value: 'MANUAL' },
          ],
        },
        {
          key: 'periodId',
          type: 'select',
          label: 'Periodo',
          options: periods.map((p: any) => ({ label: p.code, value: p.id })),
        },
      ],
    });

  const columns = [
    {
      header: 'Serie (Name)',
      sortable: true,
      primary: true,
      sortAccessor: (i: any) => i.name ?? '',
      cell: (c: any) => c.name || '—',
    },
    {
      header: 'Tipo',
      cell: (c: any) => docTypeLabel(c.docType),
    },
    {
      header: 'Modo',
      cell: (c: any) => (
        <Badge variant={c.numberingMode === 'MANUAL' ? 'warning' : 'neutral'}>
          {c.numberingMode === 'MANUAL' ? 'Manual' : 'Automática'}
        </Badge>
      ),
    },
    { header: 'Periodo', cell: (c: any) => periods.find((p) => p.id === c.periodId)?.code || '-' },
    {
      header: 'Rango Visual',
      cell: (c: any) =>
        c.numberingMode === 'MANUAL' ? (
          <span className="text-slate-400 text-xs italic">Manual</span>
        ) : (
          <span className="font-mono text-xs">
            {c.prefix ? `${c.prefix}-` : ''}
            {c.firstNumber} ... {c.prefix ? `${c.prefix}-` : ''}
            {c.lastNumber}
          </span>
        ),
    },
    {
      header: 'Siguiente Num',
      cell: (c: any) =>
        c.numberingMode === 'MANUAL' ? (
          <span className="text-slate-400">—</span>
        ) : (
          <Badge variant="neutral" className="font-mono">
            {c.nextNumber}
          </Badge>
        ),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (c: any) => (
        <button
          onClick={() => canDelete && handleDelete(c.id)}
          disabled={!canDelete}
          className={`transition-colors ${canDelete ? 'text-slate-400 dark:text-slate-500 hover:text-red-500' : 'text-slate-100 cursor-not-allowed grayscale'}`}
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (c: any) => [
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(c.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
          <FileDigit className="text-blue-600 dark:text-blue-300" size={32} />
          Series Documentales
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          Configura los rangos de numeración para cada tipo de documento del sistema.
        </p>
      </div>

      <Card className="p-6 border-blue-50 shadow-lg" noPadding>
        <form
          onSubmit={handleSubmit}
          className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Nombre Serie
            </label>
            <Input
              placeholder="Ej: Principal PO"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Tipo Documento
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={docType}
                onChange={(v) => setDocType(v)}
                options={docTypeOptions.map((o) => ({
                  label: `${o.label} (${o.value})`,
                  value: o.value,
                }))}
                placeholder="Seleccionar tipo..."
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Numeración
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={numberingMode}
                onChange={(v) => setNumberingMode(v)}
                options={[
                  { label: 'Automática', value: 'AUTO' },
                  { label: 'Manual', value: 'MANUAL' },
                ]}
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Aplica al Periodo
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={periodId}
                onChange={(v) => setPeriodId(v)}
                options={periods.map((p) => ({ label: `${p.code} - ${p.name}`, value: p.id }))}
                placeholder="Seleccionar..."
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Prefijo Visual
            </label>
            <Input
              placeholder="Ej: F24"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </div>
          {numberingMode === 'MANUAL' ? (
            <div className="md:col-span-2 flex items-end">
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                Serie manual: el número de cada documento se teclea al crearlo.
              </p>
            </div>
          ) : (
            <>
              <div className="md:col-span-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Inicio de Rango
                </label>
                <Input
                  type="number"
                  value={firstNumber}
                  onChange={(e) => setFirstNumber(Number(e.target.value))}
                  required
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Límite Final
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
              Añadir Serie
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <FilterBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
          onClear={clearFilters}
          searchPlaceholder="Buscar serie por nombre…"
          config={[
            {
              key: 'docType',
              label: 'Tipo',
              type: 'select',
              options: docTypeOptions,
            },
            {
              key: 'numberingMode',
              label: 'Modo',
              type: 'select',
              options: [
                { label: 'Automática', value: 'AUTO' },
                { label: 'Manual', value: 'MANUAL' },
              ],
            },
            {
              key: 'periodId',
              label: 'Periodo',
              type: 'select',
              options: periods.map((p: any) => ({ label: p.code, value: p.id })),
            },
          ]}
        />
        <Table columns={ctxColumns} data={filteredData} isLoading={loading} />
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
