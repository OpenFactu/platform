import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Loader, useToast, Badge, Modal } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Package, Plus, Trash2, Search, Settings2, Boxes, Scale, Tag } from 'lucide-react';
import { usePluginListColumns } from '../components/plugin-fields';
import { SearchableSelect } from '@openfactu/ui';
import { PluginFieldsPanel } from '../components/PluginFieldsPanel';
import { LabelPrintButton } from '../components/LabelPrintButton';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { validateBarcode, generateEan13 } from '../utils/barcodeValidation';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { BarcodeScanButton } from '../components/scanner/BarcodeScanButton';

const AlternativeUomsPanel: React.FC<{
  itemId?: string;
  baseUomId: string;
  uoms: any[];
  token: string | null;
  tenantId: string;
}> = ({ itemId, baseUomId, uoms, token, tenantId }) => {
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUomId, setNewUomId] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': tenantId,
    'Content-Type': 'application/json',
  };

  const fetchAlts = async () => {
    if (!itemId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/uoms`, { headers });
      const data = await res.json();
      setAlternatives(Array.isArray(data) ? data.filter((u: any) => !u.isBase) : []);
    } catch {
      setAlternatives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlts();
  }, [itemId, token]);

  const handleAdd = async () => {
    if (!newUomId || !newFactor || !itemId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${itemId}/uoms`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ uomId: newUomId, factor: Number(newFactor) }),
      });
      if (!res.ok) throw new Error('Error al añadir');
      setNewUomId('');
      setNewFactor('');
      fetchAlts();
      toast.success('Unidad alternativa añadida');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (altId: string) => {
    if (!itemId) return;
    try {
      await fetch(`/api/items/${itemId}/uoms/${altId}`, { method: 'DELETE', headers });
      fetchAlts();
      toast.success('Eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (!itemId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <Scale className="text-slate-300 dark:text-slate-600 mb-2" size={32} />
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
          Las unidades alternativas se configuran una vez creado el maestro básico.
        </p>
      </div>
    );
  }

  const baseUom = uoms.find((u) => u.id === baseUomId);
  const usedUomIds = new Set([baseUomId, ...alternatives.map((a: any) => a.uomId)]);
  const availableUoms = uoms.filter((u) => !usedUomIds.has(u.id));

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/30 rounded-xl">
        <Scale size={16} className="text-blue-600 dark:text-blue-300 shrink-0" />
        <p className="text-xs text-blue-800 dark:text-blue-200 font-medium leading-tight">
          UoM base: <strong>{baseUom?.code || '?'}</strong> ({baseUom?.name || '?'}). Las
          alternativas definen factores de conversión para permitir introducir cantidades en otras
          unidades.
        </p>
      </div>

      {loading ? (
        <div className="p-4 text-center">
          <Loader size="sm" />
        </div>
      ) : (
        <>
          {alternatives.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 text-left">Código</th>
                  <th className="pb-2 text-left">Nombre</th>
                  <th className="pb-2 text-right">Factor</th>
                  <th className="pb-2 text-right">Equivalencia</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {alternatives.map((a: any) => (
                  <tr key={a.id} className="group">
                    <td className="py-2 font-mono font-bold text-slate-700 dark:text-slate-200">
                      {a.code}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{a.name}</td>
                    <td className="py-2 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {Number(a.factor).toFixed(4)}
                    </td>
                    <td className="py-2 text-right text-[10px] text-slate-400 dark:text-slate-500 italic">
                      1 {a.code} = {Number(a.factor).toFixed(2)} {baseUom?.code || 'base'}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="grid grid-cols-[1fr_100px_40px] gap-2 items-start">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 block">
                  Unidad
                </label>
                <SearchableSelect
                  value={newUomId}
                  onChange={setNewUomId}
                  options={availableUoms.map((u: any) => ({
                    label: `${u.code} — ${u.name}`,
                    value: u.id,
                  }))}
                  placeholder="Seleccionar UoM..."
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 block">
                  Factor
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={newFactor}
                  onChange={(e) => setNewFactor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder="24"
                  className="text-center font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-transparent mb-1 block">
                  +
                </label>
                <Button
                  onClick={handleAdd}
                  disabled={!newUomId || !newFactor || saving}
                  isLoading={saving}
                  className="w-full h-9 px-0 flex items-center justify-center"
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          </div>

          {alternatives.length === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic text-center pt-2">
              Sin unidades alternativas configuradas. Añade una arriba.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export const Items: React.FC = () => {
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
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockDetailLoading, setStockDetailLoading] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<any | null>(null);
  const [stockDetail, setStockDetail] = useState<any>(null);
  const [zones, setZones] = useState<any[]>([]);
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
  const [warehouses, setWarehouses] = useState<any[]>([]);
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
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };
      const [iRes, cRes, uRes, zRes, wRes] = await Promise.all([
        fetch('/api/items', { headers }),
        fetch('/api/categories', { headers }),
        fetch('/api/uom', { headers }),
        fetch('/api/zones', { headers }),
        fetch('/api/warehouses', { headers }),
      ]);
      const iData = await iRes.json();
      const cData = await cRes.json();
      const uData = await uRes.json();
      const zData = await zRes.json();
      const wData = await wRes.json();

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
      const method = selectedItem ? 'PATCH' : 'POST';
      const url = selectedItem ? `/api/items/${selectedItem.id}` : '/api/items';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
        body: JSON.stringify({
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
        }),
      });

      if (res.ok) {
        // Verificación adicional: leemos lo que devolvió el backend y nos
        // aseguramos de que el barcode realmente quedó guardado igual a lo que
        // mandamos. Si difiere (NULL, recortado, etc.) avisamos al usuario.
        let saved: any = null;
        try {
          saved = await res.clone().json();
        } catch {
          /* el endpoint puede devolver vacío en algunos métodos */
        }
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
      } else {
        const errData = await res.json().catch(() => ({}));
        // Mostramos el mensaje completo del backend (puede traer el error
        // SQL real: "column ... does not exist", "duplicate key", etc.).
        const detailed = errData.error || errData.message || `HTTP ${res.status}`;
        console.error('[Items.handleSubmit] error:', errData);
        toast.error(`Error: ${detailed}`);
      }
    } catch (err: any) {
      console.error('[Items.handleSubmit] network/parse error:', err);
      toast.error(`Error de conexión: ${err?.message || err}`);
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
            {uom?.symbol || '?'}
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

  const handleViewStock = async (item: any) => {
    setSelectedStockItem(item);
    setStockDetailLoading(true);
    try {
      const res = await fetch(`/api/items/${item.id}/stock`, {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      const data = await res.json();
      setStockDetail(data);
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
            <Table columns={allColumns} data={filteredItems} isLoading={loading} />
          </Card>
        </div>
      </div>

      <Modal
        isOpen={!!selectedStockItem}
        onClose={() => setSelectedStockItem(null)}
        title={`Detalle de Inventario: ${selectedStockItem?.name}`}
        subtitle="Desglose por almacenes y trazabilidad."
        maxWidth="2xl"
      >
        {stockDetailLoading ? (
          <div className="flex justify-center p-10">
            <Loader />
          </div>
        ) : (
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Boxes size={12} className="text-blue-500 dark:text-blue-300" />
                Existencias por Almacén
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stockDetail?.warehouseStock?.length > 0 ? (
                  stockDetail.warehouseStock.map((ws: any) => (
                    <div
                      key={ws.warehouseId}
                      className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex justify-between items-center group hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition-all"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight leading-none mb-1">
                          {ws.warehouseName}
                        </p>
                        <Badge
                          variant="info"
                          className="text-[8px] py-0 px-1 border-blue-100 dark:border-blue-500/20 bg-blue-50/50 text-blue-600 dark:text-blue-300 font-black"
                        >
                          STOCK FÍSICO
                        </Badge>
                      </div>
                      <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tighter leading-none">
                        {Number(ws.stock).toFixed(2)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-8 text-center bg-slate-50/30 dark:bg-slate-800/30 rounded-xl border-dashed border-2 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                    Sin existencias físicas en ningún almacén.
                  </div>
                )}
              </div>
            </div>

            {stockDetail?.zoneStock?.length > 0 && (
              <div className="bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 italic">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Package size={12} className="text-blue-500 dark:text-blue-300" />
                  Reparto por Ubicaciones (Zonas)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {stockDetail.zoneStock.map((zs: any) => (
                    <div
                      key={zs.zoneId}
                      className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col group hover:border-blue-400 transition-all"
                    >
                      <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none mb-1">
                        {zs.zoneName}
                      </span>
                      <div className="flex justify-between items-end">
                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">
                          {zs.warehouseName}
                        </span>
                        <span className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tighter leading-none">
                          {Number(zs.stock).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStockItem?.manageBy !== 'N' && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Tag size={12} className="text-indigo-500" />
                  Trazabilidad por Lote/Serie e Ubicación
                </h4>
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 overflow-y-auto max-h-[350px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-4">Lote / Serie</th>
                        <th className="px-5 py-4">Ubicación</th>
                        <th className="px-5 py-4 text-center">Cant.</th>
                        <th className="px-5 py-4 text-right">Caducidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {stockDetail?.batches
                        ?.filter((b: any) => Number(b.quantity) > 0)
                        .map((b: any) => (
                          <tr key={b.id} className="hover:bg-blue-50/30 transition-colors group">
                            <td className="px-5 py-3">
                              <Badge
                                variant="neutral"
                                className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 font-mono text-[10px] font-black py-0 px-2"
                              >
                                {b.batchNum}
                              </Badge>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-none">
                                  {b.zoneName || 'Stock General'}
                                </span>
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-tighter mt-1">
                                  {b.warehouseName ||
                                    stockDetail?.warehouseStock?.[0]?.warehouseName ||
                                    'Almacén Principal'}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                {Number(b.quantity).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono italic">
                                {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : 'N/A'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {(!stockDetail?.batches ||
                        stockDetail.batches.filter((b: any) => Number(b.quantity) > 0).length ===
                          0) && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-5 py-10 text-center text-slate-300 dark:text-slate-600 italic text-xs font-medium bg-slate-50/20 dark:bg-slate-800/20"
                          >
                            No hay lotes o series con existencias disponibles en este momento.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setSelectedStockItem(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

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
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
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

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
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

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
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
              <AlternativeUomsPanel
                itemId={selectedItem?.id}
                baseUomId={uomId}
                uoms={uoms}
                token={token}
                tenantId={user?.tenantId || ''}
              />
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
