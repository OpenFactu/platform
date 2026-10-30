import React from 'react';
import { Progress } from '@openfactu/ui';
import type { ImportProgressEvent } from '../types';
import { t } from '@/i18n/i18n';
import { formatNumber } from '@/i18n/format';

function pct(processed: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

/**
 * Cuerpo del aviso mientras una importación avanza. Va dentro del toast: por
 * eso es estrecho y de una sola pieza — la pila de avisos no da más de unos
 * 260 px y el mensaje se reescribe entero en cada actualización.
 */
export const ImportProgressBody: React.FC<{ event: ImportProgressEvent }> = ({ event }) => {
  const value = pct(event.processed, event.total);
  const undoing = event.status === 'undoing';

  return (
    <div className="w-64 space-y-1.5">
      <div className="text-xs font-medium text-fg-default">
        {t(
          undoing
            ? 'dataImport.progress.undoing'
            : event.dryRun
              ? 'dataImport.progress.simulating'
              : 'dataImport.progress.importing',
          { object: event.objectLabel },
        )}
      </div>
      <Progress value={value} size="sm" variant={event.errors > 0 ? 'warning' : 'accent'} />
      <div className="text-[11px] text-fg-muted tabular-nums">
        {t('dataImport.progress.rows', {
          processed: formatNumber(event.processed),
          total: formatNumber(event.total),
        })}
        {event.errors > 0 &&
          ` · ${t('dataImport.progress.withErrors', { errors: formatNumber(event.errors) })}`}
      </div>
    </div>
  );
};
