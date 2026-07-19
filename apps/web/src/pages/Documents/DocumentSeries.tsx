import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Loader, useToast, Badge, FilterBar } from '@openfactu/ui';
import { useDataTable } from '@openfactu/common';
import { useLocation } from 'react-router-dom';
import { FileDigit, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ContextMenu } from '../../components/common/ContextMenu';
import { withRowContextMenu } from '../../components/common/withRowContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };
      const [seriesRes, periodsRes] = await Promise.all([
        fetch('/api/series', { headers }),
        fetch('/api/periods', { headers }),
      ]);
      const sData = await seriesRes.json();
      const pData = await periodsRes.json();
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
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
        body: JSON.stringify({
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
        }),
      });
      if (res.ok) {
        setName('');
        setPrefix('');
        setNumberingMode('AUTO');
        setFirstNumber(1);
        setLastNumber(99999);
        fetchData();
        toast.success('Serie creada correctamente');
      } else {
        const d = await res.json();
        toast.error(`Error: ${d.error}`);
      }
    } catch (err) {
      toast.error('Error al crear Serie');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/series/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      if (res.ok) {
        fetchData();
        toast.success('Serie eliminada');
      }
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
          options: [
            { label: 'Pedido Compra', value: 'PO' },
            { label: 'Albarán Compra', value: 'PDN' },
            { label: 'Factura Compra', value: 'PINV' },
            { label: 'Pedido Venta', value: 'SO' },
            { label: 'Albarán Venta', value: 'SDN' },
            { label: 'Factura Venta', value: 'SINV' },
          ],
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
      cell: (c: any) => {
        const types: Record<string, string> = {
          PO: 'Pedidos Compra',
          PDN: 'Albarán Compra',
          PINV: 'Factura Compra',
          SO: 'Pedido Venta',
          SDN: 'Albarán Venta',
          SINV: 'Factura Venta',
        };
        return types[c.docType] || c.docType;
      },
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
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              required
              className="w-full h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 mt-1"
            >
              <option value="PO">Pedido Compra (PO)</option>
              <option value="PDN">Albarán Compra (PDN)</option>
              <option value="PINV">Factura Compra (PINV)</option>
              <hr />
              <option value="SO">Pedido Venta (SO)</option>
              <option value="SDN">Albarán Venta (SDN)</option>
              <option value="SINV">Factura Venta (SINV)</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Numeración
            </label>
            <select
              value={numberingMode}
              onChange={(e) => setNumberingMode(e.target.value)}
              required
              className="w-full h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 mt-1"
            >
              <option value="AUTO">Automática</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Aplica al Periodo
            </label>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              required
              className="w-full h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 mt-1"
            >
              <option value="">Seleccionar...</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
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
              options: [
                { label: 'Pedido Compra', value: 'PO' },
                { label: 'Albarán Compra', value: 'PDN' },
                { label: 'Factura Compra', value: 'PINV' },
                { label: 'Pedido Venta', value: 'SO' },
                { label: 'Albarán Venta', value: 'SDN' },
                { label: 'Factura Venta', value: 'SINV' },
              ],
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
