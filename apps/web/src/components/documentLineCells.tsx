import React from 'react';
import {
  Barcode,
  Plus,
  Trash2,
  Copy as CopyIcon,
  Tag,
  Layers3,
  Package,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button, Input, SearchableSelect } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { DocKind, DocSide, DocStatus } from '@openfactu/common';
import { LabelPrintButton } from './LabelPrintButton';
import { PluginFieldInput, PluginFieldValue } from './plugin-fields';

export type { DocKind, DocSide } from '@openfactu/common';

/**
 * Input numérico con buffer de texto local mientras está enfocado.
 *
 * Permite teclear libremente "0", "0,", "1.50", etc. sin que el valor se
 * reconvierta a número en cada pulsación (que es lo que impedía escribir
 * decimales o ceros: el `parseFloat` del hook + el reformateo del value
 * controlado se comían el punto y los ceros). Al perder el foco se muestra el
 * valor ya formateado con `format`.
 */
const DecimalInput: React.FC<{
  value: number | string | null | undefined;
  onCommit: (value: number) => void;
  format: (v: any) => string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}> = ({ value, onCommit, format, disabled, placeholder, className }) => {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState('');

  const display = editing ? text : format(value);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      disabled={disabled}
      onFocus={(e) => {
        setEditing(true);
        setText(value == null || value === '' || Number(value) === 0 ? '' : String(value));
        e.target.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Solo dígitos y un separador decimal (coma o punto). Deja escribir
        // estados intermedios como "", "0", "0,", "1.".
        if (!/^\d*[.,]?\d*$/.test(raw)) return;
        setText(raw);
        const parsed = parseFloat(raw.replace(',', '.'));
        onCommit(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setEditing(false)}
      placeholder={placeholder}
      className={className}
    />
  );
};

interface Masters {
  items: any[];
  taxGroups?: any[];
  warehouses?: any[];
  internalOrders?: any[];
}

interface BuilderOpts {
  kind: DocKind;
  side: DocSide;
  masters: Masters;
  zones?: any[];
  onViewBatch?: (line: any) => void;
  fmt: {
    money: (v: number | string | null | undefined) => string;
    number: (v: number | string | null | undefined, precision?: number) => string;
  };
  /** Campos de plugin renderizados como columnas read-only al final. */
  pluginLineFields?: Array<{
    id: string;
    fieldName: string;
    fieldType:
      | 'TEXT'
      | 'INTEGER'
      | 'DECIMAL'
      | 'BOOLEAN'
      | 'DATE'
      | 'JSONB'
      | 'ENUM'
      | 'MULTISELECT'
      | 'CURRENCY'
      | 'PERCENT'
      | 'URL'
      | 'EMAIL'
      | 'PHONE'
      | 'COLOR'
      | 'REFERENCE'
      | 'FILE';
    label: string;
    options?: Array<{ value: string; label: string }> | null;
    required?: boolean;
    readOnly?: boolean;
  }>;
}

const cellBase = 'tabular-nums';

export function moneyCell(value: number | string, fmt: BuilderOpts['fmt']): React.ReactNode {
  return (
    <span className={`font-medium text-slate-600 dark:text-slate-300 ${cellBase}`}>
      {fmt.money(value)}
    </span>
  );
}

export function strongMoneyCell(value: number | string, fmt: BuilderOpts['fmt']): React.ReactNode {
  return (
    <span className={`font-black text-slate-900 dark:text-slate-100 ${cellBase}`}>
      {fmt.money(value)}
    </span>
  );
}

export function numberCell(
  value: number | string,
  fmt: BuilderOpts['fmt'],
  precision = 2,
): React.ReactNode {
  return (
    <span className={`font-bold text-slate-700 dark:text-slate-200 ${cellBase}`}>
      {fmt.number(value, precision)}
    </span>
  );
}

function BatchBadge({
  line,
  item,
  onViewBatch,
}: {
  line: any;
  item: any;
  onViewBatch?: (line: any) => void;
}) {
  const count = line.batchDetails?.length ?? 0;
  if (count === 0) return null;
  const label = item?.manageBy === 'S' ? 'Series' : 'Lotes';
  const IconLead = item?.manageBy === 'S' ? Layers3 : Package;
  const required = Number(line.quantity || 0);
  const assigned = (line.batchDetails ?? []).reduce(
    (acc: number, b: any) => acc + (item?.manageBy === 'S' ? 1 : Number(b.quantity || 0)),
    0,
  );
  const balanced = required > 0 && Math.abs(required - assigned) < 0.0001;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onViewBatch?.(line);
      }}
      title={`${label}: ${assigned} de ${required}`}
      className={`ml-auto inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.1em] transition-all hover:shadow-sm active:scale-[0.97] shrink-0 ${
        balanced
          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
          : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
      }`}
    >
      <IconLead size={12} className="shrink-0" />
      <span>{label}</span>
      <span className="inline-flex items-center gap-0.5 font-mono tabular-nums bg-white/70 dark:bg-black/30 rounded-md px-1.5 py-0.5 text-[10px] shadow-inner">
        {item?.manageBy === 'S' ? count : assigned.toFixed(0)}
        <span className="opacity-50">/</span>
        {required.toFixed(0)}
      </span>
      {balanced && <CheckCircle2 size={12} className="shrink-0 ml-0.5" />}
    </button>
  );
}

