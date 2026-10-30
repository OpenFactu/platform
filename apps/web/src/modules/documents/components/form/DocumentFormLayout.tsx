import React, { useRef, useState } from 'react';
import { Badge, Button, Card, PageHeader, Stepper, useToast } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import type { FormStepDef, FormStepId, FormStepProblem } from '../../domain/formSteps';

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Texto del botón de registrar («Asentar factura», «Registrar albarán»…). */
  submitLabel: string;
  onSubmit: () => void;
  isSubmitting?: boolean;
  /** false si el usuario no puede escribir o la serie tiene un error. */
  canSubmit?: boolean;
  steps: FormStepDef[];
  status: { complete: Record<FormStepId, boolean>; problem: FormStepProblem | null };
  /** Al registrar con algo pendiente, además del aviso (p. ej. abrir los lotes). */
  onProblem?: (problem: FormStepProblem) => void;
  /** Contenido de cada paso salvo «Revisar», que lo pone el layout. */
  sections: Partial<Record<Exclude<FormStepId, 'review'>, React.ReactNode>>;
  /** Totales completos, para el paso «Revisar». */
  totals: React.ReactNode;
  /** Totales en pequeño, para el resumen fijo del lateral en escritorio. */
  summary?: React.ReactNode;
  /**
   * «Cancelar» junto a registrar. Solo para formularios que no viven en su
   * propia pestaña (el genérico vuelve al listado en la misma vista).
   */
  onCancel?: () => void;
}

/**
 * Esqueleto común del alta de documentos (los 8 tipos).
 *
 * Escritorio: una sola página con las secciones numeradas y un `Stepper` que
 * marca lo completado y lleva a cada una; a la derecha, el resumen con el
 * total y el botón de registrar, siempre a la vista.
 * Móvil: asistente, un paso por pantalla con Anterior / Siguiente.
 *
 * Al registrar, si falta algo, salta al primer paso con problema y lo avisa.
 */
export const DocumentFormLayout: React.FC<Props> = ({
  title,
  subtitle,
  submitLabel,
  onSubmit,
  isSubmitting,
  canSubmit = true,
  steps,
  status,
  onProblem,
  sections,
  totals,
  summary,
  onCancel,
}) => {
  const { t } = useI18n();
  const mobile = useIsMobile();
  const toast = useToast();
  const refs = useRef<Partial<Record<FormStepId, HTMLElement | null>>>({});
  const [mobileStep, setMobileStep] = useState(0);

  // En escritorio el paso «actual» es el primero sin completar.
  const firstOpen = steps.findIndex((s) => !s.optional && !status.complete[s.id]);
  const current = firstOpen === -1 ? steps.length - 1 : firstOpen;

  const goTo = (id: FormStepId) => {
    if (mobile) {
      setMobileStep(
        Math.max(
          0,
          steps.findIndex((s) => s.id === id),
        ),
      );
      window.scrollTo({ top: 0 });
    } else {
      refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const submit = () => {
    const { problem } = status;
    if (problem) {
      toast.error(problem.message);
      goTo(problem.step);
      onProblem?.(problem);
      return;
    }
    onSubmit();
  };

  const submitButton = (className?: string) => (
    <Button
      type="button"
      onClick={submit}
      isLoading={isSubmitting}
      disabled={!canSubmit}
      className={className}
    >
      <Save size={16} /> {submitLabel}
    </Button>
  );

  const content = (id: FormStepId) => (id === 'review' ? totals : sections[id]);

  // Sin «Volver»: la pestaña ya se cierra desde la barra de pestañas.
  const header = (
    <PageHeader
      title={title}
      subtitle={subtitle}
      size={mobile ? 'md' : 'lg'}
      divider
      // En móvil registrar va en la barra de pasos.
      actions={
        mobile ? undefined : (
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                {t('doc.common.cancel')}
              </Button>
            )}
            {submitButton()}
          </div>
        )
      }
    />
  );

  if (mobile) {
    const step = steps[mobileStep];
    const last = mobileStep === steps.length - 1;
    const next = () => {
      // Solo se frena en los pasos que tienen requisitos propios.
      if (status.problem && status.problem.step === step.id) {
        toast.error(status.problem.message);
        onProblem?.(status.problem);
        return;
      }
      setMobileStep(mobileStep + 1);
      window.scrollTo({ top: 0 });
    };
    return (
      <div className="p-4 pb-40 space-y-5">
        {onCancel && (
          <div className="-mb-3 -ml-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t('doc.common.cancel')}
            </Button>
          </div>
        )}
        {header}
        <Stepper
          size="sm"
          aria-label={t('doc.form.steps')}
          current={mobileStep}
          steps={steps.map((s) => ({ id: s.id, label: s.label }))}
          onStepClick={(_, i) => setMobileStep(i)}
        />
        <Card
          noPadding={step.id === 'lines'}
          title={step.label}
          headerAction={
            step.optional ? <Badge variant="neutral">{t('doc.form.optional')}</Badge> : undefined
          }
        >
          {content(step.id)}
        </Card>
        {/* Barra de pasos por encima de la navegación inferior (80px). A la
            derecha deja sitio al botón flotante de acciones (56px + 20px de
            margen, MobileBottomNav), que si no quedaba encima de «Siguiente». */}
        <div className="fixed inset-x-0 z-30 flex gap-2 border-t border-border-default bg-bg-card pl-4 pr-[5.5rem] py-3 bottom-[calc(80px+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMobileStep(Math.max(0, mobileStep - 1))}
            disabled={mobileStep === 0}
            className="flex-1"
          >
            <ArrowLeft size={16} /> {t('doc.form.previous')}
          </Button>
          {last ? (
            submitButton('flex-1')
          ) : (
            <Button type="button" onClick={next} className="flex-1">
              {t('doc.form.next')} <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // pb-24: que el lanzador del asistente (abajo a la derecha) no tape el
  // final de la última sección.
  return (
    <div className="p-4 pb-24 space-y-6">
      {header}
      <Stepper
        aria-label={t('doc.form.steps')}
        current={current}
        allowForward
        steps={steps.map((s) => ({ id: s.id, label: s.label }))}
        onStepClick={(s) => goTo(s.id as FormStepId)}
      />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {steps.map((s, i) => (
            <section
              key={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              className="scroll-mt-4"
            >
              <Card
                // Las líneas son una tabla a sangre: sin relleno.
                noPadding={s.id === 'lines'}
                title={`${i + 1}. ${s.label}`}
                headerAction={
                  s.optional ? <Badge variant="neutral">{t('doc.form.optional')}</Badge> : undefined
                }
              >
                {content(s.id)}
              </Card>
            </section>
          ))}
        </div>
        {/* Resumen fijo: el total y registrar siempre a mano. */}
        <aside className="xl:sticky xl:top-4 space-y-3">
          <Card title={t('doc.form.summary')}>
            <div className="space-y-4">
              {summary ?? totals}
              {submitButton('w-full justify-center')}
              {status.problem && (
                <p className="text-xs text-fg-muted">
                  {t('doc.form.missing', { message: status.problem.message })}
                </p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};
