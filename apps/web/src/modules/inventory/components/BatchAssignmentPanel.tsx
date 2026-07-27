import { stockApi } from '@/modules/inventory/api';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal,
  Button,
  Input,
  NumberInput,
  DatePicker,
  SearchableSelect,
  Switch,
  EmptyState,
  cn,
} from '@openfactu/ui';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Barcode,
  Package,
  Camera,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useZonesWithStock } from '@/hooks/useZonesWithStock';
import { BarcodeCameraModal } from '@/components/scanner/BarcodeCameraModal';

export interface BatchDetail {
  batchNum: string;
  quantity: number;
  expiryDate?: string;
  zoneId?: string;
}

interface AvailableBatch {
  batchNum: string;
  quantity: number;
  warehouseName?: string;
  warehouseId?: string;
  zoneId?: string;
  zoneName?: string;
  expiryDate?: string;
}

interface Line {
  itemId: string;
  quantity: number | string;
  warehouseId?: string;
  zoneId?: string;
  batchDetails?: BatchDetail[];
  baseId?: string;
  [key: string]: any;
}

interface Zone {
  id: string;
  name: string;
  warehouseId: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lines: Line[];
  masters: { items: any[] };
  /** Zonas del almacén activo. Si se pasa, se muestra columna "Zona" en los asignados y se permite dividir por zona. */
  zones?: Zone[];
  /** Almacén activo de la cabecera del documento (para filtrar zonas). */
  warehouseId?: string;
  /** 'line' si el almacén se captura por línea (ahí sí se prioriza
   *  `line.warehouseId` sobre la cabecera); 'header' o sin especificar si el
   *  almacén es único para todo el documento — en ese caso SIEMPRE se usa el
   *  `warehouseId` de cabecera, ignorando un `line.warehouseId` que puede
   *  haber quedado desincronizado (almacén por defecto del artículo, o
   *  cabecera cambiada después de crear la línea). */
  warehouseLocation?: 'header' | 'line';
  initialLineIdx?: number | null;
  isSale?: boolean;
  onSave: (updates: Array<{ idx: number; batchDetails: BatchDetail[] }>) => void;
}

