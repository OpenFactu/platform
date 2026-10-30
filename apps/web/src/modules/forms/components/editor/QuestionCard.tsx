import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import {
  Badge,
  Card,
  DropdownMenu,
  Input,
  Select,
  Switch,
  Textarea,
  cn,
  type SortableHandleProps,
} from '@openfactu/ui';
import { ArrowDown, ArrowUp, Copy, GripHorizontal, MoreVertical, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { iconButtonClass } from './iconButtonStyles';
import {
  BRANCHING_TYPES,
  CHOICE_TYPES,
  GRID_TYPES,
  type Question,
  type QuestionType,
  type Section,
} from '@forms-engine';
import { MAP_TARGET_LABEL, QUESTION_TYPE_GROUPS, QUESTION_TYPE_LABEL } from '../../domain/types';
import { QuestionField } from '../render/QuestionField';
import { OptionsEditor } from './OptionsEditor';
import { FileSettings, GridSettings, RatingSettings, ScaleSettings } from './TypeSettings';
import { ConditionPanel, CrmPanel, QuizPanel, ValidationPanel } from './LogicPanels';
import { validationKinds } from '../../domain/validationKinds';

type PanelKey = 'description' | 'validation' | 'condition' | 'branching' | 'crm';

export interface QuestionCardProps {
  question: Question;
  active: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<Question>) => void;
  onChangeType: (type: QuestionType) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Mover a la sección anterior/siguiente (undefined si no hay). */
  onMoveSection?: (dir: -1 | 1) => void;
  sectionIndex: number;
  sectionCount: number;
  sections: Section[];
  /** Preguntas anteriores, para «Mostrar solo si…». */
  candidates: Question[];
  quiz: boolean;
  crm: boolean;
  handleProps?: SortableHandleProps;
  disabled?: boolean;
}

/** `label` es una clave de i18n. */
const TYPE_OPTIONS = QUESTION_TYPE_GROUPS.flat().map((type) => ({
  value: type,
  label: QUESTION_TYPE_LABEL[type],
}));

/** Paneles que ya tienen contenido y por tanto se enseñan abiertos. */
function initialPanels(q: Question): Set<PanelKey> {
  const s = new Set<PanelKey>();
  if (q.description) s.add('description');
  if (q.validation) s.add('validation');
  if (q.showIf) s.add('condition');
  if (q.goTo && Object.keys(q.goTo).length) s.add('branching');
  if (q.mapTo) s.add('crm');
  return s;
}

/**
 * Tarjeta de pregunta del editor. Plegada enseña la pregunta tal y como se
 * verá; activa se edita en el sitio, como en Google Forms.
 */
