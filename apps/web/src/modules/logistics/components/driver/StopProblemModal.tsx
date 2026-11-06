import React, { useState } from 'react';
import { Button, Textarea } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { ReasonKind, StopReason } from '../../domain/deliveryFlow';
import { OTHER_PROBLEM, enabledProblems, problemReady } from '../../domain/stopProblems';
import { DriverModal } from './DriverModal';

interface Props {
  reasons: StopReason[];
  subtitle?: string;
  /** Motivo ya elegido al abrir, si se llega desde el asistente. */
  preset: string | null;
  onClose: () => void;
  onConfirm: (kind: ReasonKind, reason: string) => Promise<boolean>;
}

/**
 * Por qué no se ha podido entregar: se elige con el dedo, sin escribir, entre los motivos
 * de la empresa. Se monta al abrirse, así cada vez empieza de cero.
 */
export const StopProblemModal: React.FC<Props> = ({
  reasons,
  subtitle,
  preset,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const problems = enabledProblems(reasons);
  const [selected, setSelected] = useState<string | null>(
    problems.some((problem) => problem.id === preset) ? preset : null,
  );
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const labelOf = (problem: StopReason) =>
    problem.label ?? t(`logistics.driver.problems.${problem.id}`);

  const confirm = async () => {
    const problem = problems.find((p) => p.id === selected);
    if (!problem) return;
    setSending(true);
    try {
      const reason = problem.id === OTHER_PROBLEM ? text.trim() : labelOf(problem);
      if (await onConfirm(problem.kind, reason)) onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <DriverModal
      isOpen
      onClose={onClose}
      title={t('logistics.driver.problems.title')}
      subtitle={subtitle}
      footer={
        <div className="flex w-full gap-2">
          <Button size="lg" variant="secondary" onClick={onClose}>
            {t('logistics.common.cancel')}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!problemReady(selected, text) || sending}
            onClick={confirm}
          >
            {t('logistics.driver.problems.confirm')}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 py-1">
        {problems.map((problem) => (
          <Button
            key={problem.id}
            size="lg"
            variant={selected === problem.id ? 'primary' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSelected(problem.id)}
          >
            {labelOf(problem)}
          </Button>
        ))}
        {selected === OTHER_PROBLEM && (
          <Textarea
            autoFocus
            rows={3}
            aria-label={t('logistics.driver.problems.other')}
            placeholder={t('logistics.driver.problems.otherPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </div>
    </DriverModal>
  );
};
