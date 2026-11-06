/** «Termina en tu navegador»: el código de confirmación en grande y la espera. */
import React from 'react';
import { Button, Spinner } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  confirmCode: string | null;
  /** Qué hacer en el otro dispositivo. */
  description: React.ReactNode;
  onCancel: () => void;
  /** Debajo de la espera: por ejemplo «Reenviar». */
  children?: React.ReactNode;
}

export const LoginHandoffWait: React.FC<Props> = ({
  confirmCode,
  description,
  onCancel,
  children,
}) => {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold tracking-tight text-fg-default">
        {t('auth.handoff.title')}
      </h2>
      <p className="text-sm text-fg-muted">{description}</p>

      <div className="rounded-[var(--k-radius-md)] border border-border-default bg-bg-muted p-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {t('auth.handoff.confirmCode')}
        </p>
        <p
          className="mt-1 break-all font-mono text-3xl font-bold tracking-widest text-fg-default sm:text-4xl"
          aria-live="polite"
        >
          {confirmCode ?? '…'}
        </p>
        <p className="mt-2 text-xs text-fg-subtle">{t('auth.handoff.confirmHint')}</p>
      </div>

      <div className="flex items-center gap-2 text-sm text-fg-muted" role="status">
        <Spinner size="sm" label={t('auth.handoff.waiting')} />
        <span>{t('auth.handoff.waiting')}</span>
      </div>

      {children}

      <Button type="button" variant="link" size="sm" className="px-0" onClick={onCancel}>
        {t('auth.handoff.cancel')}
      </Button>
    </div>
  );
};
