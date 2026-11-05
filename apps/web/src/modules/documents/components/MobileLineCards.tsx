import React from 'react';
import type { TableColumn } from '@openfactu/ui';
import { Card } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Editor/visor de líneas de documento en móvil.
 *
 * Reutiliza las MISMAS definiciones de columna de buildFormLineColumns /
 * buildDetailLineColumns: cada línea se pinta como una tarjeta y cada columna
 * como label + su propio cell() a ancho completo, en vez de la Table de
 * @openfactu/ui (que fuerza min-w-[720px] y deja los inputs inusables en
 * pantallas pequeñas). Así toda la lógica de artículo/cantidad/UoM/lotes vive
 * en un único sitio.
 *
 * Convenciones heredadas de las columnas:
 * - La primera columna (Artículo) se pinta a ancho completo como cabecera.
 * - Las columnas con header '' son acciones (duplicar/eliminar) → pie de tarjeta.
 * - Las columnas `card: 'meta'` son el resultado de la línea (su total) → también al pie:
 *   no se edita, así que en la rejilla dejaba un hueco al lado de un campo más alto.
 */

interface Props<T> {
  columns: TableColumn<T>[];
  lines: T[];
  emptyMessage?: string;
  /** El número de línea, cuando no es su posición en `lines` (páginas, búsqueda). */
  lineNumber?: (line: T, idx: number) => number;
}

function renderCell<T>(col: TableColumn<T>, line: T, idx: number): React.ReactNode {
  if (col.cell) return col.cell(line, idx);
  if (typeof col.accessor === 'function') return col.accessor(line, idx);
  if (col.accessor) return (line as Record<PropertyKey, React.ReactNode>)[col.accessor];
  return null;
}

export function MobileLineCards<T>({ columns, lines, emptyMessage, lineNumber }: Props<T>) {
  const { t } = useI18n();
  if (!lines.length) {
    return (
      <p className="p-6 text-center text-sm font-medium text-fg-subtle">
        {emptyMessage ?? t('doc.lines.noLines')}
      </p>
    );
  }

  const [first, ...rest] = columns;
  const fieldCols = rest.filter((c) => c.header !== '' && c.card !== 'meta');
  const totalCols = rest.filter((c) => c.card === 'meta');
  const actionCols = rest.filter((c) => c.header === '');

  return (
    <div className="space-y-3 p-3">
      {lines.map((line, idx) => (
        <Card
          key={
            (line as { id?: string; tempId?: string }).id ??
            (line as { tempId?: string }).tempId ??
            idx
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-fg-subtle leading-none mb-1.5">
                {first?.header || t('doc.lines.item')} · L
                {lineNumber ? lineNumber(line, idx) : idx + 1}
              </p>
              {first && renderCell(first, line, idx)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
            {fieldCols.map((col, colIdx) => (
              <div key={`${col.header}-${colIdx}`} className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-fg-subtle leading-none mb-1.5">
                  {col.header}
                </p>
                <div className="text-sm [&_input]:max-w-full [&_select]:max-w-full">
                  {renderCell(col, line, idx)}
                </div>
              </div>
            ))}
          </div>
          {(totalCols.length > 0 || actionCols.length > 0) && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
              <div className="min-w-0 flex-1">
                {totalCols.map((col, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">
                      {col.header}
                    </span>
                    {renderCell(col, line, idx)}
                  </div>
                ))}
              </div>
              {actionCols.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {actionCols.map((c, i) => (
                    <React.Fragment key={i}>{renderCell(c, line, idx)}</React.Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
