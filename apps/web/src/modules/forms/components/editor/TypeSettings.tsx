import { useI18n } from '@/i18n/I18nContext';
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
  const { t } = useI18n();
  const scale = q.scale ?? { min: 1, max: 5 };
  const set = (patch: Partial<typeof scale>) => onChange({ scale: { ...scale, ...patch } });
  return (
    <div className="space-y-3">
      <div className="sm:max-w-sm">
        <Slider
          label={t('forms.typeSettings.scaleRange', { min: scale.min, max: scale.max })}
          helperText={t('forms.typeSettings.npsHint')}
          value={[scale.min, scale.max] as [number, number]}
          onChange={([min, max]) => set({ min, max })}
          min={0}
          max={10}
          minGap={1}
          marks
          thumbLabels={[t('forms.typeSettings.from'), t('forms.typeSettings.to')]}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t('forms.typeSettings.endLabel', { n: scale.min })}
          value={scale.minLabel ?? ''}
          onChange={(e) => set({ minLabel: e.target.value || undefined })}
          placeholder={t('forms.typeSettings.notLikely')}
          disabled={disabled}
        />
        <Input
          label={t('forms.typeSettings.endLabel', { n: scale.max })}
          value={scale.maxLabel ?? ''}
          onChange={(e) => set({ maxLabel: e.target.value || undefined })}
          placeholder={t('forms.typeSettings.veryLikely')}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export const RatingSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="sm:max-w-sm">
      <Slider
        label={t('forms.typeSettings.stars', { n: q.ratingMax ?? 5 })}
        value={q.ratingMax ?? 5}
        onChange={(ratingMax) => onChange({ ratingMax })}
        min={3}
        max={10}
        marks={ends(3, 10)}
        disabled={disabled}
      />
    </div>
  );
};

export const GridSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LabelList
        title={t('forms.typeSettings.rows')}
        noun={t('forms.typeSettings.row')}
        prefix="r"
        items={q.rows ?? []}
        onChange={(rows) => onChange({ rows })}
        disabled={disabled}
      />
      <LabelList
        title={t('forms.typeSettings.columns')}
        noun={t('forms.typeSettings.column')}
        prefix="c"
        items={q.columns ?? []}
        onChange={(columns) => onChange({ columns })}
        disabled={disabled}
      />
    </div>
  );
};

/** `label` es una clave de i18n. */
const FILE_KINDS = [
  { value: '', label: 'forms.typeSettings.fileKinds.any' },
  { value: 'image/*', label: 'forms.typeSettings.fileKinds.images' },
  { value: 'application/pdf', label: 'forms.typeSettings.fileKinds.pdf' },
  { value: 'image/*,application/pdf', label: 'forms.typeSettings.fileKinds.imagesPdf' },
  {
    value: '.doc,.docx,.xls,.xlsx,.odt,.ods,application/pdf',
    label: 'forms.typeSettings.fileKinds.documents',
  },
];

export const FileSettings: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const { t } = useI18n();
  const file = q.file ?? { maxFiles: 1, maxSizeMb: 10, accept: [] };
  const set = (patch: Partial<typeof file>) => onChange({ file: { ...file, ...patch } });
  const accept = file.accept.join(',');
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Select
        label={t('forms.typeSettings.allowedTypes')}
        options={FILE_KINDS.map((k) => ({ ...k, label: t(k.label) }))}
        value={FILE_KINDS.some((k) => k.value === accept) ? accept : ''}
        onChange={(v) => set({ accept: v ? v.split(',') : [] })}
        disabled={disabled}
      />
      <Slider
        label={t('forms.typeSettings.maxFiles', { count: file.maxFiles })}
        value={file.maxFiles}
        onChange={(maxFiles) => set({ maxFiles })}
        min={1}
        max={10}
        marks={ends(1, 10)}
        disabled={disabled}
      />
      <Slider
        label={t('forms.typeSettings.maxSize', { mb: file.maxSizeMb })}
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
