import React from 'react';
import {
  Checkbox,
  DatePicker,
  Input,
  NumberInput,
  RadioGroup,
  Select,
  Textarea,
  cn,
} from '@openfactu/ui';
import type { Answers, FormField } from '../../domain/forms';

interface Props {
  fields: FormField[];
  answers: Answers;
  onChange: (fieldId: string, value: Answers[string] | undefined) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

/** Escala de botones (valoración 1–5, NPS 0–10): un toque, sin desplegables. */
const Scale: React.FC<{
  field: FormField;
  from: number;
  to: number;
  value: number | undefined;
  onChange: (v: number) => void;
  error?: string;
  disabled?: boolean;
}> = ({ field, from, to, value, onChange, error, disabled }) => {
  const values = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <fieldset className="space-y-2" aria-invalid={!!error}>
      <legend className="text-sm font-semibold text-fg-default">
        {field.label}
        {field.required && <span className="text-danger-fg"> *</span>}
      </legend>
      {field.help && <p className="text-xs text-fg-muted">{field.help}</p>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
        {values.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'h-11 min-w-11 px-3 rounded-xs border text-sm font-semibold tabular-nums transition-colors',
              value === n
                ? 'bg-accent text-accent-fg border-accent'
                : 'bg-bg-card text-fg-body border-border-default hover:bg-bg-hover',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {field.type === 'nps' && (
        <div className="flex justify-between text-[11px] text-fg-subtle max-w-[34rem]">
          <span>Nada probable</span>
          <span>Muy probable</span>
        </div>
      )}
      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </fieldset>
  );
};

/**
 * Pinta los campos de un formulario del CRM con controles de @openfactu/ui.
 * Lo usan la vista previa del constructor y la página pública.
 */
export const FormRenderer: React.FC<Props> = ({
  fields,
  answers,
  onChange,
  errors = {},
  disabled,
}) => (
  <div className="space-y-6">
    {fields.map((f) => {
      const value = answers[f.id];
      const error = errors[f.id];
      const label = f.required ? `${f.label} *` : f.label;
      const set = (v: Answers[string] | undefined) => onChange(f.id, v);
      switch (f.type) {
        case 'section':
          return (
            <div key={f.id} className="pt-2 border-t border-border-subtle">
              <h3 className="text-base font-bold text-fg-default">{f.label}</h3>
              {f.help && <p className="text-sm text-fg-muted mt-1">{f.help}</p>}
            </div>
          );
        case 'textarea':
          return (
            <Textarea
              key={f.id}
              label={label}
              helperText={f.help}
              error={error}
              rows={4}
              value={String(value ?? '')}
              onChange={(e) => set(e.target.value)}
              disabled={disabled}
            />
          );
        case 'number':
          return (
            <NumberInput
              key={f.id}
              label={label}
              helperText={f.help}
              error={error}
              value={value === undefined || value === '' ? null : Number(value)}
              onChange={(v) => set(v ?? undefined)}
              precision={2}
              disabled={disabled}
            />
          );
        case 'date':
          return (
            <DatePicker
              key={f.id}
              label={label}
              helperText={f.help}
              error={error}
              value={value ? String(value) : null}
              onChange={(v) => set(v ?? undefined)}
              disabled={disabled}
            />
          );
        case 'select':
          return (
            <Select
              key={f.id}
              label={label}
              helperText={f.help}
              error={error}
              options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
              value={String(value ?? '')}
              onChange={(v) => set(v)}
              placeholder="Elige una opción"
              disabled={disabled}
            />
          );
        case 'radio':
          return (
            <RadioGroup
              key={f.id}
              label={label}
              helperText={f.help}
              error={error}
              options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
              value={String(value ?? '')}
              onChange={(v) => set(v)}
              disabled={disabled}
            />
          );
        case 'checkbox': {
          const list = Array.isArray(value) ? value : [];
          return (
            <fieldset key={f.id} className="space-y-2">
              <legend className="text-sm font-semibold text-fg-default">{label}</legend>
              {f.help && <p className="text-xs text-fg-muted">{f.help}</p>}
              {(f.options ?? []).map((o) => (
                <Checkbox
                  key={o}
                  label={o}
                  checked={list.includes(o)}
                  onChange={(checked) => set(checked ? [...list, o] : list.filter((x) => x !== o))}
                  disabled={disabled}
                />
              ))}
              {error && <p className="text-xs text-danger-fg">{error}</p>}
            </fieldset>
          );
        }
        case 'rating':
        case 'nps':
          return (
            <Scale
              key={f.id}
              field={f}
              from={f.type === 'rating' ? 1 : 0}
              to={f.type === 'rating' ? 5 : 10}
              value={value === undefined ? undefined : Number(value)}
              onChange={(v) => set(v)}
              error={error}
              disabled={disabled}
            />
          );
        default:
          return (
            <Input
              key={f.id}
              label={label}
              helperText={f.help}
              error={error}
              type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
              value={String(value ?? '')}
              onChange={(e) => set(e.target.value)}
              disabled={disabled}
            />
          );
      }
    })}
  </div>
);
