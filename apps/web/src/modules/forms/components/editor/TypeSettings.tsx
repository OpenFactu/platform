import React from 'react';
import { Input, Select, Slider } from '@openfactu/ui';
import type { Question } from '@forms-engine';
import { LabelList } from './LabelList';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  disabled?: boolean;
}

/** Marcas en los extremos de un deslizador. */
const ends = (min: number, max: number) => [
  { value: min, label: String(min) },
  { value: max, label: String(max) },
];

/** Escala lineal: de dónde a dónde y qué significa cada extremo. */
export const ScaleSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const scale = q.scale ?? { min: 1, max: 5 };
  const set = (patch: Partial<typeof scale>) => onChange({ scale: { ...scale, ...patch } });
  return (
    <div className="space-y-3">
      <div className="sm:max-w-sm">
        <Slider
          label={`De ${scale.min} a ${scale.max}`}
          helperText="De 0 a 10 es la recomendación (NPS) y el resumen calcula su índice."
          value={[scale.min, scale.max] as [number, number]}
          onChange={([min, max]) => set({ min, max })}
          min={0}
          max={10}
          minGap={1}
          marks
          thumbLabels={['Desde', 'Hasta']}
          disabled={disabled}
        />
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
  <div className="sm:max-w-sm">
    <Slider
      label={`${q.ratingMax ?? 5} estrellas`}
      value={q.ratingMax ?? 5}
      onChange={(ratingMax) => onChange({ ratingMax })}
      min={3}
      max={10}
      marks={ends(3, 10)}
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
    <div className="grid gap-4 sm:grid-cols-3">
      <Select
        label="Tipos permitidos"
        options={FILE_KINDS}
        value={FILE_KINDS.some((k) => k.value === accept) ? accept : ''}
        onChange={(v) => set({ accept: v ? v.split(',') : [] })}
        disabled={disabled}
      />
      <Slider
        label={`Hasta ${file.maxFiles} archivo${file.maxFiles === 1 ? '' : 's'}`}
        value={file.maxFiles}
        onChange={(maxFiles) => set({ maxFiles })}
        min={1}
        max={10}
        marks={ends(1, 10)}
        disabled={disabled}
      />
      <Slider
        label={`Hasta ${file.maxSizeMb} MB cada uno`}
        value={file.maxSizeMb}
        onChange={(maxSizeMb) => set({ maxSizeMb })}
        min={1}
        max={10}
        marks={ends(1, 10)}
        formatValue={(v) => `${v} MB`}
        disabled={disabled}
      />
    </div>
  );
};
