import React from 'react';
import type { TableDensity } from '@openfactu/ui';

/**
 * Mirrors Table.js's own `densityClasses.cell` (px-4 py-{2,3,4}), which isn't
 * exported by @openfactu/ui. `neg` cancels the parent `<td>`'s own (untouched)
 * padding via negative margin so the wrapper's box spans the FULL old `<td>`
 * box, including its padding; `pad` restores the same amount as positive
 * padding so content sits at the identical pixel position as before.
 */
const DENSITY: Record<TableDensity, { neg: string; pad: string }> = {
  compact: { neg: '-mx-4 -my-2', pad: 'px-4 py-2' },
  normal: { neg: '-mx-4 -my-3', pad: 'px-4 py-3' },
  comfy: { neg: '-mx-4 -my-4', pad: 'px-4 py-4' },
};

/**
 * Envuelve las columnas de un `<Table>` (paquete `@openfactu/ui`) para que
 * cualquier click derecho sobre una fila abra un menú contextual — sin tocar
 * el componente `Table` (no expone `onRowContextMenu`, viene compilado desde
 * `node_modules`). Cada celda se envuelve en un `div` cuyo margen negativo
 * anula el padding del `<td>` y lo repone como padding propio, de forma que
 * el `div` (y no solo su contenido) cubre la celda entera y captura el click
 * derecho en cualquier punto — incluida la zona de padding, antes "muerta".
 */
export function withRowContextMenu(
  columns: any[],
  onContextMenu: (e: React.MouseEvent, item: any) => void,
  density: TableDensity = 'normal',
): any[] {
  const { neg, pad } = DENSITY[density];
  return columns.map((col) => ({
    ...col,
    cell: (item: any, idx: number) => {
      let content: React.ReactNode = null;
      if (col.cell) {
        content = col.cell(item, idx);
      } else if (typeof col.accessor === 'function') {
        content = col.accessor(item, idx);
      } else if (col.accessor) {
        content = item[col.accessor];
      }
      return (
        <div className={`block ${neg} ${pad}`} onContextMenu={(e) => onContextMenu(e, item)}>
          {content}
        </div>
      );
    },
  }));
}
