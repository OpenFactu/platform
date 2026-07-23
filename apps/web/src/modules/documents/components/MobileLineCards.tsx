import React from 'react';
import type { TableColumn } from '@openfactu/ui';
import { Card } from '@openfactu/ui';

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
 */

interface Props<T> {
  columns: TableColumn<T>[];
  lines: T[];
  emptyMessage?: string;
}

function renderCell<T>(col: TableColumn<T>, line: T, idx: number): React.ReactNode {
  if (col.cell) return col.cell(line, idx);
  if (typeof col.accessor === 'function') return col.accessor(line, idx);
  if (col.accessor) return (line as Record<PropertyKey, React.ReactNode>)[col.accessor];
  return null;
}

export function MobileLineCards<T>({ columns, lines, emptyMessage }: Props<T>) {
  if (!lines.length) {
    return (
      <p className="p-6 text-center text-sm font-medium text-slate-400 dark:text-slate-500">
        {emptyMessage ?? 'Sin líneas'}
      </p>
    );
  }

  const [first, ...rest] = columns;
  const fieldCols = rest.filter((c) => c.header !== '');
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
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 leading-none mb-1.5">
                {first?.header || 'Artículo'} · L{idx + 1}
              </p>
              {first && renderCell(first, line, idx)}
            </div>
            {actionCols.length > 0 && (
              <div className="shrink-0">
                {actionCols.map((c, i) => (
                  <React.Fragment key={i}>{renderCell(c, line, idx)}</React.Fragment>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
            {fieldCols.map((col, colIdx) => (
              <div key={`${col.header}-${colIdx}`} className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 leading-none mb-1.5">
                  {col.header}
                </p>
                <div className="text-sm [&_input]:max-w-full [&_select]:max-w-full">
                  {renderCell(col, line, idx)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
