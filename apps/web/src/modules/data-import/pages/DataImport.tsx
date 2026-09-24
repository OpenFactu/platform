/**
 * Importador de datos — el asistente completo.
 *
 * Este fichero solo compone: el estado vive en `useImportWizard`, las reglas
 * del mapeo en `lib/mappingChecks` y cada paso en su componente.
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, PageHeader, Tabs } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, Check, Upload } from 'lucide-react';
import {
  STEP_LABELS,
  STEP_ORDER,
  useImportWizard,
  type WizardStep,
} from '../hooks/useImportWizard';
import { StepObject } from '../components/StepObject';
import { StepFile } from '../components/StepFile';
import { StepMapping } from '../components/StepMapping';
import { StepMode } from '../components/StepMode';
import { StepRun } from '../components/StepRun';
import { JobHistory } from '../components/JobHistory';

export const DataImport: React.FC = () => {
  const wizard = useImportWizard();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'wizard' | 'history'>('wizard');

  /**
   * El trabajo abierto vive en la URL, no en un estado propio: así el enlace
   * "Ver informe" del aviso de progreso funciona tal cual, y no hace falta
   * sincronizar nada con un efecto. Mientras haya `?job=`, el asistente se
   * planta en el último paso, que es el informe.
   */
  const jobId = params.get('job');
  const step = jobId ? 'run' : wizard.step;

  const openJob = (id: string) => {
    setParams({ job: id });
    setTab('wizard');
  };

  const launch = async (dryRun: boolean) => {
    const id = await wizard.launch(dryRun);
    if (id) setParams({ job: id });
  };

  const restart = () => {
    setParams({});
    wizard.restart();
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title="Importación de datos"
        subtitle="Sube un Excel o un CSV y cárgalo en Keirost pasando por las mismas validaciones que si lo teclearas."
        icon={<Upload size={18} />}
        size="md"
        divider
      />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as 'wizard' | 'history')}
        items={[
          { key: 'wizard', label: 'Asistente' },
          { key: 'history', label: 'Histórico' },
        ]}
      />

      {tab === 'history' ? (
        <JobHistory objects={wizard.objects} onOpen={openJob} />
      ) : (
        <>
          <Stepper
            current={step}
            object={!!wizard.object}
            onGoTo={(next) => {
              // Salir del informe vuelve a dejar el asistente al mando.
              if (jobId) setParams({});
              wizard.goTo(next);
            }}
          />
          <StepBody
            wizard={wizard}
            step={step}
            jobId={jobId}
            onLaunch={launch}
            onRestart={restart}
          />
          <WizardFooter wizard={wizard} step={step} />
        </>
      )}
    </div>
  );
};

// ── Piezas de composición ───────────────────────────────────────────────────

const Stepper: React.FC<{
  current: WizardStep;
  object: boolean;
  onGoTo: (step: WizardStep) => void;
}> = ({ current, object, onGoTo }) => {
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEP_ORDER.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        // No se salta al futuro: cada paso necesita lo del anterior.
        const reachable = i <= currentIndex && (i === 0 || object);

        return (
          <React.Fragment key={step}>
            {i > 0 && <div className="h-px w-4 bg-border-default shrink-0" />}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onGoTo(step)}
              className={[
                'flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-primary text-primary-fg'
                  : done
                    ? 'text-fg-body hover:bg-bg-hover'
                    : 'text-fg-subtle',
                reachable && !active ? 'cursor-pointer' : '',
                !reachable ? 'cursor-default' : '',
              ].join(' ')}
            >
              {/* El paso hecho va con fondo claro y el tick en verde, no al
                  revés: `success-fg` es el verde OSCURO de texto, y sobre un
                  relleno `bg-success` el icono no se ve. El preset no expone
                  ningún token de contraste sobre estado (`--k-success-on`
                  existe en el tema pero no como utilidad de Tailwind). */}
              <span
                className={[
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  active
                    ? 'bg-primary-fg/20'
                    : done
                      ? 'bg-success-bg text-success ring-1 ring-success/40'
                      : 'bg-bg-muted text-fg-subtle',
                ].join(' ')}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              {STEP_LABELS[step]}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const StepBody: React.FC<{
  wizard: ReturnType<typeof useImportWizard>;
  step: WizardStep;
  jobId: string | null;
  onLaunch: (dryRun: boolean) => void;
  onRestart: () => void;
}> = ({ wizard, step, jobId, onLaunch, onRestart }) => {
  if (step === 'object') {
    return (
      <StepObject
        objects={wizard.objects}
        loading={wizard.loadingObjects}
        selected={wizard.object}
        onSelect={wizard.chooseObject}
      />
    );
  }

  if (!wizard.object) return null;

  if (step === 'file') {
    return (
      <StepFile
        object={wizard.object}
        upload={wizard.upload}
        uploading={wizard.uploading}
        sheet={wizard.sheet}
        linesSheet={wizard.linesSheet}
        onUpload={wizard.uploadFile}
        onChooseSheet={wizard.chooseSheet}
        onChooseLinesSheet={wizard.chooseLinesSheet}
        onDownloadTemplate={wizard.downloadTemplate}
      />
    );
  }

  if (step === 'run') {
    return (
      <StepRun
        object={wizard.object}
        jobId={jobId}
        launching={wizard.launching}
        onLaunch={onLaunch}
        onRestart={onRestart}
      />
    );
  }

  if (!wizard.sheet) {
    return (
      <Card>
        <div className="p-6 text-sm text-fg-muted">
          Vuelve al paso del fichero: no hay ninguno cargado.
        </div>
      </Card>
    );
  }

  if (step === 'mapping') {
    return (
      <StepMapping
        object={wizard.object}
        sheet={wizard.sheet}
        linesSheet={wizard.linesSheet}
        mapping={wizard.mapping}
        issues={wizard.issues}
        savedMappings={wizard.savedMappings}
        onSetColumn={wizard.setColumnField}
        onReset={wizard.resetMapping}
        onClear={wizard.clearMapping}
        onApplySaved={wizard.applySavedMapping}
        onSaveMapping={wizard.saveMapping}
        onDeleteMapping={wizard.deleteMapping}
      />
    );
  }

  return (
    <StepMode
      object={wizard.object}
      sheet={wizard.sheet}
      mapping={wizard.mapping}
      mode={wizard.mode}
      matchBy={wizard.matchBy}
      onModeChange={wizard.setMode}
      onMatchByChange={wizard.setMatchBy}
    />
  );
};

const WizardFooter: React.FC<{
  wizard: ReturnType<typeof useImportWizard>;
  step: WizardStep;
}> = ({ wizard, step }) => {
  if (step === 'run') return null;

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <Button
        variant="outline"
        onClick={wizard.goBack}
        disabled={step === 'object'}
        className="gap-1.5"
      >
        <ArrowLeft size={15} /> Atrás
      </Button>
      <Button onClick={wizard.goNext} disabled={!wizard.canContinue} className="gap-1.5">
        {step === 'mode' ? 'Simular e importar' : 'Continuar'}
        <ArrowRight size={15} />
      </Button>
    </div>
  );
};

export default DataImport;
