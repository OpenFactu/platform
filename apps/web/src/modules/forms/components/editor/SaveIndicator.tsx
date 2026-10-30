import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { Button } from '@openfactu/ui';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { SaveStatus } from '../../hooks/useFormEditor';

/** «Guardando… / Guardado / No se pudo guardar · Reintentar», en lugar de un botón de guardar. */
export const SaveIndicator: React.FC<{
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
}> = ({ status, error, onRetry }) => {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-fg-muted"
      role="status"
      aria-live="polite"
    >
      {status === 'saving' && (
        <>
          <Loader2 size={12} className="animate-spin" /> {t('forms.save.saving')}
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={12} /> {t('forms.save.saved')}
        </>
      )}
      {status === 'idle' && t('forms.save.auto')}
      {status === 'error' && (
        <span className="inline-flex items-center gap-1.5 text-danger-fg">
          <AlertTriangle size={12} /> {error ?? t('forms.errors.saveFailed')}
          <Button type="button" variant="link" size="sm" onClick={onRetry}>
            {t('forms.save.retry')}
          </Button>
        </span>
      )}
    </span>
  );
};