export function renderArticleCell(
  line: any,
  masters: Masters,
  onViewBatch?: (line: any) => void,
): React.ReactNode {
  const item = masters.items?.find((i: any) => i.id === line.itemId);
  const name = item?.name ?? 'Artículo';
  const code = item?.code ?? '—';
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">
        {name}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono truncate">
          {code}
        </span>
        <BatchBadge line={line} item={item} onViewBatch={onViewBatch} />
      </div>
    </div>
  );
}

function locationCell(line: any, zones?: any[]): React.ReactNode {
  const zoneName = zones?.find((z: any) => z.id === line.zoneId)?.name;
  return (
    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
      {zoneName || 'Por defecto'}
    </span>
  );
}

function progressCell(
  current: number | string,
  target: number | string,
  fmt: BuilderOpts['fmt'],
): React.ReactNode {
  const curN = Number(current) || 0;
  const tgtN = Number(target) || 0;
  const color =
    curN <= 0
      ? 'text-slate-400 dark:text-slate-500'
      : curN + 0.0001 >= tgtN
        ? 'text-emerald-600 dark:text-emerald-300'
        : 'text-amber-600 dark:text-amber-300';
  return <span className={`font-bold tabular-nums ${color}`}>{fmt.number(curN, 2)}</span>;
}

