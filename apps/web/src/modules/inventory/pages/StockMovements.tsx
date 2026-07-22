/**
 * Hub de movimientos internos de stock.
 *
 * Tres tabs — Traspasos / Entradas / Salidas — con el mismo flujo:
 *   lista + modal completo (zonas, lotes, UoM, escáner de códigos) + postear.
 *
 * El escáner invoca `BarcodeCameraModal` y al leer resuelve el Item vía
 * `GET /api/stock/items/by-barcode/:code`. Si existe, añade una línea nueva
 * pre-rellena con el itemId, su UoM por defecto y la zona preferente.
 *
 * Endpoints:
 *   /api/transfer-notes     (draft → sent → received)
 *   /api/goods-receipts     (draft → posted)
 *   /api/goods-issues       (draft → posted)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Badge, Loader, useToast, SearchableSelect } from '@openfactu/ui';
import {
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  ArrowRight,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ScanLine,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { BarcodeCameraModal } from '../../../components/scanner/BarcodeCameraModal';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner';
import { ApiError } from '../../../shared/http';
import { itemsApi, stockApi, stockDocsApi, uomApi, warehousesApi, zonesApi } from '../api';
import type { StockDocKind } from '../domain/stockMovement';
import type { Warehouse, Zone } from '../domain/warehouse';
import type { Item } from '../domain/item';
import type { Uom } from '../domain/uom';

type Kind = StockDocKind;

const KIND_CFG = {
  transfer: {
    label: 'Traspasos',
    Icon: ArrowRightLeft,
    newTitle: 'Nuevo traspaso',
  },
  receipt: {
    label: 'Entradas',
    Icon: ArrowDownToLine,
    newTitle: 'Nueva entrada',
  },
  issue: {
    label: 'Salidas',
    Icon: ArrowUpFromLine,
    newTitle: 'Nueva salida',
  },
} as const;

const STATUS_COPY: Record<string, { label: string; variant: any }> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  sent: { label: 'Enviado', variant: 'info' },
  received: { label: 'Recibido', variant: 'success' },
  posted: { label: 'Posteado', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
};

/**
 * Una línea del documento. `fromZoneId` y `toZoneId` solo se usan en los
 * traspasos; `zoneId` se usa en entradas/salidas.
 */
interface LineInput {
  itemId: string;
  quantity: string;
  fromZoneId: string;
  toZoneId: string;
  zoneId: string;
  batchNum: string;
  uomId: string;
}

const emptyLine = (): LineInput => ({
  itemId: '',
  quantity: '',
  fromZoneId: '',
  toZoneId: '',
  zoneId: '',
  batchNum: '',
  uomId: '',
});

