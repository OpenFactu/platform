import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { Input, NumberInput, Select, Textarea } from '@openfactu/ui';
import {
  CHOICE_TYPES,
  type Condition,
  type MapTarget,
  type Question,
  type Validation,
} from '@forms-engine';
import { MAP_TARGET_LABEL } from '../../domain/types';
import { validationKinds } from '../../domain/validationKinds';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  disabled?: boolean;
}

/** Bloque con título pequeño para cada ajuste avanzado de la pregunta. */
export const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="rounded-xs border border-border-subtle bg-bg-muted p-3 space-y-3">
    <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</div>
    {children}
  </div>
);

/** `label` es una clave de i18n. */
const TEXT_KINDS = [
  { value: 'length', label: 'forms.logic.kinds.length' },
  { value: 'url', label: 'forms.logic.kinds.url' },
  { value: 'regex', label: 'forms.logic.kinds.regex' },
];

export const ValidationPanel: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const { t } = useI18n();
  const kinds = validationKinds(q.type);
  const v: Validation = q.validation ?? { kind: kinds[0] };
  const set = (patch: Partial<Validation>) => onChange({ validation: { ...v, ...patch } });
  const minLabel =
    v.kind === 'length'
      ? t('forms.logic.minChars')
      : v.kind === 'count'
        ? t('forms.logic.chooseAtLeast')
        : t('forms.logic.min');
  const maxLabel =
    v.kind === 'length'
      ? t('forms.logic.maxChars')
      : v.kind === 'count'
        ? t('forms.logic.chooseAtMost')
        : t('forms.logic.max');
  return (
    <Panel title={t('forms.question.validation')}>
      <div className="grid gap-3 sm:grid-cols-3">
        {kinds.length > 1 && (
          <Select
            label={t('forms.logic.type')}
            options={TEXT_KINDS.filter((k) => kinds.includes(k.value as Validation['kind'])).map(
              (k) => ({ ...k, label: t(k.label) }),
            )}
            value={v.kind}
            onChange={(kind) =>
              onChange({ validation: { kind: kind as Validation['kind'], message: v.message } })
            }
            disabled={disabled}
          />
        )}
        {(v.kind === 'length' || v.kind === 'range' || v.kind === 'count') && (
          <>
            <NumberInput
              label={minLabel}
              value={v.min ?? null}
              onChange={(n) => set({ min: n ?? undefined })}
              precision={v.kind === 'range' ? 2 : 0}
              disabled={disabled}
            />
            <NumberInput
              label={maxLabel}
              value={v.max ?? null}
              onChange={(n) => set({ max: n ?? undefined })}
              precision={v.kind === 'range' ? 2 : 0}
              disabled={disabled}
            />
          </>
        )}
        {v.kind === 'regex' && (
          <div className="sm:col-span-2">
            <Input
              label={t('forms.logic.pattern')}
              value={v.pattern ?? ''}
              onChange={(e) => set({ pattern: e.target.value || undefined })}
              placeholder="^[A-Z]{3}\d{4}$"
              disabled={disabled}
            />
          </div>
        )}
      </div>
      <Input
        label={t('forms.logic.errorMessage')}
        value={v.message ?? ''}
        onChange={(e) => set({ message: e.target.value || undefined })}
        disabled={disabled}
      />
    </Panel>
  );
};

/** `label` es una clave de i18n. */
const OPS: { value: Condition['op']; label: string; needsValue: boolean }[] = [
  { value: 'equals', label: 'forms.logic.ops.equals', needsValue: true },
  { value: 'notEquals', label: 'forms.logic.ops.notEquals', needsValue: true },
  { value: 'answered', label: 'forms.logic.ops.answered', needsValue: false },
  { value: 'notAnswered', label: 'forms.logic.ops.notAnswered', needsValue: false },
];

