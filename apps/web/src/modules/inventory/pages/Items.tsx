import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, useToast } from '@openfactu/ui';
import StockDetailModal from '../components/StockDetailModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Package, Plus, Search, Settings2, Boxes, Tag, Copy, Trash2 } from 'lucide-react';
import { usePluginListColumns } from '@/components/plugin-fields';
import { LabelPrintButton } from '@/modules/document-templates/components/LabelPrintButton';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { BarcodeScanButton } from '@/components/scanner/BarcodeScanButton';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ItemCreateWizard } from '../components/ItemCreateWizard';
import { categoriesApi, itemsApi, uomApi, warehousesApi, zonesApi } from '../api';
import type { Category } from '../domain/category';
import type { Item } from '../domain/item';
import type { Uom } from '../domain/uom';
import type { Warehouse, Zone } from '../domain/warehouse';

/**
 * Catálogo de artículos: tabla + alta con wizard (ItemCreateWizard) y edición
 * en la ficha completa (/items/:id). La lógica del formulario vive en
 * useItemForm — aquí solo queda la lista.
 */
export const Items: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockDetailLoading, setStockDetailLoading] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<Item | null>(null);
  const [stockDetail, setStockDetail] = useState<any>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<Item | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const toast = useToast();

  // Escáner de código de barras (HID externo o cámara desde bottom-nav móvil)
  useBarcodeScanner(
    React.useCallback(
      (code: string) => {
        setSearchTerm(code);
        toast.success(`Escaneado: ${code}`);
      },
      [toast],
    ),
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const [iData, cData, uData, zData, wData] = await Promise.all([
        itemsApi.list(),
        categoriesApi.list(),
        uomApi.list(),
        zonesApi.list(),
        warehousesApi.list(),
      ]);

      setItems(Array.isArray(iData) ? iData : []);
      setCategories(Array.isArray(cData) ? cData : []);
      setUoms(Array.isArray(uData) ? uData : []);
      setZones(Array.isArray(zData) ? zData : []);
      setWarehouses(Array.isArray(wData) ? wData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openDetail = (i: Item) => navigate(`/items/${i.id}`);

  const columns = [
    {
      header: '',
      accessor: (i: any) => {
        const src = Array.isArray(i.webImages) ? i.webImages[0] : undefined;
        return src ? (
          <img
            src={src}
            alt=""
            className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600">
            <Package size={14} />
          </div>
        );
      },
    },
    {
      header: 'Código / Nombre',
      sortable: true,
      sortAccessor: (i: any) => `${i.code} ${i.name}`.toLowerCase(),
      accessor: (i: any) => (
        <div className="flex flex-col">
          <span className="font-black text-blue-600 dark:text-blue-300 text-[10px] uppercase tracking-tighter">
            {i.code}
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">
            {i.name}
          </span>
        </div>
      ),
    },
    {
      header: 'UoM',
      sortable: true,
      sortAccessor: (i: any) => uoms.find((u) => u.id === i.uomId)?.code || '',
      accessor: (i: any) => {
        const uom = uoms.find((u) => u.id === i.uomId);
        return (
          <span className="font-mono text-[11px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 uppercase">
            {uom?.code || '?'}
          </span>
        );
      },
    },
    {
      header: 'Gestión',
      accessor: (i: any) => (
        <div className="flex items-center gap-1.5">
          {i.manageBy === 'N' && (
            <span className="p-0.5 px-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 text-[9px] font-black rounded uppercase border border-slate-100 dark:border-slate-800">
              Std
            </span>
          )}
          {i.manageBy === 'B' && (
            <span className="p-0.5 px-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 text-[9px] font-black rounded uppercase border border-amber-100 dark:border-amber-500/20 italic">
              Lote
            </span>
          )}
          {i.manageBy === 'S' && (
            <span className="p-0.5 px-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[9px] font-black rounded uppercase border border-indigo-100 dark:border-indigo-500/20 italic">
              Serie
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Comprometido',
      accessor: (i: any) => (
        <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] font-bold">
          -{Number(i.committed).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Pedido',
      accessor: (i: any) => (
        <span className="text-blue-400 font-mono text-[11px] font-bold">
          +{Number(i.ordered).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Disponible',
      accessor: (i: any) => {
        const available = Number(i.stock) - Number(i.committed) + Number(i.ordered);
        return (
          <span
            className={`font-mono font-black ${available > 0 ? 'text-blue-600 dark:text-blue-300' : 'text-rose-600 dark:text-rose-300'}`}
          >
            {available.toFixed(2)}
          </span>
        );
      },
    },
    {
      header: 'Precio Base',
      accessor: (i: any) => (
        <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
          {i.basePrice}€
        </span>
      ),
    },
    {
      header: 'Stock Total',
      accessor: (i: any) => (
        <span
          className={`font-mono font-black ${i.stock > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500'}`}
        >
          {i.stock.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      accessor: (i: any) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleViewStock(i)}
            title="Ver Inventario"
            className="p-2 text-slate-300 dark:text-slate-600 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
          >
            <Boxes size={14} />
          </button>
          <LabelPrintButton
            params={{ itemId: i.id }}
            title="Imprimir etiqueta del artículo"
            className="p-2 text-slate-300 dark:text-slate-600 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all"
            triggerLabel={<Tag size={14} />}
          />
          <button
            onClick={() => openDetail(i)}
            title="Abrir ficha"
            className="p-2 text-slate-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
          >
            <Settings2 size={14} />
          </button>
          <button
            disabled={!canDelete}
            className={`p-2 transition-colors rounded-lg ${canDelete ? 'text-slate-200 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-slate-100 cursor-not-allowed grayscale'}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  // Columnas extra aportadas por campos personalizados. Se insertan ANTES
  // de la última columna del core (Acciones) para que Acciones quede a la
  // derecha del todo.
  const pluginCols = usePluginListColumns('Item');
  const actionsCol = columns[columns.length - 1];
  const restCols = columns.slice(0, -1);
  const allColumns = [...restCols, ...pluginCols, actionsCol];
  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(allColumns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (i: any) => [
    { label: 'Ver Inventario', icon: <Boxes size={14} />, onClick: () => handleViewStock(i) },
    {
      label: 'Abrir ficha',
      icon: <Settings2 size={14} />,
      onClick: () => openDetail(i),
    },
    {
      label: 'Duplicar',
      icon: <Copy size={14} />,
      disabled: !canWrite,
      onClick: () => {
        if (!canWrite) return;
        setDuplicateFrom(i);
        setWizardOpen(true);
      },
    },
  ];

  const handleViewStock = async (item: Item) => {
    setSelectedStockItem(item);
    setStockDetailLoading(true);
    try {
      setStockDetail(await itemsApi.stockDetail(item.id));
    } catch {
      toast.error('Error al cargar inventario');
    } finally {
      setStockDetailLoading(false);
    }
  };

  const filteredItems = items.filter((i) => {
    const q = searchTerm.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      i.code.toLowerCase().includes(q) ||
      (i.barcode || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tighter font-display">
            <Package className="text-blue-600 dark:text-blue-300" size={32} />
            Catálogo de Artículos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-sm">
            Gestión de datos maestros de productos y servicios.
          </p>
        </div>
        <div className="relative group flex gap-2 items-center">
          <div className="relative w-full md:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-accent transition-colors"
            />
            <Input
              placeholder="Buscar por código, nombre o barcode…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10 h-10 w-full shadow-sm"
            />
            <BarcodeScanButton
              onScan={(code) => setSearchTerm(code)}
              className="absolute right-1 top-1/2 -translate-y-1/2 !p-1.5"
              aria-label="Escanear con cámara"
            />
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {/* Tabla Maestra */}
        <div>
          <Card
            noPadding
            title="Fichero de Artículos"
            subtitle={`Mostrando ${filteredItems.length} registros empresariales.`}
            headerAction={
              <Button
                size="sm"
                onClick={() => {
                  setDuplicateFrom(null);
                  setWizardOpen(true);
                }}
                disabled={!canWrite}
                className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
              >
                <Plus size={14} /> Nuevo
              </Button>
            }
          >
            <Table columns={ctxColumns} data={filteredItems} isLoading={loading} />
            {ctxMenu.state && (
              <ContextMenu
                x={ctxMenu.state.x}
                y={ctxMenu.state.y}
                items={buildCtxItems(ctxMenu.state.data)}
                onClose={ctxMenu.close}
              />
            )}
          </Card>
        </div>
      </div>

      <StockDetailModal
        isOpen={!!selectedStockItem}
        onClose={() => setSelectedStockItem(null)}
        title={`Detalle de Inventario`}
        subtitle="Desglose por almacenes y trazabilidad."
        selectedStockItem={selectedStockItem}
        stockDetail={stockDetail}
        loading={stockDetailLoading}
      />

      <ItemCreateWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setDuplicateFrom(null);
        }}
        categories={categories}
        uoms={uoms}
        warehouses={warehouses}
        zones={zones}
        duplicateFrom={duplicateFrom}
        onCreated={(item, openFicha) => {
          fetchData();
          if (openFicha) navigate(`/items/${item.id}`);
        }}
      />
    </div>
  );
};
