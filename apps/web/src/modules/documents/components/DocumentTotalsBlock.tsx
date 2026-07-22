import React from 'react';
import { useFormat } from '@/hooks/useFormat';

interface Props {
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  /** Importe retenido (IRPF) — se resta del total. */
  withholdingAmount?: number | string | null;
  /** Tipo de retención aplicado (para etiqueta "IRPF 15%"). */
  withholdingRate?: number | string | null;
  totalLabel?: string;
}

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export const DocumentTotalsBlock: React.FC<Props> = ({
  subtotal,
  tax,
  total,
  withholdingAmount,
  withholdingRate,
  totalLabel = 'Total',
}) => {
  const fmt = useFormat();
  const hasWithholding = toNum(withholdingAmount) > 0;
  const rate = toNum(withholdingRate);
  return (
    <div className="flex justify-end px-6 py-5 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800">
      <div className="min-w-[280px] space-y-2">
        <div className="flex justify-between items-baseline text-xs gap-8">
          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 dark:text-slate-400">
            Subtotal
          </span>
          <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
            {fmt.money(subtotal)}
          </span>
        </div>
        <div className="flex justify-between items-baseline text-xs gap-8">
          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 dark:text-slate-400">
            IVA
          </span>
          <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
            {fmt.money(tax)}
          </span>
        </div>
        {hasWithholding && (
          <div className="flex justify-between items-baseline text-xs gap-8">
            <span className="font-bold uppercase tracking-wider text-[10px] text-rose-600 dark:text-rose-400">
              Retención IRPF{rate > 0 ? ` (${rate}%)` : ''}
            </span>
            <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              − {fmt.money(withholdingAmount || 0)}
            </span>
          </div>
        )}
        <div className="pt-3 mt-1 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline gap-8">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
            {totalLabel}
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight tabular-nums">
            {fmt.money(total)}
          </span>
        </div>
      </div>
    </div>
  );
};