/** «Mostrar solo si…»: depende de una pregunta anterior. */
export const ConditionPanel: React.FC<Props & { candidates: Question[] }> = ({
  question: q,
  onChange,
  candidates,
  disabled,
}) => {
  const { t } = useI18n();
  const c: Condition = q.showIf ?? { questionId: candidates[0]?.id ?? '', op: 'equals' };
  const source = candidates.find((x) => x.id === c.questionId);
  const set = (patch: Partial<Condition>) => onChange({ showIf: { ...c, ...patch } });
  const op = OPS.find((o) => o.value === c.op) ?? OPS[0];
  if (!candidates.length)
    return (
      <Panel title={t('forms.question.showIf')}>
        <p className="text-sm text-fg-muted">{t('forms.logic.needPrevious')}</p>
      </Panel>
    );
  return (
    <Panel title={t('forms.question.showIf')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label={t('forms.logic.theQuestion')}
          options={candidates.map((x) => ({
            value: x.id,
            label: x.title || t('forms.question.untitled'),
          }))}
          value={c.questionId}
          onChange={(questionId) => set({ questionId, value: undefined })}
          disabled={disabled}
        />
        <Select
          label={t('forms.logic.condition')}
          options={OPS.map((o) => ({ ...o, label: t(o.label) }))}
          value={c.op}
          onChange={(o) => set({ op: o as Condition['op'] })}
          disabled={disabled}
        />
        {op.needsValue &&
          (source && CHOICE_TYPES.includes(source.type) ? (
            <Select
              label={t('forms.logic.value')}
              options={(source.options ?? []).map((o) => ({ value: o.id, label: o.label }))}
              value={c.value ?? ''}
              onChange={(value) => set({ value })}
              placeholder={t('forms.logic.choose')}
              disabled={disabled}
            />
          ) : (
            <Input
              label={t('forms.logic.value')}
              value={c.value ?? ''}
              onChange={(e) => set({ value: e.target.value })}
              disabled={disabled}
            />
          ))}
      </div>
    </Panel>
  );
};

/** Tipos cuya respuesta correcta se escribe como texto (las de opción se marcan en las opciones). */
const TYPED_ANSWER = ['shortText', 'email', 'number', 'scale'];

export const QuizPanel: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const { t } = useI18n();
  const quiz = q.quiz ?? { points: 1 };
  const set = (patch: Partial<typeof quiz>) => onChange({ quiz: { ...quiz, ...patch } });
  const typed = TYPED_ANSWER.includes(q.type);
  const manual = !typed && !CHOICE_TYPES.includes(q.type);
  return (
    <Panel title={t('forms.logic.quiz')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberInput
          label={t('forms.logic.points')}
          value={quiz.points}
          onChange={(n) => set({ points: Math.max(0, n ?? 0) })}
          min={0}
          precision={0}
          disabled={disabled}
        />
        {typed && (
          <div className="sm:col-span-2">
            <Input
              label={t('forms.logic.acceptedAnswers')}
              helperText={t('forms.logic.acceptedHint')}
              value={(quiz.correct ?? []).join('; ')}
              onChange={(e) =>
                set({
                  correct: e.target.value
                    .split(';')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              disabled={disabled}
            />
          </div>
        )}
      </div>
      {CHOICE_TYPES.includes(q.type) && (
        <p className="text-xs text-fg-muted">{t('forms.logic.markCorrectHint')}</p>
      )}
      {manual && <p className="text-xs text-fg-muted">{t('forms.logic.manualGrading')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea
          label={t('forms.logic.feedbackOk')}
          rows={2}
          value={quiz.feedbackOk ?? ''}
          onChange={(e) => set({ feedbackOk: e.target.value || undefined })}
          disabled={disabled}
        />
        <Textarea
          label={t('forms.logic.feedbackKo')}
          rows={2}
          value={quiz.feedbackKo ?? ''}
          onChange={(e) => set({ feedbackKo: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
    </Panel>
  );
};

/** `label` es una clave de i18n. */
const MAP_OPTIONS = [
  { value: '', label: 'forms.logic.noCrm' },
  ...(Object.keys(MAP_TARGET_LABEL) as MapTarget[]).map((k) => ({
    value: k,
    label: MAP_TARGET_LABEL[k],
  })),
];

export const CrmPanel: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <Panel title={t('forms.logic.crmData')}>
      <div className="sm:w-72">
        <Select
          label={t('forms.logic.saveAs')}
          options={MAP_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          value={q.mapTo ?? ''}
          onChange={(v) => onChange({ mapTo: (v || undefined) as MapTarget | undefined })}
          disabled={disabled}
        />
      </div>
    </Panel>
  );
};
