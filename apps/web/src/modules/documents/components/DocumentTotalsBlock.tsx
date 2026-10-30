import React from 'react';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  /** Importe retenido (IRPF) — se resta del total. */
  withholdingAmount?: number | string | null;
  /** Tipo de retención aplicado (para etiqueta "IRPF 15%"). */
  withholdingRate?: number | string | null;
  totalLabel?: string;
  /**
   * 'footer' (por defecto): pie de la tabla de líneas en las fichas.
   * 'plain': sin fondo ni márgenes, a todo el ancho — el alta de documentos
   * (sección «Revisar» y resumen lateral).
   */
  variant?: 'footer' | 'plain';
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
  totalLabel,
  variant = 'footer',
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const hasWithholding = toNum(withholdingAmount) > 0;
  const rate = toNum(withholdingRate);
  return (
    // En móvil es una tarjeta más bajo las de las líneas (MobileLineCards): el
    // mismo margen de 12px y el mismo relleno de 16px, para que cuadren.
    <div
      className={
        variant === 'plain'
          ? ''
          : 'flex justify-end px-6 py-5 bg-bg-muted border-t border-border-subtle max-md:mx-3 max-md:mb-3 max-md:p-4 max-md:border max-md:rounded-[var(--k-radius-sm)]'
      }
    >
      <div
        className={
          variant === 'plain'
            ? 'w-full space-y-2'
            : 'min-w-[280px] space-y-2 max-md:min-w-0 max-md:w-full'
        }
      >
        <div className="flex justify-between items-baseline text-xs gap-8">
          <span className="font-bold uppercase tracking-wider text-[10px] text-fg-muted">
            {t('doc.totals.subtotal')}
          </span>
          <span className="font-bold text-fg-body tabular-nums">{fmt.money(subtotal)}</span>
        </div>
        <div className="flex justify-between items-baseline text-xs gap-8">
          <span className="font-bold uppercase tracking-wider text-[10px] text-fg-muted">
            {t('doc.totals.vat')}
          </span>
          <span className="font-bold text-fg-body tabular-nums">{fmt.money(tax)}</span>
        </div>
        {hasWithholding && (
          <div className="flex justify-between items-baseline text-xs gap-8">
            <span className="font-bold uppercase tracking-wider text-[10px] text-danger-fg">
              {t('doc.totals.withholding')}
              {rate > 0 ? ` (${rate}%)` : ''}
            </span>
            <span className="font-bold text-danger-fg tabular-nums">
              − {fmt.money(withholdingAmount || 0)}
            </span>
          </div>
        )}
        <div className="pt-3 mt-1 border-t border-border-default flex justify-between items-baseline gap-8">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
            {totalLabel ?? t('doc.totals.total')}
          </span>
          <span className="text-2xl font-black text-fg-default tracking-tight tabular-nums">
            {fmt.money(total)}
          </span>
        </div>
      </div>
    </div>
  );
};
