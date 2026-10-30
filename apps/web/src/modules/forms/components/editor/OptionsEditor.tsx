import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { Button, Checkbox, Input, Select, SortableList, Tooltip } from '@openfactu/ui';
import { CheckCircle2, Circle, GripVertical, Plus, Square, X } from 'lucide-react';
import { newId, type Option, type Question, type Section } from '@forms-engine';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  /** Para el desplegable «ir a sección» (solo si el salto está activado). */
  sections: Section[];
  branching: boolean;
  /** Cuestionario: marcar las correctas. */
  quiz: boolean;
  disabled?: boolean;
}

/**
 * Opciones de una pregunta de opción: se escriben en el sitio, se reordenan
 * arrastrando y, con los saltos activados, cada una elige a qué sección ir.
 */
export const OptionsEditor: React.FC<Props> = ({
  question: q,
  onChange,
  sections,
  branching,
  quiz,
  disabled,
}) => {
  const { t } = useI18n();
  const options = q.options ?? [];
  const correct = new Set(q.quiz?.correct ?? []);
  const Mark = q.type === 'checkbox' ? Square : Circle;

  const setOptions = (next: Option[]) => onChange({ options: next });
  const add = () =>
    setOptions([
      ...options,
      { id: newId('o'), label: t('forms.options.optionN', { n: options.length + 1 }) },
    ]);
  const remove = (id: string) => {
    const goTo = { ...(q.goTo ?? {}) };
    delete goTo[id];
    onChange({
      options: options.filter((o) => o.id !== id),
      goTo,
      quiz: q.quiz
        ? { ...q.quiz, correct: (q.quiz.correct ?? []).filter((c) => c !== id) }
        : q.quiz,
    });
  };
  const toggleCorrect = (id: string) => {
    const set = new Set(correct);
    if (q.type === 'checkbox') {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    } else {
      set.clear();
      set.add(id);
    }
    onChange({ quiz: { points: q.quiz?.points ?? 1, ...q.quiz, correct: [...set] } });
  };
  const goToOptions = [
    { value: '', label: t('forms.options.continueNext') },
    ...sections.map((s, i) => ({
      value: s.id,
      label: `${t('forms.options.goToSection', { n: i + 1 })}${s.title ? `: ${s.title}` : ''}`,
    })),
    { value: 'submit', label: t('forms.options.submitForm') },
  ];

  return (
    <div className="space-y-2">
      <SortableList
        items={options}
        getKey={(o) => o.id}
        onReorder={setOptions}
        disabled={disabled}
        handleLabel={t('forms.common.dragToReorder')}
        className="space-y-1"
        renderItem={(o, { handleProps, index }) => (
          <div className="flex flex-wrap items-center gap-2">
            {!disabled && (
              <span {...handleProps}>
                <GripVertical size={14} className="text-fg-subtle" />
              </span>
            )}
            {quiz ? (
              <Tooltip
                content={
                  correct.has(o.id)
                    ? t('forms.options.correctAnswer')
                    : t('forms.options.markCorrect')
                }
              >
                <button
                  type="button"
                  aria-pressed={correct.has(o.id)}
                  aria-label={t('forms.options.markItemCorrect', { label: o.label })}
                  onClick={() => toggleCorrect(o.id)}
                  className={correct.has(o.id) ? 'text-success-fg' : 'text-fg-subtle'}
                  disabled={disabled}
                >
                  <CheckCircle2 size={18} />
                </button>
              </Tooltip>
            ) : q.type === 'dropdown' ? (
              <span className="w-5 text-right text-sm text-fg-subtle tabular-nums">
                {index + 1}.
              </span>
            ) : (
              <Mark size={16} className="text-fg-subtle" />
            )}
            <div className="flex-1 min-w-[10rem]">
              <Input
                aria-label={t('forms.options.optionN', { n: index + 1 })}
                value={o.label}
                onChange={(e) =>
                  setOptions(
                    options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)),
                  )
                }
                disabled={disabled}
              />
            </div>
            {branching && (
              <div className="w-full sm:w-64">
                <Select
                  ariaLabel={t('forms.options.after', { label: o.label })}
                  options={goToOptions}
                  value={q.goTo?.[o.id] ?? ''}
                  onChange={(v) => {
                    const goTo = { ...(q.goTo ?? {}) };
                    if (v) goTo[o.id] = v;
                    else delete goTo[o.id];
                    onChange({ goTo });
                  }}
                  disabled={disabled}
                />
              </div>
            )}
            {!disabled && options.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('forms.common.removeItem', { label: o.label })}
                onClick={() => remove(o.id)}
              >
                <X size={14} />
              </Button>
            )}
          </div>
        )}
      />
      {q.hasOther && (
        <div className="flex items-center gap-2 pl-6">
          <Mark size={16} className="text-fg-subtle" />
          <span className="flex-1 text-sm text-fg-muted border-b border-dashed border-border-default py-2">
            {t('forms.options.otherEllipsis')}
          </span>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('forms.options.removeOther')}
              onClick={() => onChange({ hasOther: false })}
            >
              <X size={14} />
            </Button>
          )}
        </div>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <Button type="button" variant="ghost" size="sm" onClick={add}>
            <Plus size={14} /> {t('forms.options.add')}
          </Button>
          {q.type !== 'dropdown' && !q.hasOther && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ hasOther: true })}
            >
              {t('forms.options.addOther')}
            </Button>
          )}
        </div>
      )}
      {q.type !== 'dropdown' && (
        <Checkbox
          label={t('forms.options.shuffle')}
          checked={!!q.shuffle}
          onChange={(v) => onChange({ shuffle: v || undefined })}
          disabled={disabled}
        />
      )}
    </div>
  );
};
