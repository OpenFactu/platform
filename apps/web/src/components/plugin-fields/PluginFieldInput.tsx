import React from 'react';
import { DatePicker, Input, cn } from '@openfactu/ui';
import type { PluginFieldDef } from './types';
import { ReferenceSelect } from './ReferenceSelect';

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

  switch (def.fieldType) {
    case 'BOOLEAN':
      return (
        <label className={cn('flex items-center gap-2 h-9 cursor-pointer select-none', className)}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={isDisabled}
            className="w-4 h-4 accent-primary rounded"
          />
          <span className="text-xs font-semibold text-fg-body">{value ? 'Sí' : 'No'}</span>
        </label>
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
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={isDisabled}
          className={cn(
            'w-full h-9 rounded-lg border border-border-default bg-bg-card text-sm px-3 disabled:opacity-50',
            className,
          )}
        >
          <option value="">—</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
                    ? 'bg-primary text-white border-primary'
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
        <div className={cn('flex items-center gap-2', className)}>
          <input
            type="color"
            value={value || '#000000'}
            onChange={(e) => onChange(e.target.value)}
            disabled={isDisabled}
            className="h-9 w-12 rounded-lg border border-border-default bg-white cursor-pointer disabled:opacity-50"
          />
          <Input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isDisabled}
            placeholder="#0D9488"
            className="font-mono flex-1"
          />
        </div>
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
          placeholder={ph || 'URL o id del adjunto'}
          className={className}
        />
      );

    case 'JSONB':
      return (
        <textarea
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
          className={cn(
            'w-full rounded-lg border border-border-default bg-bg-card text-sm px-3 py-2 font-mono disabled:opacity-50',
            className,
          )}
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