export const StockMovements: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('transfer');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /** `creating=true` → formulario de alta; `viewing=doc` → detalle del
   *  documento seleccionado; cualquiera de los dos oculta el listado. */
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [lines, setLines] = useState<LineInput[]>([emptyLine()]);

  /** Cache de lotes y series por itemId. */
  const [batchesByItem, setBatchesByItem] = useState<
    Record<string, Array<{ batchNum: string; quantity?: number; expiryDate?: string | null }>>
  >({});

  /** Cache de zonas con stock para filtrar el selector de zona origen en
   *  salidas y traspasos. Clave: `${itemId}::${warehouseId}`. Valor: array
   *  de `{ zoneId, stock }`. */
  const [stockZonesByItemWh, setStockZonesByItemWh] = useState<
    Record<string, Array<{ zoneId: string; stock: number }>>
  >({});

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);

  const [scanOpen, setScanOpen] = useState(false);

  // Mapa rápido itemId → item para consultas (manageBy, uomId, etc.).
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);

  // UoM por id para renderizar el nombre/código legible.
  const uomsById = useMemo(() => new Map(uoms.map((u) => [u.id, u] as const)), [uoms]);

  const cfg = KIND_CFG[kind];

  const load = async () => {
    setLoading(true);
    try {
      const d = await stockDocsApi.list(kind);
      setRows(Array.isArray(d) ? d : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, kind]);

  useEffect(() => {
    if (!user?.tenantId) return;
    Promise.all([
      warehousesApi.list().catch(() => []),
      zonesApi.list().catch(() => []),
      itemsApi.list().catch(() => []),
      uomApi.list().catch(() => []),
    ])
      .then(([w, z, i, u]) => {
        setWarehouses(Array.isArray(w) ? w : []);
        setZones(Array.isArray(z) ? z : []);
        setItems(Array.isArray(i) ? i : []);
        setUoms(Array.isArray(u) ? u : []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setForm({});
    setLines([emptyLine()]);
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setForm({});
    setLines([emptyLine()]);
  };

  /** Abre el detalle de un documento: carga cabecera + líneas. */
  const openView = async (row: any) => {
    let full: any;
    try {
      full = await stockDocsApi.get(kind, row.id);
    } catch {
      toast.error('No se pudo cargar el documento');
      return;
    }
    setViewing(full);
    // Precargar batches/uoms para renderizar nombres legibles.
    const ids = [...new Set((full.lines || []).map((l: any) => l.itemId))];
    for (const id of ids) ensureBatchesLoaded(id as string);
  };

  const closeView = () => setViewing(null);

  /** Versión "acción + recarga" que respeta la vista detalle abierta. */
  const refreshView = async () => {
    if (!viewing) return;
    try {
      setViewing(await stockDocsApi.get(kind, viewing.id));
    } catch {
      /* mantener la vista anterior si falla la recarga */
    }
    load();
  };

  /** Carga zonas con stock > 0 del artículo en un almacén concreto. */
  const ensureStockZonesLoaded = async (itemId: string, warehouseId: string) => {
    if (!itemId || !warehouseId) return;
    const key = `${itemId}::${warehouseId}`;
    if (stockZonesByItemWh[key]) return;
    try {
      const d = await stockApi.zonesWithStock(itemId, warehouseId);
      setStockZonesByItemWh((prev) => ({
        ...prev,
        [key]: Array.isArray(d) ? d : [],
      }));
    } catch {
      setStockZonesByItemWh((prev) => ({ ...prev, [key]: [] }));
    }
  };

  /** Carga lotes (manageBy='B') o series (manageBy='S') del artículo. */
  const ensureBatchesLoaded = async (itemId: string) => {
    if (batchesByItem[itemId]) return;
    const item = items.find((x) => x.id === itemId);
    try {
      const d =
        item?.manageBy === 'S'
          ? await stockApi.serials(itemId)
          : await stockApi.batches(itemId);
      const normalized = Array.isArray(d)
        ? d.map((row: any) => ({
            batchNum: row.batchNum || row.serialNum,
            quantity: row.quantity,
            expiryDate: row.expiryDate || null,
          }))
        : [];
      setBatchesByItem((prev) => ({ ...prev, [itemId]: normalized }));
    } catch {
      setBatchesByItem((prev) => ({ ...prev, [itemId]: [] }));
    }
  };

  const addLine = () => setLines((xs) => [...xs, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((xs) => (xs.length === 1 ? xs : xs.filter((_, idx) => idx !== i)));
  const updateLine = (i: number, patch: Partial<LineInput>) =>
    setLines((xs) => xs.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /**
   * Al seleccionar un item, pre-rellena UoM y zona preferente — esto ahorra
   * clicks cuando el 95% de las líneas van con su default.
   */
  const onItemPicked = (i: number, itemId: string) => {
    const item = items.find((x) => x.id === itemId);
    if (!item) {
      updateLine(i, { itemId });
      return;
    }
    const patch: Partial<LineInput> = { itemId, uomId: item.uomId || '' };
    // Para artículos por serie: cantidad SIEMPRE 1 (una línea = un serial).
    // Si el usuario había tecleado otra cantidad antes de cambiar al item
    // serializado, la reseteamos en state (no basta con el `disabled` del
    // input porque el estado subyacente podía tener otro valor).
    if (item.manageBy === 'S') {
      patch.quantity = '1';
      patch.batchNum = ''; // el serial anterior no aplica al nuevo item
    }
    if (kind === 'transfer') {
      if (item.defaultZoneId && item.defaultWarehouseId === form.fromWarehouseId) {
        patch.fromZoneId = item.defaultZoneId;
      }
    } else if (item.defaultZoneId && item.defaultWarehouseId === form.warehouseId) {
      patch.zoneId = item.defaultZoneId;
    }
    updateLine(i, patch);
    ensureBatchesLoaded(itemId);
    // Para filtrar zonas por stock en salidas y en `fromZone` de traspasos.
    const sourceWh = kind === 'transfer' ? form.fromWarehouseId : form.warehouseId;
    if (sourceWh) ensureStockZonesLoaded(itemId, sourceWh);
  };

  /** Al leer un código del escáner (cámara o HID): busca el item y añade una línea. */
  const handleScan = async (raw: string) => {
    setScanOpen(false);
    const code = raw.trim();
    if (!code) return;
    try {
      let item: Item;
      try {
        item = await stockApi.itemByBarcode(code);
      } catch (e) {
        if (e instanceof ApiError) {
          toast.error(`Código "${code}" no encontrado en el catálogo`);
          return;
        }
        throw e;
      }
      const managed = item.manageBy === 'B' || item.manageBy === 'S';

      setLines((xs) => {
        const nextLines = [...xs];

        // Si el artículo NO se gestiona por lote/serie y ya hay una línea con
        // el mismo itemId, sumamos 1 en vez de añadir otra línea.
        if (!managed) {
          const existingIdx = nextLines.findIndex((l) => l.itemId === item.id);
          if (existingIdx !== -1) {
            const current = Number(nextLines[existingIdx].quantity) || 0;
            nextLines[existingIdx] = {
              ...nextLines[existingIdx],
              quantity: String(current + 1),
            };
            return nextLines;
          }
        }

        // Artículo gestionado o no presente aún: reciclar primera línea vacía
        // o anexar una nueva.
        const targetIdx = nextLines.findIndex((l) => !l.itemId);
        const base: LineInput = {
          ...emptyLine(),
          itemId: item.id,
          quantity: '1',
          uomId: item.uomId || '',
        };
        if (kind === 'transfer') {
          if (item.defaultZoneId && item.defaultWarehouseId === form.fromWarehouseId)
            base.fromZoneId = item.defaultZoneId;
        } else if (item.defaultZoneId && item.defaultWarehouseId === form.warehouseId) {
          base.zoneId = item.defaultZoneId;
        }
        if (targetIdx !== -1) nextLines[targetIdx] = base;
        else nextLines.push(base);
        return nextLines;
      });
      if (navigator.vibrate) navigator.vibrate(60);
      toast.success(`+ ${item.name}`);
    } catch {
      toast.error('Fallo al resolver el código');
    }
  };

  const create = async () => {
    // ── Cabecera ──────────────────────────────────────────────────────
    if (kind === 'transfer') {
      if (!form.fromWarehouseId) {
        toast.error('Selecciona el almacén origen');
        return;
      }
      if (!form.toWarehouseId) {
        toast.error('Selecciona el almacén destino');
        return;
      }
      if (form.fromWarehouseId === form.toWarehouseId) {
        toast.error('Origen y destino no pueden ser el mismo almacén');
        return;
      }
    } else {
      if (!form.warehouseId) {
        toast.error('Selecciona el almacén');
        return;
      }
    }

    // ── Líneas ────────────────────────────────────────────────────────
    const withItem = lines.filter((l) => l.itemId);
    if (withItem.length === 0) {
      toast.error('Añade al menos una línea con artículo');
      return;
    }
    const seenSerials = new Set<string>();
    const normalized: Array<{
      itemId: string;
      quantity: number;
      fromZoneId: string | null;
      toZoneId: string | null;
      zoneId: string | null;
      batchNum: string | null;
      uomId: string | null;
    }> = [];

    for (let i = 0; i < withItem.length; i++) {
      const l = withItem[i];
      const it = itemsById.get(l.itemId);
      const m = it?.manageBy || 'N';
      // Para series la cantidad es SIEMPRE 1 — la forzamos aquí para
      // tolerar estados heredados donde el input no se haya sincronizado
      // todavía (p.ej. items cargados asíncronos).
      const qty = m === 'S' ? 1 : Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`Línea ${i + 1} (${it?.name || 'artículo'}): cantidad inválida`);
        return;
      }
      if ((m === 'B' || m === 'S') && !l.batchNum.trim()) {
        toast.error(
          `${it?.name || 'Artículo'} se gestiona por ${m === 'S' ? 'número de serie' : 'lote'} — obligatorio rellenarlo.`,
        );
        return;
      }
      if (m === 'S') {
        const key = `${l.itemId}::${l.batchNum.trim()}`;
        if (seenSerials.has(key)) {
          toast.error(`La serie "${l.batchNum.trim()}" aparece repetida en el documento.`);
          return;
        }
        seenSerials.add(key);
      }
      normalized.push({
        itemId: l.itemId,
        quantity: qty,
        fromZoneId: l.fromZoneId || null,
        toZoneId: l.toZoneId || null,
        zoneId: l.zoneId || null,
        batchNum: l.batchNum.trim() || null,
        uomId: l.uomId || null,
      });
    }

    const valid = normalized;
    const body = { ...form, lines: valid };
    let d: any;
    try {
      d = await stockDocsApi.create(kind, body);
    } catch (e) {
      toast.error((e instanceof Error && e.message) || 'Error');
      return;
    }
    toast.success(`Creado ${d.code}`);
    cancelCreate();
    load();
  };

  const send = async (id: string) => {
    try {
      await stockDocsApi.send(kind, id);
    } catch (e) {
      toast.error((e instanceof Error && e.message) || 'No se pudo enviar');
      return;
    }
    toast.success('Enviado — stock descontado del origen');
    load();
  };

  const receive = async (id: string) => {
    try {
      await stockDocsApi.receive(kind, id);
    } catch (e) {
      toast.error((e instanceof Error && e.message) || 'No se pudo recibir');
      return;
    }
    toast.success('Recibido — stock sumado al destino');
    load();
  };

  const post = async (id: string) => {
    try {
      await stockDocsApi.post(kind, id);
    } catch (e) {
      toast.error((e instanceof Error && e.message) || 'No se pudo postear');
      return;
    }
    toast.success('Posteado — stock actualizado');
    load();
  };

  // Escáner HID global — solo mientras el formulario de alta está abierto.
  useBarcodeScanner(handleScan, { enabled: creating });

  // Cuando cambia el almacén origen, re-cargar stock-por-zona de los items
  // que ya estén en las líneas. Así si el usuario elige las líneas antes de
  // rellenar la cabecera, al volver a la cabecera todo queda al día.
  const sourceWh = kind === 'transfer' ? form.fromWarehouseId : form.warehouseId;
  useEffect(() => {
    if (!creating || !sourceWh) return;
    const needsSource = kind === 'transfer' || kind === 'issue';
    if (!needsSource) return;
    for (const l of lines) {
      if (l.itemId) ensureStockZonesLoaded(l.itemId, sourceWh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceWh, creating]);

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar documento?')) return;
    try {
      await stockDocsApi.remove(kind, id);
    } catch (e) {
      toast.error((e instanceof Error && e.message) || 'No se pudo eliminar');
    }
    load();
  };

  const whName = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || id || '—';
  const whOpts = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const itemOpts = items.map((i) => ({
    value: i.id,
    label: i.name,
    secondaryLabel: i.code,
  }));
  const uomOpts = uoms.map((u) => ({
    value: u.id,
    label: u.code,
    secondaryLabel: u.name,
  }));

  /** Zonas filtradas por almacén — se recalculan para origen, destino, genérico. */
  const zonesFor = (warehouseId?: string) =>
    zones
      .filter((z) => !warehouseId || z.warehouseId === warehouseId)
      .map((z) => ({ value: z.id, label: z.name }));

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          {(creating || viewing) && (
            <button
              onClick={creating ? cancelCreate : closeView}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              title="Volver al listado"
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <ArrowRightLeft className="text-amber-600 dark:text-amber-300" size={22} />
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              {creating
                ? cfg.newTitle
                : viewing
                  ? `${cfg.label.slice(0, -1)} ${viewing.code}`
                  : 'Movimientos de stock'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {creating
                ? 'Rellena la cabecera y las líneas. Los artículos gestionados por lote/serie exigen el número.'
                : viewing
                  ? `Detalle del documento — estado: ${STATUS_COPY[viewing.status]?.label || viewing.status}`
                  : 'Traspasos, entradas y salidas internas — con trazabilidad por zona, lote y unidad de medida.'}
            </p>
          </div>
        </div>
        {!creating && !viewing && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={14} /> {cfg.newTitle}
          </Button>
        )}
      </header>

      {!creating && !viewing && (
        <>
          <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {(Object.keys(KIND_CFG) as Kind[]).map((k) => {
                const c = KIND_CFG[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={
                      'flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors shrink-0 ' +
                      (active
                        ? 'text-accent border-accent'
                        : 'text-slate-500 border-transparent hover:text-accent')
                    }
                  >
                    <c.Icon size={13} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader />
            </div>
          ) : rows.length === 0 ? (
            <Card bodyClassName="py-10 text-center text-sm text-slate-500">Sin documentos.</Card>
          ) : (
            <Card bodyClassName="p-0">
              <ul>
                {rows.map((r) => {
                  const sc = STATUS_COPY[r.status] || { label: r.status, variant: 'neutral' };
                  return (
                    <li
                      key={r.id}
                      onClick={() => openView(r)}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded shrink-0">
                        {r.code}
                      </code>
                      <Badge variant={sc.variant}>{sc.label}</Badge>
                      <div className="flex-1 min-w-0 text-xs text-slate-600 dark:text-slate-300">
                        {kind === 'transfer' ? (
                          <span className="flex items-center gap-1">
                            {whName(r.fromWarehouseId)}
                            <ArrowRight size={11} className="text-slate-400" />
                            {whName(r.toWarehouseId)}
                          </span>
                        ) : (
                          <span>
                            {whName(r.warehouseId)}
                            {r.type && <span className="ml-2 text-slate-400">· {r.type}</span>}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {new Date(r.date).toLocaleDateString('es-ES')}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        {kind === 'transfer' && r.status === 'draft' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              send(r.id);
                            }}
                            className="px-2 py-1 text-[11px] rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300"
                          >
                            <Send size={11} className="inline" /> Enviar
                          </button>
                        )}
                        {kind === 'transfer' && r.status === 'sent' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              receive(r.id);
                            }}
                            className="px-2 py-1 text-[11px] rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                          >
                            <CheckCircle2 size={11} className="inline" /> Recibir
                          </button>
                        )}
                        {kind !== 'transfer' && r.status === 'draft' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              post(r.id);
                            }}
                            className="px-2 py-1 text-[11px] rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                          >
                            <CheckCircle2 size={11} className="inline" /> Postear
                          </button>
                        )}
                        {r.status !== 'posted' && r.status !== 'received' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(r.id);
                            }}
                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Detalle de un documento seleccionado. */}
      {viewing && (
        <div className="space-y-4">
          {/* Cabecera */}
          <Card bodyClassName="p-4 md:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_COPY[viewing.status]?.variant || 'neutral'}>
                    {STATUS_COPY[viewing.status]?.label || viewing.status}
                  </Badge>
                  <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-xs font-mono rounded">
                    {viewing.code}
                  </code>
                  <span className="text-xs text-slate-500">
                    {new Date(viewing.date).toLocaleDateString('es-ES')}
                  </span>
                </div>
                {kind === 'transfer' ? (
                  <div className="text-sm flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <span>{whName(viewing.fromWarehouseId)}</span>
                    <ArrowRight size={12} className="text-slate-400" />
                    <span>{whName(viewing.toWarehouseId)}</span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Almacén: <b>{whName(viewing.warehouseId)}</b>
                    {viewing.type && (
                      <span className="ml-2 text-slate-400 text-xs">· {viewing.type}</span>
                    )}
                  </div>
                )}
                {viewing.notes && (
                  <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">
                    {viewing.notes}
                  </div>
                )}
              </div>
              {/* Acciones contextuales */}
              <div className="flex gap-2 flex-wrap">
                {kind === 'transfer' && viewing.status === 'draft' && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await send(viewing.id);
                      refreshView();
                    }}
                    className="flex items-center gap-2"
                  >
                    <Send size={13} /> Enviar
                  </Button>
                )}
                {kind === 'transfer' && viewing.status === 'sent' && (
                  <Button
                    onClick={async () => {
                      await receive(viewing.id);
                      refreshView();
                    }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 size={13} /> Recibir
                  </Button>
                )}
                {kind !== 'transfer' && viewing.status === 'draft' && (
                  <Button
                    onClick={async () => {
                      await post(viewing.id);
                      refreshView();
                    }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 size={13} /> Postear
                  </Button>
                )}
                {viewing.status !== 'posted' && viewing.status !== 'received' && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!confirm('¿Eliminar documento?')) return;
                      try {
                        await stockDocsApi.remove(kind, viewing.id);
                      } catch (e) {
                        toast.error((e instanceof Error && e.message) || 'No se pudo eliminar');
                      }
                      closeView();
                      load();
                    }}
                    className="flex items-center gap-2 !text-rose-600"
                  >
                    <Trash2 size={13} /> Eliminar
                  </Button>
                )}
              </div>
            </div>

            {/* Timeline de fechas */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Creado
                </div>
                <div className="text-slate-700 dark:text-slate-200">
                  {new Date(viewing.createdAt).toLocaleString('es-ES')}
                </div>
              </div>
              {viewing.sentAt && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Enviado
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">
                    {new Date(viewing.sentAt).toLocaleString('es-ES')}
                  </div>
                </div>
              )}
              {viewing.receivedAt && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Recibido
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">
                    {new Date(viewing.receivedAt).toLocaleString('es-ES')}
                  </div>
                </div>
              )}
              {viewing.postedAt && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Posteado
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">
                    {new Date(viewing.postedAt).toLocaleString('es-ES')}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Líneas */}
          <Card bodyClassName="p-0">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Líneas ({viewing.lines?.length || 0})
            </div>
            {!viewing.lines || viewing.lines.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">Sin líneas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">#</th>
                      <th className="px-3 py-2 text-left">Artículo</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-left">UoM</th>
                      <th className="px-3 py-2 text-left">Lote / Serie</th>
                      {kind === 'transfer' ? (
                        <>
                          <th className="px-3 py-2 text-left">Zona origen</th>
                          <th className="px-3 py-2 text-left">Zona destino</th>
                        </>
                      ) : (
                        <th className="px-3 py-2 text-left">Zona</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.lines.map((l: any) => {
                      const it = itemsById.get(l.itemId);
                      const uom = l.uomId
                        ? uomsById.get(l.uomId)
                        : it?.uomId
                          ? uomsById.get(it.uomId)
                          : null;
                      const zone = (zid: string | null) =>
                        zid ? zones.find((z) => z.id === zid)?.name || '—' : '—';
                      return (
                        <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 text-slate-500">{l.lineNum}</td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                            <div className="font-semibold">{it?.name || l.itemId}</div>
                            {it?.code && (
                              <div className="text-[11px] text-slate-500 font-mono">{it.code}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{l.quantity}</td>
                          <td className="px-3 py-2 text-slate-500">{uom?.code || '—'}</td>
                          <td className="px-3 py-2">
                            {l.batchNum ? (
                              <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                {l.batchNum}
                              </code>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          {kind === 'transfer' ? (
                            <>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {zone(l.fromZoneId)}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {zone(l.toZoneId)}
                              </td>
                            </>
                          ) : (
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {zone(l.zoneId)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Formulario de alta — ocupa la página entera cuando creating=true. */}
      {creating && (
        <Card bodyClassName="p-4 md:p-6">
          <div className="space-y-5">
            {/* Cabecera */}
            {kind === 'transfer' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Almacén origen
                  </label>
                  <SearchableSelect
                    options={whOpts}
                    value={form.fromWarehouseId || ''}
                    onChange={(v) => setForm({ ...form, fromWarehouseId: v })}
                    placeholder="— seleccionar —"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Almacén destino
                  </label>
                  <SearchableSelect
                    options={whOpts}
                    value={form.toWarehouseId || ''}
                    onChange={(v) => setForm({ ...form, toWarehouseId: v })}
                    placeholder="— seleccionar —"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Almacén
                  </label>
                  <SearchableSelect
                    options={whOpts}
                    value={form.warehouseId || ''}
                    onChange={(v) => setForm({ ...form, warehouseId: v })}
                    placeholder="— seleccionar —"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Motivo
                  </label>
                  <select
                    value={form.type || 'internal'}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                  >
                    {kind === 'receipt' ? (
                      <>
                        <option value="internal">Recepción interna</option>
                        <option value="return">Devolución</option>
                        <option value="adjustment">Ajuste positivo</option>
                      </>
                    ) : (
                      <>
                        <option value="internal">Salida interna</option>
                        <option value="scrap">Scrap / merma</option>
                        <option value="adjustment">Ajuste negativo</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Líneas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Líneas
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScanOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded bg-primary text-white shadow-sm hover:opacity-90"
                    title="Escanear código de barras"
                  >
                    <ScanLine size={12} /> Escanear
                  </button>
                  <button onClick={addLine} className="text-[11px] text-primary hover:underline">
                    + Añadir línea
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {lines.map((l, i) => {
                  // Zonas genéricas (para destinos: toZone en traspaso, zone en entradas).
                  const toZoneOpts = zonesFor(form.toWarehouseId);
                  const zoneOpts = zonesFor(form.warehouseId);

                  // Zonas de ORIGEN (con stock del artículo concreto):
                  //   traspaso → fromWarehouseId
                  //   salida   → warehouseId
                  // Si falta almacén o artículo, no podemos filtrar todavía.
                  const sourceWarehouseId =
                    kind === 'transfer' ? form.fromWarehouseId : form.warehouseId;
                  const stockZones =
                    l.itemId && sourceWarehouseId
                      ? stockZonesByItemWh[`${l.itemId}::${sourceWarehouseId}`]
                      : undefined;
                  const sourceZoneState:
                    | 'no-warehouse'
                    | 'no-item'
                    | 'loading'
                    | 'empty'
                    | 'ready' = !sourceWarehouseId
                    ? 'no-warehouse'
                    : !l.itemId
                      ? 'no-item'
                      : stockZones === undefined
                        ? 'loading'
                        : stockZones.length === 0
                          ? 'empty'
                          : 'ready';
                  const sourceZoneOpts =
                    sourceZoneState === 'ready'
                      ? (stockZones || []).map((sz) => {
                          const z = zones.find((zz) => zz.id === sz.zoneId);
                          return {
                            value: sz.zoneId,
                            label: z?.name || sz.zoneId,
                            secondaryLabel: `${sz.stock} ud.`,
                          };
                        })
                      : [];
                  const item = l.itemId ? itemsById.get(l.itemId) : null;
                  const managedBy = item?.manageBy || 'N';
                  const uom = l.uomId ? uomsById.get(l.uomId) : null;
                  const batchLabel =
                    managedBy === 'S' ? 'Nº de serie' : managedBy === 'B' ? 'Lote' : 'Lote';
                  const batchRequired = managedBy === 'B' || managedBy === 'S';
                  const batchMissing = batchRequired && !l.batchNum.trim();
                  const forceQty1 = managedBy === 'S';
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0 mt-1">
                          {i + 1}
                        </div>
                        <div className="flex-1 grid grid-cols-12 gap-2">
                          <div className="col-span-12 md:col-span-5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5 flex items-center gap-1.5">
                              Artículo
                              {managedBy === 'B' && (
                                <span className="normal-case tracking-normal px-1.5 py-0 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                  Gestión por lotes
                                </span>
                              )}
                              {managedBy === 'S' && (
                                <span className="normal-case tracking-normal px-1.5 py-0 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold">
                                  Gestión por serie
                                </span>
                              )}
                            </label>
                            <SearchableSelect
                              options={itemOpts}
                              value={l.itemId}
                              onChange={(v) => onItemPicked(i, v)}
                              placeholder="— artículo —"
                            />
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                              Cantidad
                            </label>
                            <Input
                              type="number"
                              step="any"
                              value={forceQty1 ? '1' : l.quantity}
                              disabled={forceQty1}
                              onChange={(e) => updateLine(i, { quantity: e.target.value })}
                              placeholder="0"
                              title={
                                forceQty1 ? 'Artículo por serie — una línea por unidad' : undefined
                              }
                            />
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                              UoM
                            </label>
                            <div
                              className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/60 text-sm px-3 flex items-center text-slate-600 dark:text-slate-300"
                              title="Unidad del artículo"
                            >
                              {uom ? uom.code : '—'}
                            </div>
                          </div>
                          {batchRequired && (
                            <div className="col-span-4 md:col-span-3">
                              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                {batchLabel}
                                <span className="ml-1 text-rose-500">*</span>
                              </label>
                              {(() => {
                                const known = (l.itemId && batchesByItem[l.itemId]) || [];
                                const knownOpts = known.map((b) => {
                                  const parts: string[] = [];
                                  if (typeof b.quantity === 'number')
                                    parts.push(`${b.quantity} ud.`);
                                  if (b.expiryDate)
                                    parts.push(
                                      `cad. ${new Date(b.expiryDate).toLocaleDateString('es-ES')}`,
                                    );
                                  return {
                                    value: b.batchNum,
                                    label: b.batchNum,
                                    secondaryLabel: parts.join(' · ') || undefined,
                                  };
                                });
                                const hasCurrent =
                                  l.batchNum && knownOpts.some((o) => o.value === l.batchNum);
                                // Solo en entradas (GoodsReceipt) tiene sentido crear un
                                // lote/serie nuevo: es cuando el stock se origina. En
                                // traspasos y salidas únicamente se mueve/saca lo existente.
                                const canCreateNew = kind === 'receipt';
                                const batchOpts = [
                                  ...(canCreateNew
                                    ? [
                                        {
                                          value: '__new__',
                                          label:
                                            managedBy === 'S'
                                              ? '＋ Nueva serie…'
                                              : '＋ Nuevo lote…',
                                          secondaryLabel: 'Introducir manualmente',
                                        },
                                      ]
                                    : []),
                                  ...knownOpts,
                                  // Si el valor actual viene de un documento antiguo y ya no
                                  // está en la lista actual, lo mostramos para no perderlo
                                  // al editar — pero en creación nueva no lo usamos.
                                  ...(l.batchNum && !hasCurrent
                                    ? [
                                        {
                                          value: l.batchNum,
                                          label: l.batchNum,
                                          secondaryLabel: 'histórico',
                                        },
                                      ]
                                    : []),
                                ];
                                const noKnown =
                                  batchRequired &&
                                  !canCreateNew &&
                                  knownOpts.length === 0 &&
                                  l.itemId;
                                return (
                                  <div
                                    className={
                                      batchMissing ? 'ring-2 ring-rose-200 rounded-lg' : ''
                                    }
                                  >
                                    <SearchableSelect
                                      options={batchOpts}
                                      value={l.batchNum}
                                      onChange={(v) => {
                                        if (v === '__new__') {
                                          const entered = window.prompt(
                                            managedBy === 'S'
                                              ? 'Número de serie'
                                              : 'Número de lote',
                                            l.batchNum || '',
                                          );
                                          if (entered !== null) {
                                            updateLine(i, { batchNum: entered.trim() });
                                          }
                                        } else {
                                          updateLine(i, { batchNum: v });
                                        }
                                      }}
                                      placeholder={batchRequired ? 'Obligatorio' : '(opcional)'}
                                    />
                                    {noKnown && (
                                      <p className="text-[10px] text-amber-600 mt-0.5">
                                        Sin {managedBy === 'S' ? 'series' : 'lotes'} disponibles de
                                        este artículo.
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Zonas — orígenes filtrados por stock, destinos muestran todas. */}
                          {(() => {
                            const stateMsg =
                              sourceZoneState === 'no-warehouse'
                                ? 'Selecciona primero el almacén en la cabecera.'
                                : sourceZoneState === 'no-item'
                                  ? 'Elige el artículo para ver las zonas con stock.'
                                  : sourceZoneState === 'loading'
                                    ? 'Cargando zonas con stock…'
                                    : sourceZoneState === 'empty'
                                      ? 'Sin stock de este artículo en el almacén — no puedes sacar/mover.'
                                      : null;
                            const msgNode = stateMsg ? (
                              <p
                                className={
                                  'text-[10px] mt-0.5 ' +
                                  (sourceZoneState === 'empty' || sourceZoneState === 'no-warehouse'
                                    ? 'text-rose-600'
                                    : 'text-slate-500')
                                }
                              >
                                {stateMsg}
                              </p>
                            ) : null;

                            if (kind === 'transfer') {
                              return (
                                <>
                                  <div className="col-span-12 md:col-span-6">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                      Zona origen
                                    </label>
                                    <SearchableSelect
                                      options={sourceZoneOpts}
                                      value={l.fromZoneId}
                                      onChange={(v) => updateLine(i, { fromZoneId: v })}
                                      placeholder={sourceZoneState === 'ready' ? '—' : '—'}
                                      disabled={sourceZoneState !== 'ready'}
                                    />
                                    {msgNode}
                                  </div>
                                  <div className="col-span-12 md:col-span-6">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                      Zona destino
                                    </label>
                                    <SearchableSelect
                                      options={[
                                        { value: '', label: '— sin zona —' },
                                        ...toZoneOpts,
                                      ]}
                                      value={l.toZoneId}
                                      onChange={(v) => updateLine(i, { toZoneId: v })}
                                      placeholder="—"
                                    />
                                    {!form.toWarehouseId && (
                                      <p className="text-[10px] text-rose-600 mt-0.5">
                                        Selecciona primero el almacén destino en la cabecera.
                                      </p>
                                    )}
                                  </div>
                                </>
                              );
                            }
                            if (kind === 'issue') {
                              return (
                                <div className="col-span-12 md:col-span-12">
                                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                    Zona
                                  </label>
                                  <SearchableSelect
                                    options={sourceZoneOpts}
                                    value={l.zoneId}
                                    onChange={(v) => updateLine(i, { zoneId: v })}
                                    placeholder="—"
                                    disabled={sourceZoneState !== 'ready'}
                                  />
                                  {msgNode}
                                </div>
                              );
                            }
                            // Receipt: destino — todas las zonas del almacén.
                            return (
                              <div className="col-span-12 md:col-span-12">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                  Zona
                                </label>
                                <SearchableSelect
                                  options={[{ value: '', label: '— sin zona —' }, ...zoneOpts]}
                                  value={l.zoneId}
                                  onChange={(v) => updateLine(i, { zoneId: v })}
                                  placeholder="—"
                                />
                                {!form.warehouseId && (
                                  <p className="text-[10px] text-rose-600 mt-0.5">
                                    Selecciona primero el almacén en la cabecera.
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <button
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1}
                          className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 mt-1 shrink-0"
                          title="Quitar línea"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Notas
              </label>
              <textarea
                rows={2}
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2"
                placeholder="Opcional — observaciones para el almacén."
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" onClick={cancelCreate}>
                Cancelar
              </Button>
              <Button onClick={create}>Crear borrador</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Escáner de códigos — reutiliza el mismo que el resto de la app. */}
      <BarcodeCameraModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={handleScan}
        continuous
      />
    </div>
  );
};

export default StockMovements;
