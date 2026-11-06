import React from 'react';
import { Button, Input, SortableList } from '@openfactu/ui';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { FieldOption } from './fieldForm';

interface Row extends FieldOption {
  /** Identifica la fila mientras se edita: el valor puede cambiar o estar vacío. */
  key: number;
}

let nextKey = 0;
const toRows = (options: FieldOption[]): Row[] => options.map((o) => ({ ...o, key: nextKey++ }));

/** Opciones de una lista: texto visible y, si hace falta, el valor que se guarda. */
export const OptionsEditor: React.FC<{
  value: FieldOption[];
  onChange: (options: FieldOption[]) => void;
}> = ({ value, onChange }) => {
  const { t } = useI18n();
  const [rows, setRows] = React.useState<Row[]>(() =>
    toRows(value.length ? value : [{ value: '', label: '' }]),
  );

  const update = (next: Row[]) => {
    setRows(next);
    onChange(next.map(({ value: v, label }) => ({ value: v, label })));
  };
  const patch = (key: number, change: Partial<FieldOption>) =>
    update(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));

  return (
    <div className="space-y-2">
      <SortableList
        items={rows}
        getKey={(row) => row.key}
        onReorder={update}
        handleLabel={t('settingsFields.dragToReorder')}
        className="space-y-2"
        renderItem={(row, { handleProps }) => (
          <div className="flex items-center gap-2">
            <span {...handleProps} title={t('settingsFields.dragToReorder')}>
              <GripVertical size={14} className="text-fg-subtle" />
            </span>
            <Input
              aria-label={t('settingsFields.optionLabel')}
              placeholder={t('settingsFields.optionLabel')}
              value={row.label}
              onChange={(e) => patch(row.key, { label: e.target.value })}
              className="flex-1"
            />
            <Input
              aria-label={t('settingsFields.optionValue')}
              placeholder={t('settingsFields.optionValuePlaceholder')}
              value={row.value}
              onChange={(e) => patch(row.key, { value: e.target.value })}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('settingsFields.removeOption')}
              title={t('settingsFields.removeOption')}
              disabled={rows.length === 1}
              onClick={() => update(rows.filter((other) => other.key !== row.key))}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-2"
        onClick={() => update([...rows, ...toRows([{ value: '', label: '' }])])}
      >
        <Plus size={14} /> {t('settingsFields.addOption')}
      </Button>
    </div>
  );
};
