import React from 'react';
import { Checkbox, ColorInput, DatePicker, Input, Select, cn, Textarea } from '@openfactu/ui';
import type { PluginFieldDef } from './types';
import { ReferenceSelect } from './ReferenceSelect';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  def: PluginFieldDef;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  className?: string;
  /** Si true, respeta `def.readOnly`. Si false, ignora readOnly (útil en admin). */
  respectReadOnly?: boolean;
}

/** Switch único para pintar un input editable de un campo plugin.
 *  Se usa desde `PluginFieldsSection` (header/detail) y desde `documentLineCells` (líneas). */
export const PluginFieldInput: React.FC<Props> = ({
  def,
  value,
  onChange,
  disabled,
  className,
  respectReadOnly = true,
}) => {
  const isDisabled = disabled || (respectReadOnly && !!def.readOnly);
  const ph = def.placeholder || '';
  const { t } = useI18n();

  switch (def.fieldType) {
    case 'BOOLEAN':
      return (
        <Checkbox
          checked={!!value}
          onChange={(v) => onChange(v)}
          disabled={isDisabled}
          label={value ? t('app.common.yes') : t('app.common.no')}
          containerClassName={cn('h-9', className)}
        />
      );

    case 'DATE':
      return (
        <DatePicker
          value={value || null}
          onChange={(v) => onChange(v ?? '')}
          disabled={isDisabled}
          className={className}
        />
      );

    case 'INTEGER':
      return (
        <Input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          disabled={isDisabled}
          className={cn('tabular-nums', className)}
          placeholder={ph}
        />
      );

    case 'DECIMAL':
    case 'CURRENCY':
    case 'PERCENT':
      return (
        <Input
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          className={cn('tabular-nums', className)}
          placeholder={ph}
        />
      );

    case 'ENUM':
      return (
        <Select
          options={[
            { value: '', label: '—' },
            ...(def.options ?? []).map((opt) => ({ value: String(opt.value), label: opt.label })),
          ]}
          value={value ?? ''}
          onChange={(v) => onChange(v || null)}
          disabled={isDisabled}
          className={className}
          ariaLabel={def.label ?? t('app.pluginFields.option')}
        />
      );

    case 'MULTISELECT': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div
          className={cn(
            'flex flex-wrap gap-1 p-2 rounded-lg border border-border-default bg-bg-card min-h-[2.25rem]',
            className,
          )}
        >
          {(def.options ?? []).map((opt) => {
            const on = arr.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isDisabled}
                onClick={() =>
                  onChange(on ? arr.filter((v: string) => v !== opt.value) : [...arr, opt.value])
                }
                className={cn(
                  'text-xs px-2 py-1 rounded-full border transition-colors',
                  on
                    ? 'bg-primary text-primary-fg border-primary'
                    : 'bg-bg-card border-border-default text-fg-body hover:border-primary',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }

    case 'URL':
    case 'EMAIL':
    case 'PHONE':
      return (
        <Input
          type={def.fieldType === 'EMAIL' ? 'email' : def.fieldType === 'URL' ? 'url' : 'tel'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          placeholder={ph}
          className={className}
        />
      );

    case 'COLOR':
      return (
        // ColorInput ya trae la muestra, el selector y el campo hex.
        <ColorInput
          value={value || ''}
          onChange={(v) => onChange(v)}
          disabled={isDisabled}
          containerClassName={className}
        />
      );

    case 'REFERENCE':
      return (
        <ReferenceSelect
          value={value || ''}
          onChange={onChange}
          refTable={def.refTable || ''}
          refDisplayField={def.refDisplayField || 'name'}
          disabled={isDisabled}
          placeholder={ph}
        />
      );

    case 'FILE':
      return (
        <Input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          placeholder={ph || t('app.pluginFields.attachmentPlaceholder')}
          className={className}
        />
      );

    case 'JSONB':
      return (
        <Textarea
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value);
            }
          }}
          disabled={isDisabled}
          rows={3}
          className={cn('font-mono', className)}
        />
      );

    default:
      return (
        <Input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          placeholder={ph || def.label}
          className={className}
        />
      );
  }
};
