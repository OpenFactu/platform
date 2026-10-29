import React from 'react';
import { Input, NumberInput, Select } from '@openfactu/ui';
import type { Question } from '@forms-engine';
import { LabelList } from './LabelList';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  disabled?: boolean;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    value: String(from + i),
    label: String(from + i),
  }));

/** Escala lineal: de dónde a dónde y qué significa cada extremo. */
export const ScaleSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const scale = q.scale ?? { min: 1, max: 5 };
  const set = (patch: Partial<typeof scale>) => onChange({ scale: { ...scale, ...patch } });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <Select
            label="Desde"
            options={range(0, 1)}
            value={String(scale.min)}
            onChange={(v) => set({ min: Number(v) })}
            disabled={disabled}
          />
        </div>
        <div className="w-24">
          <Select
            label="Hasta"
            options={range(2, 10)}
            value={String(scale.max)}
            onChange={(v) => set({ max: Number(v) })}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={`Etiqueta del ${scale.min} (opcional)`}
          value={scale.minLabel ?? ''}
          onChange={(e) => set({ minLabel: e.target.value || undefined })}
          placeholder="Nada probable"
          disabled={disabled}
        />
        <Input
          label={`Etiqueta del ${scale.max} (opcional)`}
          value={scale.maxLabel ?? ''}
          onChange={(e) => set({ maxLabel: e.target.value || undefined })}
          placeholder="Muy probable"
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export const RatingSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => (
  <div className="w-32">
    <Select
      label="Estrellas"
      options={range(3, 10)}
      value={String(q.ratingMax ?? 5)}
      onChange={(v) => onChange({ ratingMax: Number(v) })}
      disabled={disabled}
    />
  </div>
);

export const GridSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => (
  <div className="grid gap-4 md:grid-cols-2">
    <LabelList
      title="Filas"
      noun="Fila"
      prefix="r"
      items={q.rows ?? []}
      onChange={(rows) => onChange({ rows })}
      disabled={disabled}
    />
    <LabelList
      title="Columnas"
      noun="Columna"
      prefix="c"
      items={q.columns ?? []}
      onChange={(columns) => onChange({ columns })}
      disabled={disabled}
    />
  </div>
);

const FILE_KINDS = [
  { value: '', label: 'Cualquier tipo' },
  { value: 'image/*', label: 'Imágenes' },
  { value: 'application/pdf', label: 'PDF' },
  { value: 'image/*,application/pdf', label: 'Imágenes y PDF' },
  {
    value: '.doc,.docx,.xls,.xlsx,.odt,.ods,application/pdf',
    label: 'Documentos (PDF, Word, Excel)',
  },
];

export const FileSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const file = q.file ?? { maxFiles: 1, maxSizeMb: 10, accept: [] };
  const set = (patch: Partial<typeof file>) => onChange({ file: { ...file, ...patch } });
  const accept = file.accept.join(',');
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        label="Tipos permitidos"
        options={FILE_KINDS}
        value={FILE_KINDS.some((k) => k.value === accept) ? accept : ''}
        onChange={(v) => set({ accept: v ? v.split(',') : [] })}
        disabled={disabled}
      />
      <Select
        label="Número de archivos"
        options={range(1, 10)}
        value={String(file.maxFiles)}
        onChange={(v) => set({ maxFiles: Number(v) })}
        disabled={disabled}
      />
      <NumberInput
        label="Tamaño máximo (MB)"
        value={file.maxSizeMb}
        onChange={(v) => set({ maxSizeMb: Math.max(1, Math.min(10, v ?? 10)) })}
        min={1}
        max={10}
        precision={0}
        disabled={disabled}
      />
    </div>
  );
};
