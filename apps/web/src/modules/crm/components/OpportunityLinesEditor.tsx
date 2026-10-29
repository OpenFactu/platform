import React, { useEffect, useMemo, useState } from 'react';
import { Button, EditableTable, type EditableColumn } from '@openfactu/ui';
import { Plus } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { itemsApi } from '@/modules/inventory/api/itemsApi';
import type { Item } from '@/modules/inventory/domain/item';
import { lineNet, type OpportunityLine } from '../domain/crm';

interface Props {
  lines: OpportunityLine[];
  onAdd: () => void;
  onChange: (key: string, patch: Partial<OpportunityLine>) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}

/**
 * Productos de interés: artículo, cantidad, precio (el de la tarifa del
 * cliente al elegirlo) y descuento. Sin artículo vale como línea de texto,
 * pero esas no pasan al presupuesto.
 */
export const OpportunityLinesEditor: React.FC<Props> = ({
  lines,
  onAdd,
  onChange,
  onRemove,
  disabled,
}) => {
  const fmt = useFormat();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    itemsApi
      .list()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  const itemOptions = useMemo(
    () => items.map((i) => ({ value: i.id, label: i.name, secondaryLabel: i.code })),
    [items],
  );

  const columns: EditableColumn<OpportunityLine>[] = [
    {
      header: 'Artículo',
      id: 'item',
      field: 'itemId',
      accessor: (l) => l.itemName ?? items.find((i) => i.id === l.itemId)?.name ?? '—',
      editor: { type: 'search-select', options: itemOptions, placeholder: 'Elige un artículo' },
      card: 'title',
    },
    {
      header: 'Descripción',
      field: 'description',
      accessor: (l) => l.description ?? '',
      editor: { type: 'text', placeholder: 'Opcional' },
    },
    {
      header: 'Cantidad',
      field: 'quantity',
      accessor: 'quantity',
      align: 'right',
      width: '7rem',
      editor: { type: 'number', precision: 2, min: 0 },
    },
    {
      header: 'Precio',
      field: 'price',
      accessor: (l) => fmt.money(l.price),
      align: 'right',
      width: '9rem',
      editor: { type: 'currency' },
    },
    {
      header: 'Dto. %',
      field: 'discount',
      accessor: (l) => `${l.discount}%`,
      align: 'right',
      width: '6rem',
      editor: { type: 'percent', precision: 0 },
    },
    {
      header: 'Importe',
      id: 'net',
      accessor: (l) => fmt.money(lineNet(l)),
      align: 'right',
      width: '9rem',
    },
  ];

  return (
    <EditableTable<OpportunityLine>
      mode="cell"
      columns={columns}
      data={lines}
      rowKey={(l) => l._key ?? l.id ?? ''}
      isRowEditable={() => !disabled}
      onChange={(row, field, value) => {
        if (!row._key) return;
        const patch: Partial<OpportunityLine> =
          field === 'itemId'
            ? { itemId: value || null, itemName: null }
            : { [field]: field === 'description' ? value : Number(value) || 0 };
        onChange(row._key, patch);
      }}
      onDelete={disabled ? undefined : (row) => row._key && onRemove(row._key)}
      // Sin filas la tabla pinta el vacío y no la fila de añadir: el botón va aquí también.
      emptyMessage={
        <div className="flex flex-col items-center gap-2">
          <span>Sin productos: el importe se teclea a mano.</span>
          {!disabled && (
            <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
              <Plus size={14} /> Añadir producto
            </Button>
          )}
        </div>
      }
      summaryByColumn={(rows) => ({
        net: fmt.money(rows.reduce((s, l) => s + lineNet(l), 0)),
      })}
      appendRow={
        !disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
            <Plus size={14} /> Añadir producto
          </Button>
        )
      }
    />
  );
};