export function buildDetailLineColumns(opts: BuilderOpts): TableColumn<any>[] {
  const { kind, masters, zones, onViewBatch, fmt } = opts;

  const articleCol: TableColumn<any> = {
    header: 'Artículo',
    width: kind === 'deliveryNote' ? '40%' : '45%',
    cell: (l: any) => renderArticleCell(l, masters, onViewBatch),
  };

  const columns: TableColumn<any>[] = [articleCol];

  if (kind === 'deliveryNote') {
    columns.push({
      header: 'Ubicación',
      width: '12%',
      align: 'center',
      cell: (l: any) => locationCell(l, zones),
    });
  }

  if (kind === 'order') {
    columns.push(
      {
        header: 'Pedido',
        width: '10%',
        align: 'center',
        accessor: (l: any) => numberCell(l.orderedQty ?? l.quantity, fmt, 2),
      },
      {
        header: opts.side === 'sale' ? 'Entregado' : 'Recibido',
        width: '10%',
        align: 'center',
        cell: (l: any) => {
          const done = opts.side === 'sale' ? l.deliveredQty : l.receivedQty;
          return progressCell(done ?? 0, l.orderedQty ?? l.quantity, fmt);
        },
      },
    );
  } else {
    columns.push({
      header: 'Cantidad',
      width: '14%',
      align: 'center',
      cell: (l: any) => {
        const item = masters.items.find((i: any) => i.id === l.itemId);
        const uomCode = item?.uomCode || item?.uom?.code;
        return (
          <span className="inline-flex items-baseline gap-1 justify-center tabular-nums">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {fmt.number(l.quantity, 2)}
            </span>
            {uomCode && (
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {uomCode}
              </span>
            )}
          </span>
        );
      },
    });
  }

  columns.push({
    header: 'Precio',
    width: '13%',
    align: 'right',
    accessor: (l: any) => moneyCell(l.price, fmt),
  });

  columns.push({
    header: 'Total línea',
    width: '16%',
    align: 'right',
    cell: (l: any) => {
      const qty = Number(l.orderedQty ?? l.quantity ?? 0);
      const price = Number(l.price ?? 0);
      const lineTotal = l.lineTotal != null ? Number(l.lineTotal) : qty * price;
      return strongMoneyCell(lineTotal, fmt);
    },
  });

  // Proyecto (read-only)
  if ((masters.internalOrders?.length ?? 0) > 0) {
    columns.push({
      header: 'Proyecto',
      width: '12%',
      align: 'left',
      cell: (l: any) => {
        if (!l.internalOrderId)
          return <span className="text-slate-300 dark:text-slate-600">—</span>;
        const p = masters.internalOrders?.find((x: any) => x.id === l.internalOrderId);
        if (!p)
          return <span className="font-mono text-[11px]">{l.internalOrderId.slice(0, 8)}…</span>;
        return (
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
              {p.code}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-200 truncate">{p.name}</span>
          </div>
        );
      },
    });
  }

  // Columnas read-only de plugins — delegan en PluginFieldValue.
  for (const f of opts.pluginLineFields ?? []) {
    columns.push({
      header: f.label || f.fieldName.replace(/^p_/, ''),
      width: '12%',
      align: 'left',
      cell: (l: any) => <PluginFieldValue def={f as any} value={l[f.fieldName]} fmt={fmt as any} />,
    });
  }

  // Acciones por línea: imprimir etiqueta del artículo. El modal se abre con
  // params.itemId precargado a partir de la línea y muestra las plantillas
  // FREE disponibles para que el usuario elija una.
  columns.push({
    header: '',
    width: '40px',
    align: 'right',
    cell: (l: any) =>
      l.itemId ? (
        <LabelPrintButton
          params={{ itemId: l.itemId }}
          title="Imprimir etiqueta del artículo"
          className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all inline-flex"
          triggerLabel={<Tag size={13} />}
        />
      ) : null,
  });

  return columns;
}

// ============================================================
// FORM LINE COLUMNS (editable, used in create/edit views)
// ============================================================

interface AvailableUom {
  uomId: string;
  code: string;
  name: string;
  factor: string;
  isBase: boolean;
}

interface FormBuilderOpts {
  kind: DocKind;
  side: DocSide;
  state: { lines: any[]; warehouseId?: string };
  masters: Masters;
  zones?: any[];
  actions: {
    updateLine: (idx: number, field: string, value: any) => void;
    updateLineFields?: (idx: number, updates: Record<string, any>) => void;
    removeLine: (idx: number) => void;
  };
  onAssignBatch?: (idx: number) => void;
  onViewBatch?: (line: any) => void;
  onDuplicateLine?: (idx: number) => void;
  fmt: BuilderOpts['fmt'];
  /** Getter cacheado de UoMs disponibles por itemId (hook useItemUoms) */
  getItemUoms?: (itemId: string) => AvailableUom[];
  /** Si 'line' añade columnas Almacén + Ubicación por línea en todos los kinds. */
  warehouseLocation?: 'header' | 'line';
  /** Campos de plugin que se pintan como columnas extra al final. Cada
   *  definición trae `fieldName` con prefijo `p_`. */
  pluginLineFields?: Array<{
    id: string;
    fieldName: string;
    fieldType:
      | 'TEXT'
      | 'INTEGER'
      | 'DECIMAL'
      | 'BOOLEAN'
      | 'DATE'
      | 'JSONB'
      | 'ENUM'
      | 'MULTISELECT'
      | 'CURRENCY'
      | 'PERCENT'
      | 'URL'
      | 'EMAIL'
      | 'PHONE'
      | 'COLOR'
      | 'REFERENCE'
      | 'FILE';
    label: string;
    options?: Array<{ value: string; label: string }> | null;
    required?: boolean;
    readOnly?: boolean;
  }>;
}

