import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Loader, useToast, Badge, Modal } from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import StockDetailModal from '../components/StockDetailModal';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Package, Plus, Trash2, Search, Settings2, Boxes, Scale, Tag } from 'lucide-react';
import { usePluginListColumns } from '@/components/plugin-fields';
import { SearchableSelect } from '@openfactu/ui';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { LabelPrintButton } from '@/modules/document-templates/components/LabelPrintButton';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { validateBarcode, generateEan13 } from '@/utils/barcodeValidation';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { BarcodeScanButton } from '@/components/scanner/BarcodeScanButton';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { categoriesApi, itemsApi, uomApi, warehousesApi, zonesApi } from '../api';
import type { Category } from '../domain/category';
import type { Item } from '../domain/item';
import type { ItemUomAlternative, Uom } from '../domain/uom';
import type { Warehouse, Zone } from '../domain/warehouse';

const AlternativeUomsPanel: React.FC<{
  itemId?: string;
  baseUomId: string;
  uoms: Uom[];
}> = ({ itemId, baseUomId, uoms }) => {
  const [alternatives, setAlternatives] = useState<ItemUomAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUomId, setNewUomId] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const fetchAlts = async () => {
    if (!itemId) return setAlternatives([]);
    setLoading(true);
    try {
      const data = await itemsApi.listUoms(itemId);
      setAlternatives(Array.isArray(data) ? data : []);
    } catch (err) {
      setAlternatives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const handleAdd = async () => {
    if (!itemId || !newUomId || !newFactor) return;
    setSaving(true);
    try {
      await itemsApi.addUom(itemId, { uomId: newUomId, factor: Number(newFactor) });
      toast.success('Unidad alternativa añadida');
      setNewUomId('');
      setNewFactor('');
      fetchAlts();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al añadir unidad alternativa');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!itemId) return;
    try {
      await itemsApi.removeUom(itemId, id);
      toast.success('Eliminado');
      fetchAlts();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="p-4">
      {loading ? (
        <div className="p-4 text-center">
          <Loader />
        </div>
      ) : (
        <>
          {alternatives.length > 0 ? (
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-2">Unidad</th>
                  <th className="py-2">Factor</th>
                  <th className="py-2">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {alternatives.map((a: any) => (
                  <tr key={a.id || a.uomId} className="border-t border-slate-100">
                    <td className="py-2">{a.code || a.name || a.uomId}</td>
                    <td className="py-2">{a.factor}</td>
                    <td className="py-2 w-20">
                      {!a.isBase && (
                        <Button size="sm" variant="secondary" onClick={() => handleRemove(a.id)}>
                          Eliminar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-center text-sm text-slate-400">Sin unidades alternativas configuradas.</div>
          )}

          <div className="pt-4 border-t mt-4">
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1 block">Unidad</label>
                <SearchableSelect
                  value={newUomId}
                  onChange={setNewUomId}
                  options={uoms.map((u: any) => ({ label: `${u.code} — ${u.name}`, value: u.id }))}
                  placeholder="Seleccionar UoM..."
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1 block">Factor</label>
                <Input value={newFactor} onChange={(e) => setNewFactor(e.target.value)} placeholder="1.00" />
              </div>
              <div>
                <Button onClick={handleAdd} disabled={!newUomId || !newFactor} isLoading={saving} className="w-full">Añadir</Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const Items: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const location = useLocation();
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
  // Form State
  const [showItemModal, setShowItemModal] = useState(false);
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [uomId, setUomId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [basePrice, setBasePrice] = useState('0');
  const [manageBy, setManageBy] = useState('N'); // N: None, B: Batch, S: Serial
  const [kind, setKind] = useState<'product' | 'box'>('product');
  const [boxLengthMm, setBoxLengthMm] = useState<string>('');
  const [boxWidthMm, setBoxWidthMm] = useState<string>('');
  const [boxHeightMm, setBoxHeightMm] = useState<string>('');
  const [boxMaxWeightKg, setBoxMaxWeightKg] = useState<string>('');
  const [boxTareWeightKg, setBoxTareWeightKg] = useState<string>('');
  const [defaultWarehouseId, setDefaultWarehouseId] = useState('');
  const [defaultZoneId, setDefaultZoneId] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'generales' | 'logistica' | 'unidades'>('generales');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
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
  }, [user?.tenantId]);

  useEffect(() => {
    if (selectedItem) {
      setCode(selectedItem.code || '');
      setBarcode(selectedItem.barcode || '');
      setName(selectedItem.name || '');
      setUomId(selectedItem.uomId || '');
      setCategoryId(selectedItem.categoryId || '');
      setBasePrice(selectedItem.basePrice?.toString() || '0');
      setManageBy(selectedItem.manageBy || 'N');
      setKind(selectedItem.kind === 'box' ? 'box' : 'product');
      setBoxLengthMm(selectedItem.boxLengthMm?.toString() || '');
      setBoxWidthMm(selectedItem.boxWidthMm?.toString() || '');
      setBoxHeightMm(selectedItem.boxHeightMm?.toString() || '');
      setBoxMaxWeightKg(selectedItem.boxMaxWeightKg?.toString() || '');
      setBoxTareWeightKg(selectedItem.boxTareWeightKg?.toString() || '');
      setDefaultWarehouseId(selectedItem.defaultWarehouseId || '');
      setDefaultZoneId(selectedItem.defaultZoneId || '');
      // Extraer los campos custom (`p_*`) del item para pre-rellenar el panel.
      const custom: Record<string, any> = {};
      for (const [k, v] of Object.entries(selectedItem)) {
        if (k.startsWith('p_')) custom[k] = v;
      }
      setCustomValues(custom);
      setActiveTab('generales');
    } else {
      setCode('');
      setBarcode('');
      setName('');
      setUomId('');
      setCategoryId('');
      setBasePrice('0');
      setManageBy('N');
      setKind('product');
      setBoxLengthMm('');
      setBoxWidthMm('');
      setBoxHeightMm('');
      setBoxMaxWeightKg('');
      setBoxTareWeightKg('');
      setDefaultWarehouseId('');
      setDefaultZoneId('');
      setCustomValues({});
    }
  }, [selectedItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Aviso (no bloqueante) si el barcode tiene formato inválido. El usuario
    // puede confirmar para guardarlo igualmente — algunos códigos legacy o
    // internos no siguen EAN/UPC y siguen siendo válidos para imprimir.
    if (barcode.trim()) {
      const v = validateBarcode(barcode);
      if (!v.valid) {
        const ok = confirm(
          `El código de barras parece inválido (${v.format}: ${v.reason}). ¿Guardar de todos modos?`,
        );
        if (!ok) return;
      }
    }
    setIsSubmitting(true);
    try {
      const payload = {
        code,
        barcode: barcode.trim() || null,
        name,
        uomId,
        categoryId: categoryId || null,
        basePrice: parseFloat(basePrice),
        manageBy,
        kind,
        boxLengthMm: kind === 'box' && boxLengthMm ? Number(boxLengthMm) : null,
        boxWidthMm: kind === 'box' && boxWidthMm ? Number(boxWidthMm) : null,
        boxHeightMm: kind === 'box' && boxHeightMm ? Number(boxHeightMm) : null,
        boxMaxWeightKg: kind === 'box' && boxMaxWeightKg ? Number(boxMaxWeightKg) : null,
        boxTareWeightKg: kind === 'box' && boxTareWeightKg ? Number(boxTareWeightKg) : null,
        defaultWarehouseId: defaultWarehouseId || null,
        defaultZoneId: defaultZoneId || null,
        ...customValues, // campos personalizados p_*
      };
      const saved = selectedItem
        ? await itemsApi.update(selectedItem.id, payload)
        : await itemsApi.create(payload);

      // Verificación adicional: nos aseguramos de que el barcode realmente
      // quedó guardado igual a lo que mandamos. Si difiere (NULL, recortado,
      // etc.) avisamos al usuario.
      const sentBarcode = barcode.trim() || null;
      if (saved && 'barcode' in saved && saved.barcode !== sentBarcode) {
        toast.error(
          `Guardado, pero el barcode quedó como ${JSON.stringify(saved.barcode)} (enviaste ${JSON.stringify(sentBarcode)})`,
        );
      }
      if (!selectedItem) {
        setCode('');
        setBarcode('');
        setName('');
        setBasePrice('0');
      } else {
        setSelectedItem(null);
      }
      fetchData();
      toast.success(selectedItem ? 'Artículo actualizado' : 'Artículo maestro creado');
    } catch (err) {
      // El mensaje del ApiError trae el error completo del backend (puede
      // incluir el error SQL real: "column ... does not exist", etc.).
      console.error('[Items.handleSubmit] error:', err);
      toast.error(`Error: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
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
            onClick={() => canWrite && setSelectedItem(i)}
            disabled={!canWrite}
            className={`p-2 transition-all rounded-lg ${canWrite ? 'text-slate-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10' : 'text-slate-100 cursor-not-allowed grayscale'}`}
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
      label: 'Editar',
      icon: <Settings2 size={14} />,
      disabled: !canWrite,
      onClick: () => canWrite && setSelectedItem(i),
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
                  setSelectedItem(null);
                  setShowItemModal(true);
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
        defaultUnified={true}
      />

      <Modal
        isOpen={showItemModal || !!selectedItem}
        onClose={() => {
          setShowItemModal(false);
          setSelectedItem(null);
        }}
        title={selectedItem ? 'Editar Maestro' : 'Nuevo Artículo'}
        subtitle="Define las propiedades base del producto."
        maxWidth="lg"
      >
        <div className="pt-2">
          {/* Tabs del Artículo */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 mb-6">
            <button
              onClick={() => setActiveTab('generales')}
              className={`flex-1 pb-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'generales' ? 'border-blue-500 text-blue-600 dark:text-blue-300' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-600'}`}
            >
              Gral
            </button>
            <button
              onClick={() => setActiveTab('logistica')}
              className={`flex-1 pb-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'logistica' ? 'border-blue-500 text-blue-600 dark:text-blue-300' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-600'}`}
            >
              Logística
            </button>
            <button
              onClick={() => setActiveTab('unidades')}
              className={`flex-1 pb-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'unidades' ? 'border-blue-500 text-blue-600 dark:text-blue-300' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-600'}`}
            >
              Unidades
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {activeTab === 'generales' && (
              <div className="space-y-4 animate-in slide-in-from-left-2 duration-200">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Input
                      label="Código"
                      placeholder={
                        categories.find((c) => c.id === categoryId)?.codePrefix
                          ? `Auto (Ej: ${categories.find((c) => c.id === categoryId)?.codePrefix}-000001)`
                          : 'ART-001'
                      }
                      value={
                        categories.find((c) => c.id === categoryId)?.codePrefix && !selectedItem
                          ? ''
                          : code
                      }
                      disabled={
                        !!selectedItem || !!categories.find((c) => c.id === categoryId)?.codePrefix
                      }
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <div className="flex-[2]">
                    <Input
                      label="Nombre del Producto"
                      placeholder="Ej: Laptop Pro"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        label="Código de Barras (EAN / UPC / Code128)"
                        placeholder="Ej: 8412345678905 — vacío si el artículo no tiene"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // Si ya hay algo numérico parcial (8/11/12 dígitos sin
                        // check), completamos preservando lo que escribió. Si
                        // está vacío o no es numérico, generamos uno nuevo
                        // determinista a partir del code/name del artículo.
                        const seed = barcode.trim() || code || name || (selectedItem?.id ?? '');
                        const generated = generateEan13(seed);
                        setBarcode(generated);
                      }}
                      title="Generar EAN-13 válido (a partir del código del artículo si está vacío)"
                      className="h-9 px-3 text-xs font-bold rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                    >
                      Generar
                    </button>
                  </div>
                  {(() => {
                    if (!barcode.trim()) {
                      return (
                        <div className="text-[10px] text-slate-400 mt-1 ml-1">
                          Sin código de barras. Pulsa <strong>Generar</strong> para crear uno.
                        </div>
                      );
                    }
                    const v = validateBarcode(barcode);
                    if (v.valid) {
                      return (
                        <div className="text-[10px] mt-1 ml-1 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <span>✓</span>
                          <span>Formato detectado: {v.format}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-[10px] mt-1 ml-1 text-rose-500 dark:text-rose-400 flex flex-wrap items-center gap-1">
                        <span>⚠</span>
                        <span>
                          {v.format} inválido — {v.reason}
                        </span>
                        {v.suggested && (
                          <button
                            type="button"
                            onClick={() => setBarcode(v.suggested!)}
                            className="ml-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-mono"
                          >
                            Usar {v.suggested}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    Categoría (Define Prefijo)
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">-- Sin Categoría --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.codePrefix ? `(${c.codePrefix}-)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    Unidad Base
                  </label>
                  <select
                    value={uomId}
                    onChange={(e) => setUomId(e.target.value)}
                    required
                    className="flex h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">-- Seleccionar --</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Precio Base (€)"
                  type="number"
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'logistica' && (
              <div className="space-y-6 animate-in slide-in-from-right-2 duration-200">
                {/* Tipo de artículo — producto normal o caja de embalaje. Las cajas se
                    muestran en el selector "Caja" del modal de Paquetes. */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50  border border-slate-200 dark:border-slate-700/50">
                  <label className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-3 block">
                    Tipo de artículo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'product', label: 'Producto', desc: 'Artículo normal de stock' },
                      { id: 'box', label: 'Caja', desc: 'Embalaje usado en Logística → Paquetes' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setKind(opt.id as 'product' | 'box')}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          kind === opt.id
                            ? 'bg-emerald-600 border-emerald-700 text-white shadow-md'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                        }`}
                      >
                        <p className="text-xs font-bold leading-none">{opt.label}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            kind === opt.id
                              ? 'text-emerald-100'
                              : 'text-slate-400 dark:text-slate-500 font-medium'
                          }`}
                        >
                          {opt.desc}
                        </p>
                      </button>
                    ))}
                  </div>

                  {kind === 'box' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Dimensiones de la caja (opcional)
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                            Largo (mm)
                          </label>
                          <input
                            type="number"
                            value={boxLengthMm}
                            onChange={(e) => setBoxLengthMm(e.target.value)}
                            className="w-full h-9 px-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                            Ancho (mm)
                          </label>
                          <input
                            type="number"
                            value={boxWidthMm}
                            onChange={(e) => setBoxWidthMm(e.target.value)}
                            className="w-full h-9 px-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                            Alto (mm)
                          </label>
                          <input
                            type="number"
                            value={boxHeightMm}
                            onChange={(e) => setBoxHeightMm(e.target.value)}
                            className="w-full h-9 px-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                            Peso máx. (kg)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={boxMaxWeightKg}
                            onChange={(e) => setBoxMaxWeightKg(e.target.value)}
                            className="w-full h-9 px-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                            Tara (kg)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={boxTareWeightKg}
                            onChange={(e) => setBoxTareWeightKg(e.target.value)}
                            className="w-full h-9 px-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50  border border-slate-200 dark:border-slate-700/50">
                  <label className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-4 block">
                    Trazabilidad Obligatoria
                  </label>
                  <div className="space-y-2">
                    {[
                      {
                        id: 'N',
                        label: 'Gestión Estándar',
                        desc: 'Sin control de lotes ni series.',
                      },
                      {
                        id: 'B',
                        label: 'Control por Lotes',
                        desc: 'Obligatorio en cada movimiento.',
                      },
                      {
                        id: 'S',
                        label: 'Control por Series',
                        desc: 'Identificación única del producto.',
                      },
                    ].map((opt) => (
                      <div
                        key={opt.id}
                        onClick={() => setManageBy(opt.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${manageBy === opt.id ? 'bg-blue-600 border-blue-700 text-white shadow-md' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}
                      >
                        <p className="text-xs font-bold leading-none">{opt.label}</p>
                        <p
                          className={`text-[10px] mt-1 ${manageBy === opt.id ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500 font-medium'}`}
                        >
                          {opt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50  border border-slate-200 dark:border-slate-700/50">
                  <label className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-3 block">
                    Ubicación por defecto
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                    Cuando selecciones este artículo en un pedido o albarán se rellenará
                    automáticamente su almacén y ubicación. Puedes cambiarlo por línea.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                        Almacén
                      </label>
                      <select
                        value={defaultWarehouseId}
                        onChange={(e) => {
                          setDefaultWarehouseId(e.target.value);
                          // Si la zona guardada no pertenece al nuevo almacén, limpiarla
                          const stillValid = zones.find(
                            (z: any) => z.id === defaultZoneId && z.warehouseId === e.target.value,
                          );
                          if (!stillValid) setDefaultZoneId('');
                        }}
                        className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                      >
                        <option value="">(Sin almacén)</option>
                        {warehouses.map((w: any) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                        Ubicación / Bin
                      </label>
                      <select
                        value={defaultZoneId}
                        onChange={(e) => setDefaultZoneId(e.target.value)}
                        disabled={!defaultWarehouseId}
                        className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      >
                        <option value="">(Sin ubicación)</option>
                        {zones
                          .filter(
                            (z: any) => !defaultWarehouseId || z.warehouseId === defaultWarehouseId,
                          )
                          .map((z: any) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'unidades' && (
              <AlternativeUomsPanel itemId={selectedItem?.id} baseUomId={uomId} uoms={uoms} />
            )}

            <PluginFieldsPanel
              tableName="Item"
              values={customValues}
              onChange={(k, v) => setCustomValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
              title="Campos personalizados"
            />

            {selectedItem?.id && (
              <div className="mt-4">
                <AttachmentsPanel entityType="Item" entityId={selectedItem.id} />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowItemModal(false);
                  setSelectedItem(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader size="sm" variant="white" />
                ) : selectedItem ? (
                  'Guardar Cambios'
                ) : (
                  'Crear Artículo Maestro'
                )}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
};
