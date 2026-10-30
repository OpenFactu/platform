import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Button, Card, Input, Progress } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import {
  isQuestion,
  type Answers,
  type FormDefinition,
  type Item,
  type TitleEffect,
} from '@forms-engine';
import { useFormRunner } from '../../hooks/useFormRunner';
import { QuestionField, type UploadedFile } from './QuestionField';
import { EffectTitle } from './EffectTitle';
import { RichText } from './RichText';
import { TextBlockView } from './TextBlockView';

export interface RunnerSettings {
  submitLabel?: string | null;
  collectEmail: 'none' | 'optional' | 'required';
  showProgress: boolean;
  shuffleQuestions: boolean;
}

interface Props {
  title: string;
  /** Efecto del título del formulario (tema). */
  titleEffect?: TitleEffect;
  intro?: string | null;
  definition: FormDefinition;
  settings: RunnerSettings;
  headerImageUrl?: string | null;
  assetUrl: (assetId: string) => string;
  initialAnswers?: Answers;
  initialEmail?: string | null;
  /** Correo ya conocido (invitación): no se pide. */
  hideEmail?: boolean;
  upload?: (questionId: string, file: File) => Promise<UploadedFile>;
  /**
   * Envía. Si devuelve errores por pregunta (los del servidor), se pintan.
   * Sin `onSubmit` es la vista previa: recorre el formulario pero no envía.
   */
  onSubmit?: (
    answers: Answers,
    email: string | null,
  ) => Promise<{ errors?: Record<string, string> } | void>;
  submitting?: boolean;
  submitError?: string | null;
}

/** Bloque de una pregunta: título, ayuda y su control, en su propia tarjeta. */
const ItemBlock: React.FC<{
  item: Item;
  runner: ReturnType<typeof useFormRunner>;
  assetUrl: (id: string) => string;
  upload?: Props['upload'];
  disabled?: boolean;
}> = ({ item, runner, assetUrl, upload, disabled }) => {
  const { t } = useI18n();
  if (item.kind === 'text') return <TextBlockView block={item} />;
  if (item.kind === 'image')
    return (
      <Card>
        {item.assetId && (
          <img
            src={assetUrl(item.assetId)}
            alt={item.caption ?? ''}
            className="w-full rounded-xs"
          />
        )}
        {item.caption && <p className="text-sm text-fg-muted mt-2">{item.caption}</p>}
      </Card>
    );
  if (!isQuestion(item)) return null;
  const error = runner.errors[item.id];
  return (
    <Card className={error ? 'border-danger-fg' : undefined}>
      <fieldset className="space-y-3">
        <legend className="text-base font-medium text-fg-default">
          {item.title || t('forms.question.question')}
          {item.required && <span className="text-danger-fg"> *</span>}
        </legend>
        {item.description && <RichText text={item.description} variant="muted" className="-mt-1" />}
        <QuestionField
          question={item}
          answers={runner.answers}
          onChange={runner.set}
          error={error}
          disabled={disabled}
          upload={upload}
        />
      </fieldset>
    </Card>
  );
};

/**
 * Un formulario para rellenar, sección a sección. Lo usan la vista previa del
 * editor y la página pública: misma pinta y misma lógica.
 */
export const FormRunner: React.FC<Props> = ({
  title,
  titleEffect,
  intro,
  definition,
  settings,
  headerImageUrl,
  assetUrl,
  initialAnswers,
  initialEmail,
  hideEmail,
  upload,
  onSubmit,
  submitting,
  submitError,
}) => {
  const { t } = useI18n();
  const runner = useFormRunner(definition, {
    initial: initialAnswers,
    shuffleQuestions: settings.shuffleQuestions,
  });
  const [email, setEmail] = useState(initialEmail ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [previewDone, setPreviewDone] = useState(false);
  const askEmail = settings.collectEmail !== 'none' && !hideEmail && runner.isFirst;

  const next = async () => {
    if (runner.isFirst && settings.collectEmail === 'required' && !hideEmail && !email.trim()) {
      setEmailError(t('forms.runner.emailRequired'));
      return;
    }
    setEmailError(null);
    if (!runner.goNext()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!onSubmit) {
      setPreviewDone(true);
      return;
    }
    const res = await onSubmit(runner.answers, email.trim() || null);
    if (res && res.errors) {
      if (res.errors.__email) setEmailError(res.errors.__email);
      runner.setErrors(res.errors);
    }
  };

  if (previewDone)
    return (
      <Card>
        <p className="text-base text-fg-default">{t('forms.runner.previewEnd')}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => {
            runner.reset();
            setPreviewDone(false);
          }}
        >
          {t('forms.runner.startOver')}
        </Button>
      </Card>
    );

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <Card noPadding className="overflow-hidden">
        {headerImageUrl && (
          <img src={headerImageUrl} alt="" className="w-full max-h-56 object-cover" />
        )}
        <div className="h-2 bg-accent" />
        <div className="p-5 space-y-2">
          <EffectTitle
            as="h1"
            text={title}
            effect={titleEffect}
            className="text-2xl font-bold text-fg-default"
          />
          {intro && runner.isFirst && <RichText text={intro} variant="muted" />}
          <p className="text-xs text-danger-fg">{t('forms.runner.requiredNote')}</p>
        </div>
      </Card>

      {settings.showProgress && runner.sectionCount > 1 && (
        <div className="space-y-1">
          <Progress value={runner.progress} label={t('forms.runner.progress')} size="sm" />
          <p className="text-xs text-fg-muted">
            {t('forms.blocks.sectionOf', { n: runner.sectionNumber, count: runner.sectionCount })}
          </p>
        </div>
      )}

      {(runner.section.title || runner.section.description) && (
        <Card>
          {runner.section.title && (
            <EffectTitle
              as="h2"
              text={runner.section.title}
              effect={runner.section.titleEffect}
              className="text-lg font-semibold text-fg-default"
            />
          )}
          {runner.section.description && (
            <RichText text={runner.section.description} variant="muted" className="mt-1" />
          )}
        </Card>
      )}

      {askEmail && (
        <Card>
          <Input
            label={
              settings.collectEmail === 'required'
                ? t('forms.runner.emailRequiredLabel')
                : t('forms.runner.emailOptionalLabel')
            }
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError ?? undefined}
            autoComplete="email"
          />
        </Card>
      )}

      {runner.items.map((item) => (
        <ItemBlock
          key={item.id}
          item={item}
          runner={runner}
          assetUrl={assetUrl}
          upload={upload}
          disabled={submitting}
        />
      ))}

      {submitError && <p className="text-sm text-danger-fg">{submitError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!runner.isFirst ? (
          <Button type="button" variant="secondary" onClick={runner.goBack} disabled={submitting}>
            <ArrowLeft size={14} /> {t('forms.runner.back')}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" isLoading={submitting}>
          {runner.isLast ? (
            <>
              <Send size={14} /> {settings.submitLabel || t('forms.runner.submit')}
            </>
          ) : (
            <>
              {t('forms.runner.next')} <ArrowRight size={14} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};
