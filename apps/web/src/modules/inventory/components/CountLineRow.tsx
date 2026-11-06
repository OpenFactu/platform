import React from 'react';
import { Badge, NumberInput } from '@openfactu/ui';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/i18n/I18nContext';
import { isSerialLine, type CountLine } from '../domain/inventoryCount';

interface Props {
  line: CountLine;
  highlighted?: boolean;
  disabled?: boolean;
  onCount: (value: number | null) => void;
}

/** Una línea mientras se cuenta: lo justo para mirar la etiqueta y teclear, a una mano. */
export const CountLineRow: React.FC<Props> = ({ line, highlighted, disabled, onCount }) => {
  const { t } = useI18n();
  const { format } = useTheme();
  const serial = isSerialLine(line);
  const unit = line.uomCode ?? '';

  return (
    <div
      className={`flex items-center gap-3 border-b border-border-subtle px-3 py-3 last:border-b-0 ${
        highlighted ? 'bg-bg-muted' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg-default">{line.itemName}</p>
        <p className="truncate font-mono text-xs text-fg-muted">{line.itemCode}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {line.zoneName && <Badge variant="neutral">{line.zoneName}</Badge>}
          {line.batchNum && (
            <Badge variant="info">
              {serial ? t('inventory.counts.serial') : t('inventory.counts.batch')}: {line.batchNum}
            </Badge>
          )}
          {!line.batchNum && line.manageBy !== 'N' && !line.zoneId && (
            <Badge variant="warning">{t('inventory.counts.noBatch')}</Badge>
          )}
          {line.addedDuringCount && <Badge variant="neutral">{t('inventory.counts.added')}</Badge>}
        </div>
        {line.expectedQty !== undefined && (
          <p className="mt-1 text-xs tabular-nums text-fg-muted">
            {t('inventory.counts.expectedInline', { quantity: line.expectedQty, unit })}
          </p>
        )}
      </div>
      <div className="w-24 shrink-0">
        <NumberInput
          aria-label={t('inventory.counts.counted')}
          value={line.countedQty}
          onChange={onCount}
          commitOn="blur"
          min={0}
          max={serial ? 1 : undefined}
          precision={serial ? 0 : format.quantityPrecision}
          thousandSeparator={false}
          inputMode={serial ? 'numeric' : 'decimal'}
          align="right"
          placeholder="—"
          disabled={disabled}
        />
      </div>
    </div>
  );
};
