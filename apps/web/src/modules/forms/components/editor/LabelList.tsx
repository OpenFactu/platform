import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { Button, Input, SortableList } from '@openfactu/ui';
import { GripVertical, Plus, X } from 'lucide-react';
import { newId, type Option } from '@forms-engine';

interface Props {
  title: string;
  /** «Fila», «Columna»: para el texto por defecto y las etiquetas accesibles. */
  noun: string;
  prefix: string;
  items: Option[];
  onChange: (items: Option[]) => void;
  disabled?: boolean;
}

/** Lista reordenable de etiquetas (filas o columnas de una cuadrícula). */
export const LabelList: React.FC<Props> = ({ title, noun, prefix, items, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-2 min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</div>
      <SortableList
        items={items}
        getKey={(o) => o.id}
        onReorder={onChange}
        disabled={disabled}
        handleLabel={t('forms.common.dragToReorder')}
        className="space-y-1"
        renderItem={(o, { handleProps, index }) => (
          <div className="flex items-center gap-2">
            {!disabled && (
              <span {...handleProps}>
                <GripVertical size={14} className="text-fg-subtle" />
              </span>
            )}
            <div className="flex-1 min-w-0">
              <Input
                aria-label={`${noun} ${index + 1}`}
                value={o.label}
                onChange={(e) =>
                  onChange(items.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))
                }
                disabled={disabled}
              />
            </div>
            {!disabled && items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('forms.common.removeItem', { label: o.label })}
                onClick={() => onChange(items.filter((x) => x.id !== o.id))}
              >
                <X size={14} />
              </Button>
            )}
          </div>
        )}
      />
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([...items, { id: newId(prefix), label: `${noun} ${items.length + 1}` }])
          }
        >
          <Plus size={14} /> {t('forms.labelList.add', { noun: noun.toLowerCase() })}
        </Button>
      )}
    </div>
  );
};
