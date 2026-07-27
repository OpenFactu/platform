import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Badge, PageHeader, useToast } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import StockDetailModal from '../components/StockDetailModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Package, Plus, Search, Settings2, Boxes, Tag, Copy } from 'lucide-react';
import { usePluginListColumns } from '@/components/plugin-fields';
import { LabelPrintButton } from '@/modules/document-templates/components/LabelPrintButton';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { BarcodeScanButton } from '@/components/scanner/BarcodeScanButton';
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
            className="w-8 h-8 rounded-lg object-cover border border-border-default"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-bg-muted border border-border-default flex items-center justify-center text-fg-subtle">
            <Package size={14} />
          </div>
        );
      },
    },
    /*
     * Tipografía: antes TODAS las celdas iban en `font-black`/`font-bold`, así
     * que ninguna destacaba y la tabla se leía como un bloque. Ahora solo el
     * nombre del artículo lleva peso; el resto va en regular y la jerarquía la
     * marcan el tamaño y el color. Los números van en `tabular-nums` para que
     * las columnas cuadren en vertical.
     */
    {
      header: 'Código / Nombre',
      sortable: true,
      sortAccessor: (i: any) => `${i.code} ${i.name}`.toLowerCase(),
      accessor: (i: any) => (
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-tight text-fg-subtle">
            {i.code}
          </span>
          <span className="font-medium text-fg-default text-sm leading-tight">{i.name}</span>
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
          <span className="font-mono text-[11px] text-fg-muted uppercase">{uom?.code || '?'}</span>
        );
      },
    },
    {
      header: 'Gestión',
      accessor: (i: any) =>
        // 'N' (estándar) no se marca: es el caso por defecto y un distintivo en
        // cada fila sería ruido. Solo se señala lo que se sale de la norma.
        i.manageBy === 'B' ? (
          <Badge variant="warning">Lote</Badge>
        ) : i.manageBy === 'S' ? (
          <Badge variant="info">Serie</Badge>
        ) : (
          <span className="text-fg-subtle text-xs">—</span>
        ),
    },
    {
      header: 'Comprometido',
      align: 'right' as const,
      accessor: (i: any) => (
        <span className="text-fg-subtle font-mono text-[11px] tabular-nums">
          -{Number(i.committed).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Pedido',
      align: 'right' as const,
      accessor: (i: any) => (
        <span className="text-fg-muted font-mono text-[11px] tabular-nums">
          +{Number(i.ordered).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Disponible',
      align: 'right' as const,
      accessor: (i: any) => {
        const available = Number(i.stock) - Number(i.committed) + Number(i.ordered);
        // El rojo del negativo sí es semántico (no hay stock disponible), así
        // que se queda; el positivo no necesita color propio.
        return (
          <span
            className={`font-mono tabular-nums ${available > 0 ? 'text-fg-default' : 'text-danger-fg'}`}
          >
            {available.toFixed(2)}
          </span>
        );
      },
    },
    {
      header: 'Precio Base',
      align: 'right' as const,
      accessor: (i: any) => (
        <span className="font-mono tabular-nums text-fg-body">{i.basePrice}€</span>
      ),
    },
    {
      header: 'Stock Total',
      align: 'right' as const,
      accessor: (i: any) => (
        <span
          className={`font-mono tabular-nums ${i.stock > 0 ? 'text-fg-default' : 'text-danger-fg'}`}
        >
          {i.stock.toFixed(2)}
        </span>
      ),
    },
    {
      // La impresión de etiquetas es un componente con su propio modal, no un
      // simple onClick, así que no cabe en `rowActions` y se queda en su
      // columna. El resto de acciones de la antigua columna "Acciones" viven
      // ahora en el menú de fila.
      header: '',
      id: 'label',
      align: 'right' as const,
      accessor: (i: any) => (
        <div className="flex items-center justify-end gap-1">
          <LabelPrintButton
            params={{ itemId: i.id }}
            title="Imprimir etiqueta del artículo"
            className="p-2 text-fg-subtle hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all"
            triggerLabel={<Tag size={14} />}
          />
        </div>
      ),
    },
  ];

  // Columnas extra aportadas por campos personalizados. Se insertan ANTES
  // de la última columna del core (etiquetas) para que esa quede a la
  // derecha del todo.
  const pluginCols = usePluginListColumns('Item');
  const labelCol = columns[columns.length - 1];
  const restCols = columns.slice(0, -1);
  const allColumns = [...restCols, ...pluginCols, labelCol];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (i: any): RowAction[] => [
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
      <PageHeader
        title="Catálogo de Artículos"
        subtitle="Gestión de datos maestros de productos y servicios."
        icon={<Package size={18} />}
        size="lg"
        actions={
          <div className="relative group w-full md:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle group-focus-within:text-accent transition-colors"
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
        }
      />

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
            {/* El fichero de artículos es la tabla más ancha de la app y se
                lee de un vistazo, no se escanea: va en densidad `comfy` (fila
                y texto más grandes) y con la primera columna fija, para no
                perder de vista el código al desplazarse en horizontal. */}
            <Table
              columns={allColumns}
              data={filteredItems}
              isLoading={loading}
              rowActions={rowActions}
              density="comfy"
              stickyFirstColumn
            />
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
