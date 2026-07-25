import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Loader, useToast } from '@openfactu/ui';
import { ArrowLeft, Boxes, Package, Save, Tag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { LabelPrintButton } from '@/modules/document-templates/components/LabelPrintButton';
import StockDetailModal from '../components/StockDetailModal';
import { validateBarcode } from '@/utils/barcodeValidation';
import { useItemForm } from '../hooks/useItemForm';
import { ItemGeneralFields } from '../components/ItemGeneralFields';
import { ItemLogisticsFields } from '../components/ItemLogisticsFields';
import { ItemWebFields } from '../components/ItemWebFields';
import { AlternativeUomsPanel } from '../components/AlternativeUomsPanel';
import { categoriesApi, itemsApi, uomApi, warehousesApi, zonesApi } from '../api';
import type { Category } from '../domain/category';
import type { Uom } from '../domain/uom';
import type { Warehouse, Zone } from '../domain/warehouse';

const MANAGE_LABEL: Record<string, string> = { N: 'Estándar', B: 'Lotes', S: 'Series' };

/**
 * Ficha completa de un artículo (/items/:itemId) — sustituye a la edición en
 * modal: cabecera con imagen y datos clave, y secciones apiladas reutilizando
 * las mismas piezas que el wizard de alta (useItemForm + secciones).
 */
export const ItemDetail: React.FC = () => {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite =
    user?.role === 'SUPERUSER' || user?.role === 'ADMIN' || user?.permissions?.['/items']?.write;

  const form = useItemForm();
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [stockDetail, setStockDetail] = useState<any>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);

  useEffect(() => {
    if (!itemId || !user?.tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [it, cData, uData, wData, zData] = await Promise.all([
          itemsApi.get(itemId),
          categoriesApi.list(),
          uomApi.list(),
          warehousesApi.list(),
          zonesApi.list(),
        ]);
        if (cancelled) return;
        setItem(it);
        form.reset(it);
        setCategories(Array.isArray(cData) ? cData : []);
        setUoms(Array.isArray(uData) ? uData : []);
        setWarehouses(Array.isArray(wData) ? wData : []);
        setZones(Array.isArray(zData) ? zData : []);
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || 'No se pudo cargar el artículo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, user?.tenantId]);

  const handleSave = async () => {
    if (!itemId) return;
    if (form.values.barcode.trim()) {
      const v = validateBarcode(form.values.barcode);
      if (!v.valid) {
        const ok = confirm(
          `El código de barras parece inválido (${v.format}: ${v.reason}). ¿Guardar de todos modos?`,
        );
        if (!ok) return;
      }
    }
    try {
      const saved = await form.submit(itemId);
      setItem(saved);
      toast.success('Artículo actualizado');
    } catch (err: any) {
      console.error('[ItemDetail.save] error:', err);
      toast.error(`Error: ${err?.message || err}`);
    }
  };

  const handleViewStock = async () => {
    if (!item) return;
    setStockOpen(true);
    setStockLoading(true);
    try {
      setStockDetail(await itemsApi.stockDetail(item.id));
    } catch {
      toast.error('Error al cargar inventario');
    } finally {
      setStockLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }
  if (!item) {
    return (
      <div className="p-12 text-center text-slate-400">
        Artículo no encontrado.
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/items')}>
            <ArrowLeft size={14} className="mr-2" /> Volver al catálogo
          </Button>
        </div>
      </div>
    );
  }

  const cover = Array.isArray(form.values.webImages) ? form.values.webImages[0] : undefined;

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      {/* Cabecera estilo ficha: imagen + identidad + acciones */}
      <Card>
        <div className="flex flex-col md:flex-row gap-6">
          {cover ? (
            <img
              src={cover}
              alt={item.name}
              className="w-32 h-32 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-32 h-32 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600 shrink-0">
              <Package size={40} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => navigate('/items')}
              className="text-[11px] font-bold text-slate-400 hover:text-blue-600 dark:hover:text-blue-300 flex items-center gap-1 mb-1"
            >
              <ArrowLeft size={12} /> Catálogo
            </button>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-display truncate">
              {form.values.name || item.name}
            </h1>
            <p className="font-mono text-xs text-blue-600 dark:text-blue-300 font-black uppercase mt-0.5">
              {item.code}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge>{item.kind === 'box' ? 'Caja' : 'Producto'}</Badge>
              <Badge>{MANAGE_LABEL[form.values.manageBy] ?? form.values.manageBy}</Badge>
              {form.values.webVisible && <Badge>En la web</Badge>}
            </div>
          </div>
          <div className="flex md:flex-col gap-2 shrink-0">
            <Button onClick={handleSave} disabled={!canWrite || form.saving}>
              {form.saving ? (
                <Loader size="sm" variant="white" />
              ) : (
                <>
                  <Save size={14} className="mr-2" /> Guardar
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={handleViewStock}>
              <Boxes size={14} className="mr-2" /> Inventario
            </Button>
            <LabelPrintButton
              params={{ itemId: item.id }}
              title="Imprimir etiqueta del artículo"
              className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              triggerLabel={
                <>
                  <Tag size={14} /> Etiqueta
                </>
              }
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title="General" subtitle="Identificación, categoría, unidad y precio.">
          <ItemGeneralFields
            values={form.values}
            set={form.set}
            categories={categories}
            uoms={uoms}
            isEditing
          />
        </Card>
        <Card title="Logística" subtitle="Tipo, trazabilidad y ubicación por defecto.">
          <ItemLogisticsFields
            values={form.values}
            set={form.set}
            warehouses={warehouses}
            zones={zones}
          />
        </Card>
        <Card title="Web" subtitle="Cómo se vende este artículo en tu web pública.">
          <ItemWebFields
            webVisible={form.values.webVisible}
            setWebVisible={(v) => form.set('webVisible', v)}
            webDescription={form.values.webDescription}
            setWebDescription={(v) => form.set('webDescription', v)}
            webImages={form.values.webImages}
            setWebImages={(v) => form.set('webImages', v)}
          />
        </Card>
        <Card title="Unidades alternativas" noPadding>
          <AlternativeUomsPanel itemId={item.id} baseUomId={form.values.uomId} uoms={uoms} />
        </Card>
        <Card title="Campos personalizados">
          <PluginFieldsPanel
            tableName="Item"
            values={form.values.customValues}
            onChange={(k, v) => form.setCustom(k, v)}
            layout="inline"
            title=""
          />
        </Card>
        <Card title="Adjuntos">
          <AttachmentsPanel entityType="Item" entityId={item.id} />
        </Card>
      </div>

      <StockDetailModal
        isOpen={stockOpen}
        onClose={() => setStockOpen(false)}
        title="Detalle de Inventario"
        subtitle="Desglose por almacenes y trazabilidad."
        selectedStockItem={item}
        stockDetail={stockDetail}
        loading={stockLoading}
      />
    </div>
  );
};
