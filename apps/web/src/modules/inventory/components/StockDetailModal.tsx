import React, { useMemo, useState } from 'react';
import { Modal, Table, Loader, Button, Badge } from '@openfactu/ui';
import { Tag, Package, Warehouse, Boxes } from 'lucide-react';
import { useFormat } from '../../../hooks/useFormat';

interface Batch {
  batchNum: string;
  warehouseName: string;
  quantity: number;
  expiryDate?: string;
  zoneName?: string;
}
interface WarehouseStock {
  warehouseName: string;
  stock: number;
}
interface ZoneStock {
  warehouseId: string;
  zoneId: string;
  zoneName: string;
  warehouseName: string;
  stock: number;
}

interface StockDetail {
  warehouseStock?: WarehouseStock[];
  zoneStock?: ZoneStock[];
  batches?: Batch[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  selectedStockItem?: { name?: string; manageBy?: string } | null;
  stockDetail?: StockDetail | null;
  loading?: boolean;
  defaultUnified?: boolean;
}

/** Cabecera de sección reutilizable (icono + título + acción opcional). */
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, children, action }) => (
  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{icon}</span>
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 truncate">
        {children}
      </p>
    </div>
    {action}
  </div>
);

export const StockDetailModal: React.FC<Props> = ({
  isOpen,
  onClose,
  title = 'Detalle de Inventario',
  subtitle,
  selectedStockItem,
  stockDetail,
  loading,
  defaultUnified = true,
}) => {
  const fmt = useFormat();
  const [showUnified, setShowUnified] = useState<boolean>(!!defaultUnified);

  const warehouseStock = stockDetail?.warehouseStock ?? [];
  const zoneStock = stockDetail?.zoneStock ?? [];
  const tracksBatches = selectedStockItem?.manageBy !== 'N';

  const totalStock = useMemo(
    () => warehouseStock.reduce((acc, w) => acc + Number(w.stock || 0), 0),
    [warehouseStock],
  );

  // Filas de trazabilidad. En vista unificada, si no hay lotes usamos el
  // reparto por zona/almacén como fallback para que siempre se vea algo.
  const traceData = useMemo<Batch[]>(() => {
    const realBatches = (stockDetail?.batches ?? []).filter((b) => Number(b.quantity) > 0);
    if (!showUnified) return realBatches;
    if (realBatches.length) return realBatches;
    const fromZones = zoneStock.map((z) => ({
      batchNum: '',
      warehouseName: z.warehouseName,
      quantity: z.stock,
      zoneName: z.zoneName,
    }));
    if (fromZones.length) return fromZones;
    return warehouseStock.map((w) => ({
      batchNum: '',
      warehouseName: w.warehouseName,
      quantity: w.stock,
      zoneName: '',
    }));
  }, [stockDetail?.batches, zoneStock, warehouseStock, showUnified]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${title}: ${selectedStockItem?.name || ''}`}
      subtitle={subtitle}
      maxWidth="5xl"
    >
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <Loader />
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Resumen */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Boxes size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wide">Stock total físico</span>
            </div>
            <span className="text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {totalStock.toFixed(2)}
            </span>
          </div>

          {/* Dos columnas: izquierda resumen (almacén + zonas), derecha trazabilidad */}
          <div className={`grid grid-cols-1 gap-5 ${tracksBatches ? 'lg:grid-cols-2' : ''}`}>
            {/* Columna izquierda */}
            <div className="space-y-4 min-w-0">
              {/* Stock por almacén */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <SectionHeader icon={<Warehouse size={12} />}>Stock por Almacén</SectionHeader>
                <Table
                  className="w-full"
                  density="compact"
                  emptyMessage="Sin existencias físicas en ningún almacén."
                  data={warehouseStock}
                  columns={[
                    {
                      header: 'Almacén',
                      primary: true,
                      cell: (item: WarehouseStock) => (
                        <span className="truncate">{item.warehouseName}</span>
                      ),
                    },
                    {
                      header: 'Stock Físico',
                      align: 'right',
                      width: '32%',
                      cell: (item: WarehouseStock) => (
                        <span className="font-mono tabular-nums">{Number(item.stock).toFixed(2)}</span>
                      ),
                    },
                  ]}
                />
              </div>

              {/* Reparto por zonas */}
              {zoneStock.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <SectionHeader icon={<Package size={12} />}>Reparto por Ubicaciones (Zonas)</SectionHeader>
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {zoneStock.map((zs) => (
                      <div
                        key={`${zs.warehouseId}-${zs.zoneId}`}
                        className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col gap-1 hover:border-primary/40 transition-colors"
                      >
                        <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none truncate">
                          {zs.zoneName}
                        </span>
                        <div className="flex justify-between items-end gap-1">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase truncate">
                            {zs.warehouseName}
                          </span>
                          <span className="text-lg font-black text-slate-900 dark:text-slate-100 font-mono tracking-tighter leading-none tabular-nums">
                            {Number(zs.stock).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Columna derecha: trazabilidad por lote/serie */}
            {tracksBatches && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-w-0">
                <SectionHeader
                  icon={<Tag size={12} />}
                  action={
                    <Button size="sm" variant="ghost" onClick={() => setShowUnified((s) => !s)}>
                      {showUnified ? 'Solo lotes' : 'Incluir sin lote'}
                    </Button>
                  }
                >
                  Trazabilidad por Lote/Serie
                </SectionHeader>

                {traceData.length ? (
                  <div className="overflow-auto max-h-[55vh]">
                    <Table
                      className="w-full"
                      density="compact"
                      data={traceData}
                      columns={[
                        {
                          header: 'Lote / Serie',
                          width: '24%',
                          cell: (item: Batch) =>
                            item.batchNum ? (
                              <Badge variant="neutral" className="font-mono">
                                {item.batchNum}
                              </Badge>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            ),
                        },
                        {
                          header: 'Almacén',
                          cell: (item: Batch) => <span className="truncate">{item.warehouseName}</span>,
                        },
                        {
                          header: 'Cant.',
                          align: 'right',
                          width: '14%',
                          cell: (item: Batch) => (
                            <span className="font-mono tabular-nums">{Number(item.quantity)}</span>
                          ),
                        },
                        {
                          header: 'Caducidad',
                          align: 'right',
                          width: '20%',
                          cell: (item: Batch) => (
                            <span className="text-slate-500 dark:text-slate-400">
                              {fmt.date(item?.expiryDate || null) || '—'}
                            </span>
                          ),
                        },
                        {
                          header: 'Ubicación',
                          align: 'right',
                          width: '18%',
                          cell: (item: Batch) => (
                            <span className="truncate text-slate-500 dark:text-slate-400">
                              {item.zoneName || '—'}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
                    <Package size={24} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                      No hay lotes o series con existencias disponibles en este momento.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pie */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default StockDetailModal;
