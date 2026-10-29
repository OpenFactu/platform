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

const TEXT_KINDS = [
  { value: 'length', label: 'Longitud' },
  { value: 'url', label: 'Dirección web' },
  { value: 'regex', label: 'Expresión regular' },
];

export const ValidationPanel: React.FC<Props> = ({ question: q, onChange, disabled }) => {
  const kinds = validationKinds(q.type);
  const v: Validation = q.validation ?? { kind: kinds[0] };
  const set = (patch: Partial<Validation>) => onChange({ validation: { ...v, ...patch } });
  const minLabel =
    v.kind === 'length'
      ? 'Mínimo de caracteres'
      : v.kind === 'count'
        ? 'Elegir al menos'
        : 'Mínimo';
  const maxLabel =
    v.kind === 'length'
      ? 'Máximo de caracteres'
      : v.kind === 'count'
        ? 'Elegir como mucho'
        : 'Máximo';
  return (
    <Panel title="Validación de la respuesta">
      <div className="grid gap-3 sm:grid-cols-3">
        {kinds.length > 1 && (
          <Select
            label="Tipo"
            options={TEXT_KINDS.filter((k) => kinds.includes(k.value as Validation['kind']))}
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
              label="Patrón"
              value={v.pattern ?? ''}
              onChange={(e) => set({ pattern: e.target.value || undefined })}
              placeholder="^[A-Z]{3}\d{4}$"
              disabled={disabled}
            />
          </div>
        )}
      </div>
      <Input
        label="Mensaje de error (opcional)"
        value={v.message ?? ''}
        onChange={(e) => set({ message: e.target.value || undefined })}
        disabled={disabled}
      />
    </Panel>
  );
};

const OPS: { value: Condition['op']; label: string; needsValue: boolean }[] = [
  { value: 'equals', label: 'es', needsValue: true },
  { value: 'notEquals', label: 'no es', needsValue: true },
  { value: 'answered', label: 'tiene respuesta', needsValue: false },
  { value: 'notAnswered', label: 'no tiene respuesta', needsValue: false },
];

/** «Mostrar solo si…»: depende de una pregunta anterior. */
export const ConditionPanel: React.FC<Props & { candidates: Question[] }> = ({
  question: q,
  onChange,
  candidates,
  disabled,
}) => {
  const c: Condition = q.showIf ?? { questionId: candidates[0]?.id ?? '', op: 'equals' };
  const source = candidates.find((x) => x.id === c.questionId);
  const set = (patch: Partial<Condition>) => onChange({ showIf: { ...c, ...patch } });
  const op = OPS.find((o) => o.value === c.op) ?? OPS[0];
  if (!candidates.length)
    return (
      <Panel title="Mostrar solo si…">
        <p className="text-sm text-fg-muted">
          Añade antes otra pregunta: la condición depende de una pregunta anterior.
        </p>
      </Panel>
    );
  return (
    <Panel title="Mostrar solo si…">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="La pregunta"
          options={candidates.map((x) => ({
            value: x.id,
            label: x.title || 'Pregunta sin título',
          }))}
          value={c.questionId}
          onChange={(questionId) => set({ questionId, value: undefined })}
          disabled={disabled}
        />
        <Select
          label="Condición"
          options={OPS}
          value={c.op}
          onChange={(o) => set({ op: o as Condition['op'] })}
          disabled={disabled}
        />
        {op.needsValue &&
          (source && CHOICE_TYPES.includes(source.type) ? (
            <Select
              label="Valor"
              options={(source.options ?? []).map((o) => ({ value: o.id, label: o.label }))}
              value={c.value ?? ''}
              onChange={(value) => set({ value })}
              placeholder="Elige"
              disabled={disabled}
            />
          ) : (
            <Input
              label="Valor"
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
  const quiz = q.quiz ?? { points: 1 };
  const set = (patch: Partial<typeof quiz>) => onChange({ quiz: { ...quiz, ...patch } });
  const typed = TYPED_ANSWER.includes(q.type);
  const manual = !typed && !CHOICE_TYPES.includes(q.type);
  return (
    <Panel title="Cuestionario">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberInput
          label="Puntos"
          value={quiz.points}
          onChange={(n) => set({ points: Math.max(0, n ?? 0) })}
          min={0}
          precision={0}
          disabled={disabled}
        />
        {typed && (
          <div className="sm:col-span-2">
            <Input
              label="Respuestas aceptadas"
              helperText="Separadas por «;». No distingue mayúsculas."
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
        <p className="text-xs text-fg-muted">
          Marca las respuestas correctas con el círculo junto a cada opción.
        </p>
      )}
      {manual && (
        <p className="text-xs text-fg-muted">Esta pregunta se corrige a mano desde Respuestas.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea
          label="Explicación si acierta"
          rows={2}
          value={quiz.feedbackOk ?? ''}
          onChange={(e) => set({ feedbackOk: e.target.value || undefined })}
          disabled={disabled}
        />
        <Textarea
          label="Explicación si falla"
          rows={2}
          value={quiz.feedbackKo ?? ''}
          onChange={(e) => set({ feedbackKo: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
    </Panel>
  );
};

const MAP_OPTIONS = [
  { value: '', label: 'No guardar en el CRM' },
  ...(Object.keys(MAP_TARGET_LABEL) as MapTarget[]).map((k) => ({
    value: k,
    label: MAP_TARGET_LABEL[k],
  })),
];

export const CrmPanel: React.FC<Props> = ({ question: q, onChange, disabled }) => (
  <Panel title="Dato del CRM">
    <div className="sm:w-72">
      <Select
        label="Guardar la respuesta como"
        options={MAP_OPTIONS}
        value={q.mapTo ?? ''}
        onChange={(v) => onChange({ mapTo: (v || undefined) as MapTarget | undefined })}
        disabled={disabled}
      />
    </div>
  </Panel>
);
