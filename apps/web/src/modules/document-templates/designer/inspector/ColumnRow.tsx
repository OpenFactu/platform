import React from 'react';
import { Button, Input, NumberInput, SearchableSelect, Select, ToggleGroup } from '@openfactu/ui';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { LinesTableColumn } from '../../components/canvas/types';
import { Label, Toggle } from './controls';

interface Option {
  value: string;
  label: string;
}

/**
 * Una columna de la tabla. Plegada se ve de un vistazo cómo se llama y cuánto ocupa, que es
 * lo que más se toca; desplegada, todo lo demás, con sitio para leerlo.
 */
export const ColumnRow: React.FC<{
  column: LinesTableColumn;
  open: boolean;
  /** Lo que puede mostrar la columna. */
  options: Option[];
  /** La segunda línea solo tiene sentido en las líneas del documento. */
  detailOptions?: Option[];
  handleProps: React.HTMLAttributes<HTMLElement>;
  onToggle: () => void;
  onChange: (changes: Partial<LinesTableColumn>) => void;
  onPickData: (path: string) => void;
  onRemove: () => void;
}> = ({
  column,
  open,
  options,
  detailOptions,
  handleProps,
  onToggle,
  onChange,
  onPickData,
  onRemove,
}) => {
  const { t } = useI18n();
  const dataName = options.find((option) => option.value === column.path)?.label ?? column.path;
  return (
    <div className="rounded border border-border-subtle bg-bg-card">
      <div className="flex items-center gap-1 pl-1 pr-1.5 py-1">
        <span
          {...handleProps}
          className="p-1 text-fg-subtle cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <GripVertical size={14} />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-1 text-left rounded hover:bg-bg-hover px-1 py-0.5"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-fg-default truncate">
              {column.label || t('templates.designer.lt.headerPlaceholder')}
            </span>
            <span className="block text-[11px] text-fg-muted truncate">{dataName}</span>
          </span>
          {open ? (
            <ChevronUp size={14} className="text-fg-subtle shrink-0" />
          ) : (
            <ChevronDown size={14} className="text-fg-subtle shrink-0" />
          )}
        </button>
        <NumberInput
          inputSize="sm"
          thousandSeparator={false}
          containerClassName="w-[76px] shrink-0"
          aria-label={t('templates.designer.lt.widthPct')}
          title={t('templates.designer.lt.widthPct')}
          suffix="%"
          value={Math.round(column.widthPct)}
          onChange={(value) => onChange({ widthPct: value ?? 0 })}
        />
      </div>

      {open && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-border-subtle">
          <div>
            <Label>{t('templates.designer.lt.headerPlaceholder')}</Label>
            <Input
              inputSize="sm"
              aria-label={t('templates.designer.lt.headerPlaceholder')}
              value={column.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </div>
          <div>
            <Label>{t('templates.designer.lt.data')}</Label>
            <SearchableSelect
              ariaLabel={t('templates.designer.lt.data')}
              options={options}
              value={column.path}
              onChange={onPickData}
            />
          </div>
          {detailOptions && (
            <div>
              <Label>{t('templates.designer.lt.secondLine')}</Label>
              <SearchableSelect
                ariaLabel={t('templates.designer.lt.secondLine')}
                options={[
                  { value: '', label: t('templates.designer.lt.noSecondLine') },
                  ...detailOptions,
                ]}
                value={column.detailPath ?? ''}
                onChange={(path) => onChange({ detailPath: path || undefined })}
              />
            </div>
          )}
          <div>
            <Label>{t('templates.designer.el.format')}</Label>
            <Select
              options={[
                { value: '', label: t('templates.designer.opt.noFormat') },
                { value: 'currency', label: t('templates.designer.opt.currency') },
                { value: 'number', label: t('templates.designer.opt.number') },
                { value: 'date', label: t('templates.designer.opt.date') },
                { value: 'percent', label: t('templates.designer.opt.percent') },
                { value: 'percentRaw', label: t('templates.designer.opt.percentRaw') },
                { value: 'discount', label: t('templates.designer.opt.discount') },
                { value: 'address', label: t('templates.designer.opt.address') },
              ]}
              value={column.format ?? ''}
              onChange={(value) =>
                onChange({ format: (value || undefined) as LinesTableColumn['format'] })
              }
              ariaLabel={t('templates.designer.el.format')}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              aria-label={t('templates.designer.common.alignment')}
              value={column.align ?? 'left'}
              onChange={(align) => align && onChange({ align })}
              items={[
                {
                  value: 'left' as const,
                  icon: <AlignLeft size={14} />,
                  title: t('templates.designer.lt.alignLeft'),
                },
                {
                  value: 'center' as const,
                  icon: <AlignCenter size={14} />,
                  title: t('templates.designer.opt.center'),
                },
                {
                  value: 'right' as const,
                  icon: <AlignRight size={14} />,
                  title: t('templates.designer.lt.alignRight'),
                },
              ]}
            />
            <Toggle
              label={t('templates.designer.lt.bold')}
              checked={column.style?.fontWeight === 'bold'}
              onChange={(bold) =>
                onChange({
                  style: { ...column.style, fontWeight: bold ? 'bold' : undefined },
                })
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-danger"
            onClick={onRemove}
          >
            <Trash2 size={13} /> {t('templates.designer.lt.delete')}
          </Button>
        </div>
      )}
    </div>
  );
};
