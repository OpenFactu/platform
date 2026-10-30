import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Button, Input, SortableList } from '@openfactu/ui';
import { GripVertical, Plus, X } from 'lucide-react';

interface Props {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Lista editable de textos (catálogos cortos: motivos, orígenes, opciones de
 * una pregunta…). El orden importa —es el de los desplegables—, así que se
 * reordena arrastrando con `SortableList` (también con teclado: Espacio y
 * flechas sobre el asa), en vez de los botones subir/bajar de antes.
 */
export const StringListEditor: React.FC<Props> = ({
  label,
  values,
  onChange,
  placeholder,
  disabled,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-fg-muted">{label}</div>
      {values.length === 0 ? (
        <p className="rounded-xs border border-border-default bg-bg-card px-3 py-2 text-sm text-fg-subtle">
          {t('crm.stringList.empty')}
        </p>
      ) : (
        <SortableList
          items={values}
          getKey={(v) => v}
          onReorder={onChange}
          disabled={disabled}
          handleLabel={t('crm.stringList.dragToReorder')}
          className="divide-y divide-border-subtle rounded-xs border border-border-default bg-bg-card"
          renderItem={(v, { handleProps }) => (
            <div className="flex items-center gap-1 px-2 py-1.5">
              {!disabled && (
                <span {...handleProps}>
                  <GripVertical size={14} className="text-fg-subtle" />
                </span>
              )}
              <span className="flex-1 text-sm text-fg-body">{v}</span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('crm.stringList.remove', { value: v })}
                  onClick={() => onChange(values.filter((x) => x !== v))}
                >
                  <X size={12} />
                </Button>
              )}
            </div>
          )}
        />
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            containerClassName="flex-1"
          />
          <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
            <Plus size={14} /> {t('crm.stringList.add')}
          </Button>
        </div>
      )}
    </div>
  );
};
