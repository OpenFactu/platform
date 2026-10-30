import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import {
  Checkbox,
  DatePicker,
  FileDropzone,
  Input,
  NumberInput,
  RadioGroup,
  Select,
  Textarea,
  cn,
} from '@openfactu/ui';
import { Star } from 'lucide-react';
import { OTHER, otherKey, type AnswerValue, type Answers, type Question } from '@forms-engine';

export interface UploadedFile {
  token: string;
  fileName: string;
}

interface Props {
  question: Question;
  answers: Answers;
  onChange: (id: string, value: AnswerValue | undefined) => void;
  error?: string;
  disabled?: boolean;
  /** Sube un archivo y devuelve su token; sin esto la pregunta de archivo se ve deshabilitada. */
  upload?: (questionId: string, file: File) => Promise<UploadedFile>;
}

/** Botones de una escala o de las filas de una cuadrícula: grandes y que pasan de línea en móvil. */
const Choice: React.FC<{
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  label?: string;
}> = ({ selected, onClick, disabled, children, label }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'min-h-11 min-w-11 px-3 rounded-xs border text-sm font-semibold transition-colors',
      selected
        ? 'bg-accent text-accent-fg border-accent'
        : 'bg-bg-card text-fg-body border-border-default hover:bg-bg-hover',
    )}
  >
    {children}
  </button>
);