const disabledInputCls =
  'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800 cursor-not-allowed';

function FormArticleCell({
  line,
  idx,
  masters,
  actions,
  onAssignBatch,
  onViewBatch,
  tracksBatches,
}: {
  line: any;
  idx: number;
  masters: Masters;
  actions: FormBuilderOpts['actions'];
  onAssignBatch?: (idx: number) => void;
  onViewBatch?: (line: any) => void;
  /** Si el documento mueve stock y por tanto requiere trazabilidad. False para pedidos. */
  tracksBatches: boolean;
}) {
  const item = masters.items.find((i: any) => i.id === line.itemId);
  const hasTrace = (line.batchDetails?.length ?? 0) > 0;
  const count = line.batchDetails?.length ?? 0;
  const locked = !!line.baseId;
  const needsTrace = tracksBatches && item?.manageBy !== 'N' && !!line.itemId;

  return (
    <div className="space-y-1.5 min-w-0">
      <SearchableSelect
        value={line.itemId}
        disabled={locked}
        onChange={(val) => actions.updateLine(idx, 'itemId', val)}
        options={masters.items.map((i: any) => ({
          label: `[${i.code}] ${i.name}`,
          value: i.id,
        }))}
        placeholder="Seleccionar artículo..."
        className={locked ? 'opacity-60' : ''}
      />
      {needsTrace &&
        (() => {
          const required = Number(line.quantity || 0);
          const assigned = (line.batchDetails ?? []).reduce(
            (acc: number, b: any) => acc + (item?.manageBy === 'S' ? 1 : Number(b.quantity || 0)),
            0,
          );
          const balanced = required > 0 && Math.abs(required - assigned) < 0.0001;
          const partial = hasTrace && !balanced;
          const tone = balanced ? 'emerald' : partial ? 'amber' : hasTrace ? 'indigo' : 'amber';
          const toneCls: Record<string, string> = {
            emerald:
              'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20',
            amber:
              'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20',
            indigo:
              'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20',
          };
          const IconLead = item?.manageBy === 'S' ? Layers3 : Package;
          const IconTrail = balanced ? CheckCircle2 : partial ? AlertTriangle : Plus;
          const label = item?.manageBy === 'S' ? 'Series' : 'Lotes';
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAssignBatch?.(idx);
              }}
              title={
                hasTrace
                  ? `${label}: ${assigned} de ${required}`
                  : 'Asignar trazabilidad a esta línea'
              }
              className={`group inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.1em] transition-all hover:shadow-sm active:scale-[0.97] ${toneCls[tone]}`}
            >
              <IconLead size={12} className="shrink-0" />
              <span>{label}</span>
              {hasTrace ? (
                <span className="inline-flex items-center gap-0.5 font-mono tabular-nums bg-white/70 dark:bg-black/30 rounded-md px-1.5 py-0.5 text-[10px] shadow-inner">
                  {item?.manageBy === 'S' ? count : assigned.toFixed(0)}
                  <span className="opacity-50">/</span>
                  {required.toFixed(item?.manageBy === 'S' ? 0 : 0)}
                </span>
              ) : (
                <span className="font-mono opacity-70">pendiente</span>
              )}
              <IconTrail size={12} className="shrink-0 ml-0.5" />
            </button>
          );
        })()}
      {locked && hasTrace && (
        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase italic leading-none tracking-wider">
          Vinculado al albarán origen
        </p>
      )}
    </div>
  );
}

