/**
 * Recuentos, sin React: los tipos de la API y lo que necesitan las pantallas. Las reglas de verdad
 * están en el servidor (`core/inventory`).
 */
export type CountStatus = 'open' | 'review' | 'closed' | 'cancelled';

export interface CountRow {
  id: string;
  code: string;
  status: CountStatus;
  blind: boolean;
  createdAt: string;
  closedAt: string | null;
  warehouseName: string | null;
  zoneName: string | null;
  categoryName: string | null;
  totalLines: number;
  countedLines: number;
}

export interface CountOptions {
  warehouses: Array<{ id: string; name: string }>;
  zones: Array<{ id: string; name: string; warehouseId: string | null }>;
  categories: Array<{ id: string; name: string }>;
}

export interface CountAllocation {
  zoneId: string | null;
  batchNum: string | null;
  quantity: number;
}

export interface CountLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string | null;
  manageBy: string;
  zoneId: string | null;
  zoneName: string | null;
  batchNum: string | null;
  countedQty: number | null;
  countedAt: string | null;
  addedDuringCount: boolean;
  // Lo que sigue no llega mientras se cuenta a ciegas.
  expectedQty?: number;
  systemAtCount?: number | null;
  stockNow?: number;
  difference?: number;
  appliedQty?: number | null;
  movedBeforeCount?: number | null;
  movedAfterCount?: number | null;
  finalStock?: number;
  allocations?: CountAllocation[];
  needsBatch?: boolean;
  batchOptions?: Array<{ batchNum: string; quantity: number }>;
  differenceValue?: number;
}

export interface CountSummary {
  total: number;
  counted: number;
  pending: number;
  withDifference?: number;
  needsBatch?: number;
}

export interface CountDetail {
  id: string;
  code: string;
  status: CountStatus;
  blind: boolean;
  revealed: boolean;
  notes: string | null;
  warehouseId: string;
  warehouseName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  categoryName: string | null;
  createdAt: string;
  closedAt: string | null;
  receiptCode: string | null;
  issueCode: string | null;
  lines: CountLine[];
  summary: CountSummary;
}

export interface CountItemOption {
  id: string;
  code: string;
  name: string;
  manageBy: string;
}

export type ScanOutcome =
  | { outcome: 'counted'; line: CountLine }
  | { outcome: 'choose'; lines: CountLine[] }
  | { outcome: 'needs_batch'; item: CountItemOption };

export interface CountProblem {
  lineId: string;
  code: 'NEEDS_BATCH' | 'NEGATIVE';
  message: string;
}

export const COUNT_STATUS_VARIANT: Record<CountStatus, 'info' | 'warning' | 'success' | 'neutral'> =
  {
    open: 'info',
    review: 'warning',
    closed: 'success',
    cancelled: 'neutral',
  };

export type LineFilter = 'pending' | 'counted' | 'difference' | 'all';

/** Los filtros que tienen sentido en cada momento, el primero el que se ve al entrar. */
export function allowedFilters(context: { counting: boolean; revealed: boolean }): LineFilter[] {
  if (context.counting) return ['pending', 'counted', 'all'];
  return context.revealed ? ['difference', 'counted', 'all'] : ['counted', 'all'];
}

export const isTracked = (line: { manageBy: string }) => line.manageBy !== 'N';

/** Una serie está o no está: se cuenta con 0 o 1. */
export const isSerialLine = (line: { manageBy: string; batchNum: string | null }) =>
  line.manageBy === 'S' && !!line.batchNum;

export function filterLines(lines: CountLine[], filter: LineFilter, query: string): CountLine[] {
  const term = query.trim().toLowerCase();
  return lines.filter((line) => {
    if (filter === 'pending' && line.countedQty !== null) return false;
    if (filter === 'counted' && line.countedQty === null) return false;
    if (filter === 'difference' && !line.difference) return false;
    if (!term) return true;
    return [line.itemCode, line.itemName, line.batchNum, line.zoneName].some((text) =>
      text?.toLowerCase().includes(term),
    );
  });
}

/** Sustituye o añade una línea, y vuelve a sacar las cuentas de la cabecera. */
export function withLine(count: CountDetail, line: CountLine): CountDetail {
  const known = count.lines.some((row) => row.id === line.id);
  const lines = known
    ? count.lines.map((row) => (row.id === line.id ? line : row))
    : [...count.lines, line];
  const counted = lines.filter((row) => row.countedQty !== null).length;
  return {
    ...count,
    lines,
    summary: {
      ...count.summary,
      total: lines.length,
      counted,
      pending: lines.length - counted,
    },
  };
}

export const countProgress = (summary: CountSummary) =>
  summary.total === 0 ? 0 : Math.round((summary.counted / summary.total) * 100);

export const countPercentOf = (row: CountRow) =>
  row.totalLines === 0 ? 0 : Math.round((row.countedLines / row.totalLines) * 100);

/** Qué le falta a un reparto de lotes para poder guardarse. */
export function allocationGap(
  difference: number,
  rows: Array<{ batchNum: string; quantity: number | null }>,
): number {
  const total = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  return Math.round((difference - total) * 1e4) / 1e4;
}

interface PermissionUser {
  role?: string;
  permissions?: Record<string, { read?: boolean; write?: boolean } | undefined>;
}

const isAdmin = (user?: PermissionUser) => user?.role === 'SUPERUSER' || user?.role === 'ADMIN';

/** En la ficha la ruta lleva el id, así que el permiso no se puede sacar de la URL. */
export const canWriteCounts = (user?: PermissionUser) =>
  isAdmin(user) || !!user?.permissions?.['/inventory/counts']?.write;

export const canReviewCounts = (user?: PermissionUser) =>
  isAdmin(user) || !!user?.permissions?.['/inventory/count-review']?.write;