/** El control de una pregunta según su tipo. El título y la ayuda los pone QuestionBlock. */
export const QuestionField: React.FC<Props> = ({
  question: q,
  answers,
  onChange,
  error,
  disabled,
  upload,
}) => {
  const { t } = useI18n();
  const value = answers[q.id];
  const set = (v: AnswerValue | undefined) => onChange(q.id, v);
  const other = String(answers[otherKey(q.id)] ?? '');
  const setOther = (v: string) => onChange(otherKey(q.id), v || undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // El File de cada token, para enseñar nombre y tamaño en la lista.
  const [picked, setPicked] = useState<Record<string, File>>({});

  switch (q.type) {
    case 'paragraph':
      return (
        <Textarea
          aria-label={q.title}
          rows={4}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
          error={error}
          placeholder={t('forms.field.yourAnswer')}
          disabled={disabled}
        />
      );
    case 'number':
      return (
        <NumberInput
          aria-label={q.title}
          value={value === undefined || value === '' ? null : Number(value)}
          onChange={(v) => set(v ?? undefined)}
          precision={2}
          error={error}
          disabled={disabled}
        />
      );
    case 'date':
      return (
        <DatePicker
          ariaLabel={q.title}
          value={value ? String(value) : null}
          onChange={(v) => set(v ?? undefined)}
          error={error}
          disabled={disabled}
        />
      );
    case 'time':
      return (
        <Input
          aria-label={q.title}
          type="time"
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value || undefined)}
          error={error}
          disabled={disabled}
        />
      );
    case 'dropdown':
      return (
        <Select
          ariaLabel={q.title}
          options={(q.options ?? []).map((o) => ({ value: o.id, label: o.label }))}
          value={String(value ?? '')}
          onChange={(v) => set(v || undefined)}
          placeholder={t('forms.logic.choose')}
          error={error}
          disabled={disabled}
        />
      );
    case 'radio':
      return (
        <div className="space-y-2">
          <RadioGroup
            options={[
              ...(q.options ?? []).map((o) => ({ value: o.id, label: o.label })),
              ...(q.hasOther ? [{ value: OTHER, label: t('forms.field.other') }] : []),
            ]}
            value={String(value ?? '')}
            onChange={(v) => set(v)}
            error={error}
            disabled={disabled}
          />
          {value === OTHER && (
            <Input
              aria-label={t('forms.field.other')}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder={t('forms.field.writeAnswer')}
              disabled={disabled}
            />
          )}
        </div>
      );
    case 'checkbox': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (id: string, on: boolean) => {
        const next = on ? [...list, id] : list.filter((x) => x !== id);
        set(next.length ? next : undefined);
      };
      return (
        <div className="space-y-2">
          {[
            ...(q.options ?? []),
            ...(q.hasOther ? [{ id: OTHER, label: t('forms.field.other') }] : []),
          ].map((o) => (
            <Checkbox
              key={o.id}
              label={o.label}
              checked={list.includes(o.id)}
              onChange={(on) => toggle(o.id, on)}
              disabled={disabled}
            />
          ))}
          {list.includes(OTHER) && (
            <Input
              aria-label={t('forms.field.other')}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder={t('forms.field.writeAnswer')}
              disabled={disabled}
            />
          )}
          {error && <p className="text-xs text-danger-fg">{error}</p>}
        </div>
      );
    }
    case 'scale': {
      const min = q.scale?.min ?? 1;
      const max = q.scale?.max ?? 5;
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.title}>
            {values.map((n) => (
              <Choice key={n} selected={value === n} onClick={() => set(n)} disabled={disabled}>
                {n}
              </Choice>
            ))}
          </div>
          {(q.scale?.minLabel || q.scale?.maxLabel) && (
            <div className="flex justify-between gap-4 text-xs text-fg-muted max-w-[36rem]">
              <span>{q.scale?.minLabel}</span>
              <span>{q.scale?.maxLabel}</span>
            </div>
          )}
          {error && <p className="text-xs text-danger-fg">{error}</p>}
        </div>
      );
    }
    case 'rating': {
      const max = q.ratingMax ?? 5;
      const current = Number(value) || 0;
      return (
        <div className="space-y-1">
          <div className="flex gap-1" role="radiogroup" aria-label={q.title}>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={current === n}
                aria-label={t('forms.field.ratingOf', { n, max })}
                disabled={disabled}
                onClick={() => set(current === n ? undefined : n)}
                className="p-1 text-accent disabled:opacity-50"
              >
                <Star size={28} className={n <= current ? 'fill-current' : 'opacity-40'} />
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-danger-fg">{error}</p>}
        </div>
      );
    }
    case 'gridRadio':
    case 'gridCheckbox': {
      const grid = (
        value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      ) as Record<string, string | string[]>;
      const setCell = (rowId: string, colId: string) => {
        const next = { ...grid };
        if (q.type === 'gridRadio') next[rowId] = colId;
        else {
          const cur = Array.isArray(next[rowId]) ? (next[rowId] as string[]) : [];
          const upd = cur.includes(colId) ? cur.filter((c) => c !== colId) : [...cur, colId];
          if (upd.length) next[rowId] = upd;
          else delete next[rowId];
        }
        set(Object.keys(next).length ? next : undefined);
      };
      return (
        <div className="space-y-4">
          {(q.rows ?? []).map((r) => (
            <div key={r.id} className="space-y-2">
              <div className="text-sm text-fg-body">{r.label}</div>
              <div
                className="flex flex-wrap gap-2"
                role={q.type === 'gridRadio' ? 'radiogroup' : 'group'}
                aria-label={r.label}
              >
                {(q.columns ?? []).map((c) => {
                  const cell = grid[r.id];
                  const selected = Array.isArray(cell) ? cell.includes(c.id) : cell === c.id;
                  return (
                    <Choice
                      key={c.id}
                      selected={selected}
                      onClick={() => setCell(r.id, c.id)}
                      disabled={disabled}
                    >
                      {c.label}
                    </Choice>
                  );
                })}
              </div>
            </div>
          ))}
          {error && <p className="text-xs text-danger-fg">{error}</p>}
        </div>
      );
    }
    case 'file': {
      const tokens = Array.isArray(value) ? (value as string[]) : [];
      const maxFiles = q.file?.maxFiles ?? 1;
      return (
        <div className="space-y-2">
          <FileDropzone
            variant="area"
            multiple={maxFiles > 1}
            maxFiles={maxFiles - tokens.length}
            maxSizeMb={Math.min(q.file?.maxSizeMb ?? 10, 10)}
            accept={q.file?.accept?.length ? q.file.accept.join(',') : undefined}
            disabled={disabled || !upload || tokens.length >= maxFiles}
            isUploading={uploading}
            uploadingLabel={t('forms.field.uploading')}
            hint={
              upload
                ? t('forms.field.fileHint', {
                    count: maxFiles,
                    mb: Math.min(q.file?.maxSizeMb ?? 10, 10),
                  })
                : t('forms.field.uploadOnlyPublished')
            }
            files={tokens.map((tok) => picked[tok] ?? new File([], t('forms.field.attachment')))}
            onRemoveFile={(i: number) => {
              const next = tokens.filter((_, k) => k !== i);
              set(next.length ? next : undefined);
            }}
            onReject={(reason) =>
              setUploadError(
                reason === 'size'
                  ? t('forms.field.fileTooBig')
                  : reason === 'type'
                    ? t('forms.field.fileTypeNotAllowed')
                    : t('forms.field.tooManyFiles'),
              )
            }
            onFiles={async (files: File[]) => {
              if (!upload) return;
              setUploading(true);
              setUploadError(null);
              try {
                const added: string[] = [];
                const newFiles: Record<string, File> = {};
                for (const f of files.slice(0, maxFiles - tokens.length)) {
                  const up = await upload(q.id, f);
                  added.push(up.token);
                  newFiles[up.token] = f;
                }
                setPicked((p) => ({ ...p, ...newFiles }));
                set([...tokens, ...added]);
              } catch (e) {
                setUploadError(e instanceof Error ? e.message : t('forms.field.uploadFailed'));
              } finally {
                setUploading(false);
              }
            }}
            error={uploadError ?? error}
          />
        </div>
      );
    }
    default:
      return (
        <Input
          aria-label={q.title}
          type={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
          error={error}
          placeholder={t('forms.field.yourAnswer')}
          disabled={disabled}
        />
      );
  }
};