export const QuestionCard: React.FC<QuestionCardProps> = (p) => {
  const { t } = useI18n();
  const { question: q, active, onChange, disabled } = p;
  const [panels, setPanels] = useState<Set<PanelKey>>(() => initialPanels(q));

  const toggle = (k: PanelKey) => {
    const next = new Set(panels);
    if (next.has(k)) {
      next.delete(k);
      // Al cerrar un panel se quita lo que configuraba: así no quedan reglas ocultas.
      if (k === 'description') onChange({ description: undefined });
      if (k === 'validation') onChange({ validation: undefined });
      if (k === 'condition') onChange({ showIf: undefined });
      if (k === 'branching') onChange({ goTo: undefined });
      if (k === 'crm') onChange({ mapTo: undefined });
    } else {
      next.add(k);
      if (k === 'condition' && p.candidates[0])
        onChange({ showIf: { questionId: p.candidates[0].id, op: 'answered' } });
    }
    setPanels(next);
  };

  const mark = (on: boolean, label: string) => (on ? `✓ ${label}` : label);
  const menu = [
    {
      label: mark(panels.has('description'), t('forms.question.description')),
      onClick: () => toggle('description'),
    },
    ...(validationKinds(q.type).length
      ? [
          {
            label: mark(panels.has('validation'), t('forms.question.validation')),
            onClick: () => toggle('validation'),
          },
        ]
      : []),
    {
      label: mark(panels.has('condition'), t('forms.question.showIf')),
      onClick: () => toggle('condition'),
    },
    ...(BRANCHING_TYPES.includes(q.type) && p.sectionCount > 1
      ? [
          {
            label: mark(panels.has('branching'), t('forms.question.branching')),
            onClick: () => toggle('branching'),
          },
        ]
      : []),
    ...(p.crm
      ? [
          {
            label: mark(panels.has('crm'), t('forms.question.saveToCrm')),
            onClick: () => toggle('crm'),
          },
        ]
      : []),
    ...(p.onMoveSection && p.sectionIndex > 0
      ? [
          {
            label: t('forms.question.movePrev'),
            icon: <ArrowUp size={14} />,
            onClick: () => p.onMoveSection!(-1),
            separatorBefore: true,
          },
        ]
      : []),
    ...(p.onMoveSection && p.sectionIndex < p.sectionCount - 1
      ? [
          {
            label: t('forms.question.moveNext'),
            icon: <ArrowDown size={14} />,
            onClick: () => p.onMoveSection!(1),
            separatorBefore: !(p.sectionIndex > 0),
          },
        ]
      : []),
  ];

  const tags = [
    q.showIf && t('forms.question.conditional'),
    q.goTo && Object.keys(q.goTo).length && t('forms.question.withJumps'),
    p.quiz && q.quiz?.points ? t('forms.question.points', { n: q.quiz.points }) : null,
    q.mapTo && `CRM: ${t(MAP_TARGET_LABEL[q.mapTo])}`,
  ].filter(Boolean) as string[];

  return (
    <Card
      className={cn(
        'transition-shadow',
        active ? 'border-l-4 border-l-accent shadow-md' : 'cursor-pointer hover:bg-bg-hover',
      )}
      bodyClassName="space-y-4"
    >
      {p.handleProps && !disabled && (
        <div className="flex justify-center -mt-2 -mb-2">
          <span
            {...p.handleProps}
            className={cn(p.handleProps.className, 'px-3 py-1 text-fg-subtle')}
          >
            <GripHorizontal size={16} />
          </span>
        </div>
      )}

      {!active ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={t('forms.question.editItem', {
            title: q.title || t('forms.question.untitled'),
          })}
          onClick={p.onActivate}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              p.onActivate();
            }
          }}
          className="space-y-3 outline-none"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-base font-medium text-fg-default">
              {q.title || <span className="text-fg-subtle">{t('forms.question.untitled')}</span>}
              {q.required && <span className="text-danger-fg"> *</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          {q.description && (
            <p className="text-sm text-fg-muted whitespace-pre-wrap">{q.description}</p>
          )}
          {/* La vista de la pregunta no se puede usar: solo enseña cómo se verá. */}
          <div className="pointer-events-none">
            <QuestionField question={q} answers={{}} onChange={() => {}} disabled />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            <div className="flex-1 min-w-0">
              <Textarea
                aria-label={t('forms.question.question')}
                rows={1}
                value={q.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder={t('forms.question.question')}
                autoFocus={!q.title}
                disabled={disabled}
              />
            </div>
            <div className="md:w-64 shrink-0">
              <Select
                ariaLabel={t('forms.question.type')}
                options={TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={q.type}
                onChange={(v) => p.onChangeType(v as QuestionType)}
                disabled={disabled}
              />
            </div>
          </div>
          {panels.has('description') && (
            <Input
              aria-label={t('forms.question.description')}
              value={q.description ?? ''}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              placeholder={t('forms.question.descriptionPlaceholder')}
              disabled={disabled}
            />
          )}

          {CHOICE_TYPES.includes(q.type) && (
            <OptionsEditor
              question={q}
              onChange={onChange}
              sections={p.sections}
              branching={panels.has('branching')}
              quiz={p.quiz}
              disabled={disabled}
            />
          )}
          {GRID_TYPES.includes(q.type) && (
            <GridSettings question={q} onChange={onChange} disabled={disabled} />
          )}
          {q.type === 'scale' && (
            <ScaleSettings question={q} onChange={onChange} disabled={disabled} />
          )}
          {q.type === 'rating' && (
            <RatingSettings question={q} onChange={onChange} disabled={disabled} />
          )}
          {q.type === 'file' && (
            <FileSettings question={q} onChange={onChange} disabled={disabled} />
          )}
          {!CHOICE_TYPES.includes(q.type) &&
            !GRID_TYPES.includes(q.type) &&
            !['scale', 'rating', 'file'].includes(q.type) && (
              <div className="pointer-events-none opacity-70">
                <QuestionField question={q} answers={{}} onChange={() => {}} disabled />
              </div>
            )}

          {panels.has('validation') && (
            <ValidationPanel question={q} onChange={onChange} disabled={disabled} />
          )}
          {panels.has('condition') && (
            <ConditionPanel
              question={q}
              onChange={onChange}
              candidates={p.candidates}
              disabled={disabled}
            />
          )}
          {p.quiz && <QuizPanel question={q} onChange={onChange} disabled={disabled} />}
          {panels.has('crm') && <CrmPanel question={q} onChange={onChange} disabled={disabled} />}

          <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border-subtle pt-3">
            <IconButton
              label={t('forms.question.duplicate')}
              onClick={p.onDuplicate}
              disabled={disabled}
            >
              <Copy size={16} />
            </IconButton>
            <IconButton label={t('forms.question.delete')} onClick={p.onRemove} disabled={disabled}>
              <Trash2 size={16} />
            </IconButton>
            <span className="mx-2 h-6 w-px bg-border-default" aria-hidden />
            <Switch
              label={t('forms.question.required')}
              checked={!!q.required}
              onChange={(v) => onChange({ required: v || undefined })}
              disabled={disabled}
            />
            <DropdownMenu
              items={menu}
              align="end"
              aria-label={t('forms.question.moreOptions')}
              disabled={disabled}
            >
              <span className={iconButtonClass}>
                <MoreVertical size={16} />
              </span>
            </DropdownMenu>
          </div>
        </>
      )}
    </Card>
  );
};