function ZoneSelectCell({
  line,
  idx,
  zones,
  actions,
}: {
  line: any;
  idx: number;
  zones?: any[];
  actions: FormBuilderOpts['actions'];
}) {
  const locked = !!line.baseId;
  // Filtrar por el almacén de la línea; si la línea no tiene warehouse,
  // mostramos todas (el prefiltrado ya se hace por header en modo 'header').
  const filtered = line.warehouseId
    ? (zones ?? []).filter((z: any) => z.warehouseId === line.warehouseId)
    : (zones ?? []);
  return (
    <select
      value={line.zoneId || ''}
      disabled={locked}
      onChange={(e) => actions.updateLine(idx, 'zoneId', e.target.value)}
      className={`h-9 w-full max-w-[160px] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-left px-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${locked ? disabledInputCls : ''}`}
    >
      <option value="">(Sin Ubicación)</option>
      {filtered.map((z: any) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </select>
  );
}

export function buildFormLineColumns(opts: FormBuilderOpts): TableColumn<any>[] {
  const {
    kind,
    masters,
    zones,
    actions,
    onAssignBatch,
    onViewBatch,
    onDuplicateLine,
    fmt,
    getItemUoms,
    warehouseLocation,
  } = opts;

  const perLineWarehouse = warehouseLocation === 'line';
  const showZoneCol = kind === 'deliveryNote' || perLineWarehouse;

  const columns: TableColumn<any>[] = [];

  columns.push({
    header: 'Artículo',
    width: kind === 'deliveryNote' || perLineWarehouse ? '30%' : '44%',
    cell: (line: any, idx: number) => (
      <FormArticleCell
        line={line}
        idx={idx}
        masters={masters}
        actions={actions}
        onAssignBatch={onAssignBatch}
        onViewBatch={onViewBatch}
        tracksBatches={kind !== 'order'}
      />
    ),
  });

  if (perLineWarehouse) {
    columns.push({
      header: 'Almacén',
      width: '14%',
      align: 'center',
      cell: (line: any, idx: number) => {
        const locked = !!line.baseId;
        return (
          <select
            value={line.warehouseId || ''}
            disabled={locked}
            onChange={(e) => actions.updateLine(idx, 'warehouseId', e.target.value)}
            className={`h-9 w-full max-w-[160px] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-left px-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${locked ? disabledInputCls : ''}`}
          >
            <option value="">(Sin almacén)</option>
            {(masters.warehouses ?? []).map((w: any) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        );
      },
    });
  }

  if (showZoneCol) {
    columns.push({
      header: 'Ubicación',
      width: '14%',
      align: 'center',
      cell: (line: any, idx: number) => (
        <ZoneSelectCell line={line} idx={idx} zones={zones} actions={actions} />
      ),
    });
  }

  columns.push({
    header: 'Cantidad',
    width: '18%',
    align: 'right',
    cell: (line: any, idx: number) => {
      const locked = !!line.baseId;
      const item = masters.items.find((i: any) => i.id === line.itemId);
      const uomCode = item?.uomCode || item?.uom?.code;
      const availUoms = getItemUoms && line.itemId ? getItemUoms(line.itemId) : [];
      const hasAlternatives = availUoms.length > 1;
      const currentUomId = line.uomId || item?.uomId || '';

      const handleUomChange = (newUomId: string) => {
        const selected = availUoms.find((u) => u.uomId === newUomId);
        const oldFactor = Number(line.uomFactor || 1);
        const newFactor = selected ? Number(selected.factor) : 1;
        const currentQty = Number(line.quantity || 0);
        // Convertir cantidad: si tenía 4 UD (factor 1) y pasa a PQ4 (factor 4) → 4*1/4 = 1
        const convertedQty =
          newFactor > 0
            ? Math.round(((currentQty * oldFactor) / newFactor) * 10000) / 10000
            : currentQty;
        if (actions.updateLineFields) {
          actions.updateLineFields(idx, {
            uomId: newUomId,
            uomFactor: newFactor,
            quantity: convertedQty,
          });
        } else {
          actions.updateLine(idx, 'uomId', newUomId);
        }
      };

      return (
        <div className="flex items-center justify-end gap-1.5 w-full">
          <DecimalInput
            value={line.quantity}
            onCommit={(num) => actions.updateLine(idx, 'quantity', num)}
            format={(v) => (v == null || v === '' || Number(v) === 0 ? '' : String(v))}
            disabled={locked}
            placeholder="0"
            className={`flex-1 min-w-0 text-right font-bold tabular-nums h-9 ${locked ? disabledInputCls : ''}`}
          />
          {hasAlternatives ? (
            <select
              value={currentUomId}
              disabled={locked}
              onChange={(e) => handleUomChange(e.target.value)}
              className={`h-9 w-[70px] shrink-0 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-1 ${locked ? disabledInputCls : ''}`}
              title="Unidad de medida"
            >
              {availUoms.map((u) => (
                <option key={u.uomId} value={u.uomId}>
                  {u.code}
                </option>
              ))}
            </select>
          ) : uomCode ? (
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0 w-[46px] text-left">
              {uomCode}
            </span>
          ) : null}
        </div>
      );
    },
  });

  columns.push({
    header: 'Precio',
    width: '14%',
    align: 'right',
    cell: (line: any, idx: number) => {
      const locked = !!line.baseId;
      // Evita mostrar "200.0000" para un 200: recortar ceros a la derecha
      // dejando como mínimo 2 decimales si los tiene.
      const formatPriceForEdit = (v: any): string => {
        if (v == null || v === '' || Number(v) === 0) return '';
        const num = Number(v);
        if (!Number.isFinite(num)) return String(v);
        const s = num
          .toFixed(4)
          .replace(/(\.\d*?[1-9])0+$/, '$1')
          .replace(/\.0+$/, '');
        return s;
      };
      return (
        <DecimalInput
          value={line.price}
          onCommit={(num) => actions.updateLine(idx, 'price', num)}
          format={formatPriceForEdit}
          disabled={locked}
          placeholder="0,00"
          className={`w-full text-right font-medium tabular-nums h-9 ${locked ? disabledInputCls : ''}`}
        />
      );
    },
  });

  columns.push({
    header: '% IVA',
    width: '9%',
    align: 'center',
    cell: (line: any, idx: number) => {
      const locked = !!line.baseId;
      // Sin IVA asignado ⇒ mostramos el grupo 0% real (evita duplicar un "0%"
      // placeholder junto al IVA0 del maestro).
      const zeroGroup = (masters.taxGroups ?? []).find((t: any) => Number(t.rate) === 0);
      return (
        <select
          value={line.taxGroupId || zeroGroup?.id || ''}
          disabled={locked}
          onChange={(e) => actions.updateLine(idx, 'taxGroupId', e.target.value)}
          className={`h-9 w-full border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-center bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 ${locked ? disabledInputCls : ''}`}
        >
          {(masters.taxGroups ?? []).map((t: any) => (
            <option key={t.id} value={t.id}>
              {Number(t.rate)}%
            </option>
          ))}
        </select>
      );
    },
  });

  columns.push({
    header: 'Total',
    width: kind === 'deliveryNote' ? '12%' : '14%',
    align: 'right',
    cell: (line: any) => {
      const tax = masters.taxGroups?.find((t: any) => t.id === line.taxGroupId);
      const rate = tax ? Number(tax.rate) : 0;
      const base = Number(line.quantity || 0) * Number(line.price || 0);
      const total = base * (1 + rate / 100);
      return (
        <span
          className={`font-black tabular-nums ${line.baseId ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}
        >
          {fmt.money(total)}
        </span>
      );
    },
  });

  // Proyecto — campo nativo `internalOrderId` de la línea. Siempre
  // disponible si hay proyectos activos cargados en `masters`.
  if ((masters.internalOrders?.length ?? 0) > 0) {
    columns.push({
      header: 'Proyecto',
      width: '12%',
      align: 'left',
      cell: (line: any, idx: number) => {
        const locked = !!line.baseId;
        return (
          <select
            value={line.internalOrderId || ''}
            disabled={locked}
            onChange={(e) => actions.updateLine(idx, 'internalOrderId', e.target.value || null)}
            className={`h-9 w-full border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${locked ? disabledInputCls : ''}`}
          >
            <option value="">—</option>
            {(masters.internalOrders ?? [])
              .filter((p: any) => p.status === 'open' || p.id === line.internalOrderId)
              .map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
          </select>
        );
      },
    });
  }

  // Columnas extra aportadas por plugins. Delegamos en `PluginFieldInput`
  // para tener un único switch de tipos en toda la app.
  for (const f of opts.pluginLineFields ?? []) {
    columns.push({
      header: (f.label || f.fieldName.replace(/^p_/, '')) + (f.required ? ' *' : ''),
      width: '12%',
      align: 'left',
      cell: (line: any, idx: number) => {
        const locked = !!line.baseId;
        return (
          <PluginFieldInput
            def={f as any}
            value={line[f.fieldName]}
            disabled={locked}
            onChange={(v) => actions.updateLine(idx, f.fieldName, v)}
          />
        );
      },
    });
  }

  columns.push({
    header: '',
    width: '6%',
    align: 'center',
    cell: (line: any, idx: number) => {
      if (line.baseId) return null;
      return (
        <div className="flex items-center justify-end gap-0.5">
          {onDuplicateLine && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDuplicateLine(idx)}
              className="h-7 w-7 p-0 text-slate-400 dark:text-slate-500 hover:text-primary"
              title="Duplicar línea"
            >
              <CopyIcon size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.removeLine(idx)}
            className="h-7 w-7 p-0 text-slate-300 dark:text-slate-600 hover:text-rose-500"
            title="Eliminar línea"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      );
    },
  });

  return columns;
}

// Devuelve el índice de la primera línea con trazabilidad incompleta,
// o null si todas las líneas trazables están cuadradas.
export function findFirstIncompleteBatchLine(
  lines: any[],
  masters: { items: any[] },
): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.itemId) continue;
    const item = masters.items.find((it: any) => it.id === line.itemId);
    if (!item || item.manageBy === 'N') continue;
    const assigned = (line.batchDetails ?? []).reduce(
      (acc: number, b: any) => acc + Number(b.quantity || 0),
      0,
    );
    if (Math.abs(assigned - Number(line.quantity || 0)) > 0.0001) return i;
  }
  return null;
}

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export function statusBadgeProps(
  status: string | undefined,
  kind: DocKind,
): { label: string; variant: StatusVariant } | undefined {
  if (!status) return undefined;
  if (kind === DocKind.Invoice) {
    if (status === 'D') return { label: 'Borrador', variant: 'warning' };
    if (status === DocStatus.Open) return { label: 'Asentado', variant: 'success' };
    if (status === DocStatus.Cancelled) return { label: 'Cancelado', variant: 'error' };
  }
  if (kind === DocKind.Order) {
    if (status === DocStatus.Open) return { label: 'Abierto', variant: 'warning' };
    if (status === DocStatus.Partial) return { label: 'Parcial', variant: 'info' };
    if (status === DocStatus.Closed) return { label: 'Cerrado', variant: 'success' };
    if (status === DocStatus.Cancelled) return { label: 'Cancelado', variant: 'error' };
  }
  if (kind === DocKind.DeliveryNote) {
    if (status === DocStatus.Open) return { label: 'Abierto', variant: 'warning' };
    if (status === DocStatus.Closed) return { label: 'Facturado', variant: 'success' };
    if (status === DocStatus.Cancelled) return { label: 'Cancelado', variant: 'error' };
  }
  return { label: status, variant: 'neutral' };
}