export const BatchAssignmentPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  lines,
  masters,
  zones,
  warehouseId: headerWarehouseId,
  warehouseLocation,
  initialLineIdx = null,
  isSale = false,
  onSave,
}) => {
  const showZoneColumn = Array.isArray(zones) && zones.length > 0;
  const { token, user } = useAuth();
  const zonesWithStock = useZonesWithStock();

  // --- Líneas relevantes (las que usan lotes/series) ---
  const traceableLines = useMemo(() => {
    return lines
      .map((l, originalIdx) => ({ line: l, originalIdx }))
      .filter(({ line }) => {
        if (!line.itemId) return false;
        const item = masters.items.find((i: any) => i.id === line.itemId);
        return item && item.manageBy !== 'N';
      });
  }, [lines, masters.items]);

  // --- State local (pending por línea, reset al abrir) ---
  const [pending, setPending] = useState<Record<number, BatchDetail[]>>({});
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [leftSearch, setLeftSearch] = useState('');
  const [availableByItem, setAvailableByItem] = useState<Record<string, AvailableBatch[]>>({});
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [draftBatch, setDraftBatch] = useState('');
  // number puro: antes era string porque venía de e.target.value de un
  // <input type="number">; con NumberInput el valor ya llega numérico y
  // `null` representa el campo vacío.
  const [draftQty, setDraftQty] = useState<number | null>(null);
  const [draftExpiry, setDraftExpiry] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Resetear estado al abrir
  useEffect(() => {
    if (!isOpen) return;
    const init: Record<number, BatchDetail[]> = {};
    traceableLines.forEach(({ line, originalIdx }) => {
      init[originalIdx] = (line.batchDetails ?? []).map((b) => ({ ...b }));
    });
    setPending(init);
    setSelectedIdx(
      initialLineIdx != null && traceableLines.some((tl) => tl.originalIdx === initialLineIdx)
        ? initialLineIdx
        : (traceableLines[0]?.originalIdx ?? null),
    );
    setLeftSearch('');
    setDraftBatch('');
    setDraftQty(null);
    setDraftExpiry('');
  }, [isOpen]);

  // Esc cierra el modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Auto-focus del input al abrir el panel y cada vez que cambiamos de línea
  useEffect(() => {
    if (!isOpen || isSale) return;
    const t = setTimeout(() => draftInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isOpen, isSale, selectedIdx]);

  // --- Info de la línea seleccionada ---
  const selectedLine = selectedIdx != null ? lines[selectedIdx] : null;
  const selectedItem = selectedLine
    ? masters.items.find((i: any) => i.id === selectedLine.itemId)
    : null;
  const manageBy: 'B' | 'S' | undefined = selectedItem?.manageBy === 'S' ? 'S' : 'B';
  // En UoM base (cantidad tecleada × factor de conversión) — los lotes
  // (itemBatches/itemBatchStocks) siempre se contabilizan en unidad base,
  // igual que el stock global/por-almacén. Si no se convierte aquí, un
  // artículo vendido en una UoM con factor ≠ 1 asigna lotes por la cantidad
  // "tecleada" en vez de la física real, descuadrando el stock por lote
  // frente al stock global (que sí aplica el factor).
  const requiredQty = selectedLine
    ? Number(selectedLine.quantity || 0) * Number(selectedLine.uomFactor || 1)
    : 0;
  const assigned: BatchDetail[] = selectedIdx != null ? (pending[selectedIdx] ?? []) : [];
  const totalAssigned = assigned.reduce((a, b) => a + Number(b.quantity || 0), 0);
  const isBalanced = Math.abs(totalAssigned - requiredQty) < 0.0001;

  // Almacén efectivo: en modo 'line' cada línea puede tener su propio
  // almacén, así que se prioriza el de la línea; en modo 'header' (o sin
  // especificar) el almacén es único para todo el documento, así que se usa
  // SIEMPRE el de cabecera — `selectedLine.warehouseId` ahí puede haber
  // quedado desincronizado (almacén por defecto del artículo, o cabecera
  // cambiada después de crear la línea) y mostraría lotes/zonas de un
  // almacén que ya no es el seleccionado.
  const lineWarehouseId =
    warehouseLocation === 'line'
      ? selectedLine?.warehouseId || headerWarehouseId
      : headerWarehouseId;
  const defaultZoneId = selectedLine?.zoneId || '';
  // En venta, el "stock disponible" debe ser el de ESE almacén — un lote
  // puede existir físicamente en otro almacén distinto al de la línea, y
  // antes se mostraba igual (cantidad global), dejando elegir un lote que
  // luego el backend rechaza por no tener stock ahí. En compra no aplica
  // (no hay "disponible", se listan todos los lotes existentes tal cual).
  const availabilityKey = selectedItem
    ? `${selectedItem.id}::${isSale && lineWarehouseId ? lineWarehouseId : ''}`
    : null;
  // En venta, restringir a zonas donde el artículo tiene stock > 0 (mismo
  // criterio que el selector de Ubicación de la línea). En compra no aplica
  // — la zona es un destino de recepción, no requiere stock previo.
  const stockZones = isSale ? zonesWithStock.get(selectedItem?.id, lineWarehouseId) : undefined;
  const availableZones = useMemo(() => {
    const base = (zones ?? []).filter((z) => !lineWarehouseId || z.warehouseId === lineWarehouseId);
    return stockZones ? base.filter((z) => stockZones.some((sz) => sz.zoneId === z.id)) : base;
  }, [zones, lineWarehouseId, stockZones]);
  // Una sola vez por render en lugar de una por fila asignada.
  const zoneOptions = useMemo(
    () => availableZones.map((z) => ({ value: z.id, label: z.name })),
    [availableZones],
  );

  // Auto-advance: cuando la línea actual queda balanceada, saltar a la siguiente incompleta.
  // Sólo se dispara en transición de "no cuadrada" a "cuadrada" para no hacer saltos locos.
  const prevBalancedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!isOpen || !autoAdvance || selectedIdx == null) {
      prevBalancedRef.current = isBalanced;
      return;
    }
    if (isBalanced && !prevBalancedRef.current) {
      const currentPos = traceableLines.findIndex((tl) => tl.originalIdx === selectedIdx);
      if (currentPos >= 0) {
        for (let i = 1; i <= traceableLines.length; i++) {
          const next = traceableLines[(currentPos + i) % traceableLines.length];
          if (next.originalIdx === selectedIdx) break;
          const l = next.line;
          const req = Number(l.quantity || 0);
          const asig = (pending[next.originalIdx] ?? []).reduce(
            (a, b) => a + Number(b.quantity || 0),
            0,
          );
          if (Math.abs(asig - req) > 0.0001) {
            setSelectedIdx(next.originalIdx);
            break;
          }
        }
      }
    }
    prevBalancedRef.current = isBalanced;
  }, [isBalanced, isOpen, autoAdvance, selectedIdx, traceableLines, pending]);

  // --- Fetch de batches existentes para el item seleccionado ---
  // (En venta son los disponibles en stock; en compra son los ya existentes en el maestro de lotes.)
  useEffect(() => {
    if (!isOpen || !selectedItem || !token || !availabilityKey) return;
    if (availableByItem[availabilityKey]) return;
    setLoadingAvail(true);
    stockApi
      .batches(selectedItem.id, isSale && lineWarehouseId ? lineWarehouseId : undefined)
      // El endpoint devuelve más campos (warehouseId/zoneId/...) que el tipo
      // compartido BatchOrSerial — este componente los necesita todos.
      .then((data) => {
        const list = data as unknown as AvailableBatch[];
        setAvailableByItem((prev) => ({
          ...prev,
          [availabilityKey]: Array.isArray(list) ? list : [],
        }));
      })
      .catch(() => {
        setAvailableByItem((prev) => ({ ...prev, [availabilityKey]: [] }));
      })
      .finally(() => setLoadingAvail(false));
  }, [isOpen, selectedItem?.id, token, user?.tenantId, availabilityKey, isSale, lineWarehouseId]);

  // --- Derived: lista izquierda filtrada ---
  // En venta: restamos lo ya asignado para no pasar el stock disponible.
  // En compra: mostramos todos los lotes existentes del maestro tal cual (no hay stock "disponible" porque estamos recibiendo).
  const availableList: AvailableBatch[] = useMemo(() => {
    if (!selectedItem || !availabilityKey) return [];
    const source = availableByItem[availabilityKey] ?? [];
    const q = leftSearch.trim().toLowerCase();
    const filtered = source.filter((ab) => !q || ab.batchNum.toLowerCase().includes(q));
    if (!isSale) return filtered;
    return filtered
      .map((ab) => {
        const assignedQty = assigned
          .filter((a) => a.batchNum === ab.batchNum)
          .reduce((acc, cur) => acc + Number(cur.quantity || 0), 0);
        return { ...ab, quantity: Number(ab.quantity) - assignedQty };
      })
      .filter((ab) => ab.quantity > 0);
  }, [availableByItem, availabilityKey, leftSearch, assigned, isSale]);

  // --- Handlers ---
  const updatePending = (idx: number, next: BatchDetail[]) => {
    setPending((prev) => ({ ...prev, [idx]: next }));
  };

  const assignFromAvailable = (ab: AvailableBatch) => {
    if (selectedIdx == null) return;
    const remaining = Math.max(0, requiredQty - totalAssigned);
    if (remaining <= 0) return;
    // En venta tomamos del stock disponible (cap a lo que queda del lote); en compra podemos añadir lo que resta de la línea al lote existente.
    const cap = isSale ? Math.min(remaining, Number(ab.quantity)) : remaining;
    const takeQty = manageBy === 'S' ? 1 : cap;
    if (takeQty <= 0) return;
    const existing = assigned.find((a) => a.batchNum === ab.batchNum);
    let next: BatchDetail[];
    // Para venta, heredamos la zona origen del lote si la hay; para compra, la zona por defecto de la línea
    const inheritedZone = isSale ? ab.zoneId || defaultZoneId : defaultZoneId;
    if (existing && manageBy === 'B') {
      next = assigned.map((a) =>
        a.batchNum === ab.batchNum ? { ...a, quantity: Number(a.quantity) + takeQty } : a,
      );
    } else if (existing && manageBy === 'S') {
      return;
    } else {
      next = [
        ...assigned,
        {
          batchNum: ab.batchNum,
          quantity: takeQty,
          expiryDate: ab.expiryDate,
          zoneId: inheritedZone || undefined,
        },
      ];
    }
    updatePending(selectedIdx, next);
  };

  const unassign = (batchNum: string) => {
    if (selectedIdx == null) return;
    updatePending(
      selectedIdx,
      assigned.filter((a) => a.batchNum !== batchNum),
    );
  };

  const updateAssignedQty = (batchNum: string, qty: number) => {
    if (selectedIdx == null) return;
    updatePending(
      selectedIdx,
      assigned.map((a) => (a.batchNum === batchNum ? { ...a, quantity: qty } : a)),
    );
  };

  const updateAssignedZone = (batchNum: string, zoneId: string) => {
    if (selectedIdx == null) return;
    updatePending(
      selectedIdx,
      assigned.map((a) => (a.batchNum === batchNum ? { ...a, zoneId: zoneId || undefined } : a)),
    );
  };

  const setZoneForAll = (zoneId: string) => {
    if (selectedIdx == null) return;
    updatePending(
      selectedIdx,
      assigned.map((a) => ({ ...a, zoneId: zoneId || undefined })),
    );
  };

  // Expande un rango como "S0001-S0005" a ["S0001","S0002",...,"S0005"].
  // Soporta prefijo alfanumérico + número, separados por "-" o ":".
  const expandRange = (token: string): string[] => {
    const m = token.match(/^([A-Za-z_-]*?)(\d+)\s*[-:]\s*([A-Za-z_-]*?)(\d+)$/);
    if (!m) return [token];
    const [, pfxA, numA, pfxB, numB] = m;
    const pfx = pfxA || pfxB;
    const start = Number(numA);
    const end = Number(numB);
    if (end < start || end - start > 500) return [token];
    const pad = numA.length;
    const out: string[] = [];
    for (let i = start; i <= end; i++) out.push(`${pfx}${String(i).padStart(pad, '0')}`);
    return out;
  };

  // Parsea una cadena con posibles delimitadores y rangos, devuelve lista de batch numbers.
  const parseBatchInput = (raw: string): string[] => {
    const parts = raw
      .split(/[,;\n\t]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const all: string[] = [];
    for (const p of parts) all.push(...expandRange(p));
    return all;
  };

  const addDraft = useCallback(() => {
    if (selectedIdx == null) return;
    const raw = draftBatch.trim();
    if (!raw) return;
    const tokens = parseBatchInput(raw);
    if (tokens.length === 0) return;

    const existing = new Set(assigned.map((a) => a.batchNum));
    let currentAssigned = [...assigned];
    let added = 0;

    if (manageBy === 'S') {
      // Series: 1 por batchNum, respeta cantidad requerida
      const remaining = Math.max(0, Math.round(requiredQty) - assigned.length);
      for (const num of tokens) {
        if (added >= remaining) break;
        if (existing.has(num)) continue;
        currentAssigned.push({
          batchNum: num,
          quantity: 1,
          zoneId: defaultZoneId || undefined,
        });
        existing.add(num);
        added++;
      }
    } else {
      // Lotes: cada batchNum recibe la cantidad del input (0 si vacío, editable luego).
      const qtyPer = draftQty ?? 0;
      if (qtyPer <= 0 && tokens.length === 1) return; // lote suelto sin cantidad → bloqueamos
      const expiry = draftExpiry || undefined;
      for (const num of tokens) {
        if (existing.has(num)) continue;
        currentAssigned.push({
          batchNum: num,
          quantity: qtyPer,
          expiryDate: expiry,
          zoneId: defaultZoneId || undefined,
        });
        existing.add(num);
        added++;
      }
    }

    if (added > 0) {
      updatePending(selectedIdx, currentAssigned);
    }
    setDraftBatch('');
    setDraftQty(null);
    setDraftExpiry('');
    // Mantener foco para seguir pum pum pum
    setTimeout(() => draftInputRef.current?.focus(), 0);
  }, [selectedIdx, draftBatch, draftQty, draftExpiry, assigned, manageBy, requiredQty]);

  // Paste handler: procesa directamente el contenido pegado sin esperar a onChange.
  const handleDraftPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    // Si el contenido tiene algún delimitador o es un rango, procesamos como múltiple
    if (/[,;\n\t]|[-:]\d/.test(text)) {
      e.preventDefault();
      setDraftBatch(text);
      // Programar un addDraft inmediato una vez el estado se haya asentado
      setTimeout(() => {
        // Llamamos a la lógica directamente con el texto pegado
        const tokens = parseBatchInput(text);
        if (selectedIdx == null || tokens.length === 0) return;
        const existing = new Set(assigned.map((a) => a.batchNum));
        let currentAssigned = [...assigned];
        let added = 0;
        if (manageBy === 'S') {
          const remaining = Math.max(0, Math.round(requiredQty) - assigned.length);
          for (const num of tokens) {
            if (added >= remaining) break;
            if (existing.has(num)) continue;
            currentAssigned.push({
              batchNum: num,
              quantity: 1,
              zoneId: defaultZoneId || undefined,
            });
            existing.add(num);
            added++;
          }
        } else {
          const qtyPer = draftQty ?? 0;
          const expiry = draftExpiry || undefined;
          for (const num of tokens) {
            if (existing.has(num)) continue;
            currentAssigned.push({
              batchNum: num,
              quantity: qtyPer,
              expiryDate: expiry,
              zoneId: defaultZoneId || undefined,
            });
            existing.add(num);
            added++;
          }
        }
        if (added > 0) updatePending(selectedIdx, currentAssigned);
        setDraftBatch('');
        draftInputRef.current?.focus();
      }, 0);
    }
  };

  const autoFillRemaining = () => {
    if (selectedIdx == null || !isSale) return;
    const remaining = requiredQty - totalAssigned;
    if (remaining <= 0) return;
    let left = remaining;
    const additions: BatchDetail[] = [];
    // FIFO real: caducidad más próxima primero (nulls al final) — la lista
    // que llega de availableList viene ordenada por cantidad desc (así la
    // devuelve el backend para la búsqueda), no sirve tal cual para "Auto FIFO".
    const fifoOrder = [...availableList].sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
    });
    for (const ab of fifoOrder) {
      if (left <= 0) break;
      const take = manageBy === 'S' ? 1 : Math.min(left, ab.quantity);
      if (take <= 0) continue;
      additions.push({
        batchNum: ab.batchNum,
        quantity: take,
        expiryDate: ab.expiryDate,
        // Heredamos la zona origen del lote (el FIFO tiene sentido por ubicación)
        zoneId: ab.zoneId || defaultZoneId || undefined,
      });
      left -= take;
    }
    // Merge con lo ya asignado
    const merged: BatchDetail[] = [...assigned];
    for (const add of additions) {
      const idx = merged.findIndex((m) => m.batchNum === add.batchNum);
      if (idx >= 0 && manageBy === 'B') {
        merged[idx] = { ...merged[idx], quantity: Number(merged[idx].quantity) + add.quantity };
      } else if (idx < 0) {
        merged.push(add);
      }
    }
    updatePending(selectedIdx, merged);
  };

  const handleSave = () => {
    const updates = Object.entries(pending).map(([idx, batchDetails]) => ({
      idx: Number(idx),
      batchDetails,
    }));
    onSave(updates);
    onClose();
  };

  // ============================================================
  //                          RENDER
  // ============================================================
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Gestión de trazabilidad"
      subtitle="Asigna lotes y series a las líneas del documento"
      maxWidth="7xl"
    >
      <div className="flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        {/* ----------- TOP GRID: Líneas del documento ----------- */}
        <div className="rounded-xl border border-border-default bg-bg-muted overflow-hidden">
          <div className="px-4 py-2 bg-bg-muted border-b border-border-default flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
              Líneas del documento
            </p>
            <p className="text-[10px] font-bold text-fg-subtle">
              {traceableLines.length} línea{traceableLines.length === 1 ? '' : 's'} con trazabilidad
            </p>
          </div>
          <div className="max-h-[180px] overflow-auto">
            <table className="w-full text-[12px] min-w-[520px]">
              <thead className="sticky top-0 bg-bg-muted backdrop-blur-sm border-b border-border-default">
                <tr className="text-[9px] font-black uppercase tracking-widest text-fg-subtle">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Artículo</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-right">Requerido</th>
                  <th className="px-3 py-2 text-right">Asignado</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                  <th className="px-3 py-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {traceableLines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-xs text-fg-subtle italic">
                      No hay líneas con lotes o series en este documento.
                    </td>
                  </tr>
                )}
                {traceableLines.map(({ line, originalIdx }, i) => {
                  const item = masters.items.find((it: any) => it.id === line.itemId);
                  const type = item?.manageBy === 'S' ? 'Serie' : 'Lote';
                  const req = Number(line.quantity || 0);
                  const asig = (pending[originalIdx] ?? []).reduce(
                    (a, b) => a + Number(b.quantity || 0),
                    0,
                  );
                  const pend = req - asig;
                  const balanced = Math.abs(pend) < 0.0001;
                  const isSelected = originalIdx === selectedIdx;
                  return (
                    <tr
                      key={originalIdx}
                      onClick={() => setSelectedIdx(originalIdx)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-primary/10 dark:bg-primary/15' : 'hover:bg-bg-hover',
                      )}
                    >
                      <td className="px-3 py-2 text-fg-subtle font-mono text-[11px]">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isSelected && (
                            <div className="w-1 h-6 bg-primary rounded-full shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-fg-default truncate">
                              {item?.name || '—'}
                            </p>
                            <p className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider font-mono">
                              {item?.code || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[9px] font-black uppercase tracking-wider border border-indigo-100 dark:border-indigo-500/20">
                          {type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-fg-body">
                        {req.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-fg-body">
                        {asig.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-black tabular-nums',
                          balanced
                            ? 'text-emerald-600 dark:text-emerald-300'
                            : pend > 0
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-rose-600 dark:text-rose-300',
                        )}
                      >
                        {pend.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {balanced ? (
                          <Check size={14} className="inline text-emerald-500" />
                        ) : (
                          <AlertCircle
                            size={14}
                            className={cn('inline', pend > 0 ? 'text-amber-500' : 'text-rose-500')}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ----------- BOTTOM: Dos grids lado a lado ----------- */}
        {selectedLine && selectedItem && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
            {/* -------- IZQUIERDA: Lista de lotes/series existentes -------- */}
            <div className="rounded-xl border border-border-default bg-bg-card flex flex-col overflow-hidden min-h-[320px]">
              <div className="px-4 py-2 bg-bg-muted border-b border-border-default flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
                  {isSale
                    ? 'Stock disponible'
                    : `${manageBy === 'S' ? 'Series' : 'Lotes'} existentes`}
                </p>
                {isSale && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={autoFillRemaining}
                    disabled={isBalanced}
                    title="Asigna automáticamente en orden FIFO hasta completar la cantidad pendiente"
                    className="gap-1.5"
                  >
                    <Zap size={11} className={isBalanced ? '' : 'animate-pulse'} />
                    Auto FIFO
                  </Button>
                )}
              </div>

              {/* Search */}
              <div className="p-2 border-b border-border-subtle">
                <Input
                  inputSize="sm"
                  leftIcon={<Search size={12} />}
                  placeholder={`Buscar ${manageBy === 'S' ? 'serie' : 'lote'}...`}
                  value={leftSearch}
                  onChange={(e) => setLeftSearch(e.target.value)}
                />
              </div>

              {/* Crear nuevo (solo compra) */}
              {!isSale && (
                <div className="p-2 border-b border-border-subtle bg-amber-50/40 dark:bg-amber-500/5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {/* El lector USB y la cámara escriben aquí: `inputRef` expone el
                        <input> interno para mantener el foco entre lecturas, y el
                        onPaste sigue tokenizando lo pegado. */}
                    <Input
                      inputRef={draftInputRef}
                      inputSize="sm"
                      value={draftBatch}
                      onChange={(e) => setDraftBatch(e.target.value)}
                      onPaste={handleDraftPaste}
                      placeholder={
                        manageBy === 'S'
                          ? 'S0001 o S0001,S0002 o S0001-S0010...'
                          : 'L-001 o L-001,L-002...'
                      }
                      containerClassName="flex-1 min-w-0"
                      className="font-mono font-bold"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addDraft();
                        }
                      }}
                    />
                    {manageBy === 'B' && (
                      <>
                        <NumberInput
                          value={draftQty}
                          onChange={setDraftQty}
                          precision={2}
                          min={0}
                          placeholder="Cant."
                          inputSize="sm"
                          containerClassName="w-20 shrink-0"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addDraft();
                            }
                          }}
                        />
                        <DatePicker
                          value={draftExpiry || null}
                          onChange={(v) => setDraftExpiry(v ?? '')}
                          clearable
                          className="w-36 shrink-0"
                        />
                      </>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setCameraOpen(true)}
                      title="Escanear con cámara"
                      className="shrink-0"
                    >
                      <Camera size={14} />
                    </Button>
                    {/* `draftQty == null` y no `!draftQty`: teclear 0 debe seguir
                        habilitando el botón (antes '0' era string y era truthy). */}
                    <Button
                      type="button"
                      size="sm"
                      onClick={addDraft}
                      disabled={!draftBatch.trim() || (manageBy === 'B' && draftQty == null)}
                      title="Añadir nuevo (Enter)"
                      className="shrink-0"
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                  <p className="text-[9px] text-fg-subtle italic px-1 leading-tight">
                    Pega con <kbd className="font-mono">,</kbd> <kbd className="font-mono">;</kbd> o
                    saltos de línea · rangos tipo <kbd className="font-mono">S0001-S0010</kbd> · usa{' '}
                    <kbd className="font-mono">📷</kbd> para escanear con cámara o un lector USB
                  </p>
                </div>
              )}

              {/* Lista de existentes */}
              <div className="flex-1 overflow-y-auto max-h-[320px]">
                {loadingAvail ? (
                  <p className="p-4 text-[11px] text-fg-subtle italic text-center">
                    Cargando {manageBy === 'S' ? 'series' : 'lotes'}...
                  </p>
                ) : availableList.length === 0 ? (
                  <p className="p-4 text-[11px] text-fg-subtle italic text-center">
                    {isSale
                      ? 'No hay stock disponible con trazabilidad.'
                      : `No hay ${manageBy === 'S' ? 'series' : 'lotes'} previos para este artículo.`}
                  </p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-bg-muted backdrop-blur-sm border-b border-border-subtle">
                      <tr className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">
                        <th className="px-2 py-1.5 text-left">
                          {manageBy === 'S' ? 'Nº Serie' : 'Lote'}
                        </th>
                        {manageBy === 'B' && (
                          <th className="px-2 py-1.5 text-right">
                            {isSale ? 'Disp.' : 'En stock'}
                          </th>
                        )}
                        {isSale && <th className="px-2 py-1.5 text-left">Ubicación</th>}
                        {!isSale && manageBy === 'B' && (
                          <th className="px-2 py-1.5 text-left">Caduc.</th>
                        )}
                        <th className="px-2 py-1.5 w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {availableList.map((ab) => {
                        const alreadyAssigned =
                          manageBy === 'S' && assigned.some((a) => a.batchNum === ab.batchNum);
                        return (
                          <tr
                            key={ab.batchNum}
                            onDoubleClick={() => !alreadyAssigned && assignFromAvailable(ab)}
                            className={cn(
                              'transition-colors',
                              alreadyAssigned
                                ? 'opacity-40 line-through'
                                : 'hover:bg-primary/5 cursor-pointer',
                            )}
                          >
                            <td className="px-2 py-1.5 font-mono font-bold text-fg-body">
                              {ab.batchNum}
                            </td>
                            {manageBy === 'B' && (
                              <td className="px-2 py-1.5 text-right font-bold tabular-nums text-fg-body">
                                {Number(ab.quantity).toFixed(2)}
                              </td>
                            )}
                            {isSale && (
                              <td className="px-2 py-1.5 text-fg-subtle text-[10px] truncate">
                                {ab.warehouseName || '—'}
                                {ab.zoneName ? ` / ${ab.zoneName}` : ''}
                              </td>
                            )}
                            {!isSale && manageBy === 'B' && (
                              <td className="px-2 py-1.5 text-[10px] text-fg-subtle tabular-nums">
                                {ab.expiryDate ? new Date(ab.expiryDate).toLocaleDateString() : '—'}
                              </td>
                            )}
                            <td className="px-2 py-1.5">
                              {!alreadyAssigned && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => assignFromAvailable(ab)}
                                  title="Asignar"
                                >
                                  <ChevronRight size={14} />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* -------- DERECHA: Asignado a esta línea -------- */}
            <div className="rounded-xl border border-border-default bg-bg-card flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-bg-muted border-b border-border-default flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
                  Asignado
                </p>
                <div className="flex items-center gap-3">
                  {/* Preferencia que surte efecto al instante (no se guarda con
                      ningún botón), así que Switch en vez de Checkbox. */}
                  <span title="Salta a la siguiente línea incompleta al cuadrar la actual">
                    <Switch
                      size="sm"
                      checked={autoAdvance}
                      onChange={setAutoAdvance}
                      label="Auto-avance"
                    />
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                    <span className="text-fg-subtle tabular-nums">
                      {manageBy === 'S'
                        ? `${assigned.length} / ${Math.round(requiredQty)} series`
                        : `${totalAssigned.toFixed(2)} / ${requiredQty.toFixed(2)}`}
                    </span>
                    {isBalanced ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <AlertCircle size={12} className="text-amber-500" />
                    )}
                  </div>
                </div>
              </div>
              {showZoneColumn && assigned.length > 0 && (
                <div className="px-3 py-2 border-b border-border-subtle bg-indigo-50/40 dark:bg-indigo-500/5 flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-fg-muted shrink-0">
                    Zona todos:
                  </span>
                  {/* Actúa como acción, no como campo: el valor vuelve siempre a
                      vacío tras aplicar la zona a todas las filas. */}
                  <SearchableSelect
                    options={zoneOptions}
                    value=""
                    onChange={(v) => {
                      if (v) setZoneForAll(v);
                    }}
                    placeholder="— aplicar a todas las filas —"
                    className="flex-1"
                  />
                </div>
              )}
              <div className="flex-1 overflow-y-auto max-h-[260px]">
                {assigned.length === 0 ? (
                  <EmptyState
                    icon={<Package size={24} />}
                    title={`Sin ${manageBy === 'S' ? 'series' : 'lotes'} asignados`}
                  />
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-bg-muted backdrop-blur-sm border-b border-border-subtle">
                      <tr className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">
                        <th className="px-2 py-1.5 w-6"></th>
                        <th className="px-2 py-1.5 text-left">
                          {manageBy === 'S' ? 'Nº Serie' : 'Lote'}
                        </th>
                        {manageBy === 'B' && <th className="px-2 py-1.5 text-right">Cant.</th>}
                        {manageBy === 'B' && <th className="px-2 py-1.5 text-left">Caducidad</th>}
                        {showZoneColumn && <th className="px-2 py-1.5 text-left">Zona</th>}
                        <th className="px-2 py-1.5 w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {assigned.map((a) => (
                        <tr key={a.batchNum} className="hover:bg-bg-hover">
                          <td className="px-2 py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => unassign(a.batchNum)}
                              title="Quitar"
                            >
                              <ChevronLeft size={14} />
                            </Button>
                          </td>
                          <td className="px-2 py-1.5 font-mono font-bold text-fg-body">
                            {a.batchNum}
                          </td>
                          {manageBy === 'B' && (
                            <td className="px-2 py-1.5 text-right">
                              <NumberInput
                                value={a.quantity}
                                onChange={(v) => updateAssignedQty(a.batchNum, v ?? 0)}
                                precision={2}
                                min={0}
                                emptyValue="zero"
                                align="right"
                                inputSize="sm"
                                containerClassName="w-20"
                              />
                            </td>
                          )}
                          {manageBy === 'B' && (
                            <td className="px-2 py-1.5 text-[10px] text-fg-subtle tabular-nums">
                              {a.expiryDate ? new Date(a.expiryDate).toLocaleDateString() : '—'}
                            </td>
                          )}
                          {showZoneColumn && (
                            <td className="px-2 py-1.5">
                              <SearchableSelect
                                options={zoneOptions}
                                value={a.zoneId || ''}
                                onChange={(v) => updateAssignedZone(a.batchNum, v)}
                                clearable
                                placeholder="—"
                                className="max-w-[140px]"
                              />
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => unassign(a.batchNum)}
                              title="Eliminar"
                            >
                              <Trash2 size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {selectedItem && (
                <div className="px-3 py-2 bg-bg-muted border-t border-border-subtle flex items-center justify-between text-[10px]">
                  <span className="font-bold text-fg-muted truncate">
                    <Barcode size={10} className="inline mr-1" />
                    {selectedItem.name}
                  </span>
                  <span className="font-black uppercase tracking-wider text-fg-subtle shrink-0 ml-2">
                    {assigned.length} línea{assigned.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------- FOOTER ----------- */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-subtle">
          <p className="text-[11px] text-fg-subtle italic">
            {
              traceableLines.filter(({ originalIdx }) => {
                const l = lines[originalIdx];
                const a = (pending[originalIdx] ?? []).reduce(
                  (acc, b) => acc + Number(b.quantity || 0),
                  0,
                );
                return Math.abs(Number(l.quantity || 0) - a) < 0.0001;
              }).length
            }{' '}
            de {traceableLines.length} líneas cuadradas
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="flex items-center gap-2">
              <Check size={16} /> Guardar asignaciones
            </Button>
          </div>
        </div>
      </div>

      <BarcodeCameraModal
        open={cameraOpen}
        continuous
        onClose={() => {
          setCameraOpen(false);
          setTimeout(() => draftInputRef.current?.focus(), 50);
        }}
        onScan={(code) => {
          // Cada lectura se añade inmediatamente (no bloquea el modal — escáner
          // continuo). Separamos con coma para que `parseBatchInput` lo tokenice.
          setDraftBatch((prev) => (prev ? `${prev.trim()},${code}` : code));
        }}
      />
    </Modal>
  );
};
