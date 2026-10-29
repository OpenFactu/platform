import React from 'react';
import { Button } from '@openfactu/ui';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { SaveStatus } from '../../hooks/useFormEditor';

/** «Guardando… / Guardado / No se pudo guardar · Reintentar», en lugar de un botón de guardar. */
export const SaveIndicator: React.FC<{
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
}> = ({ status, error, onRetry }) => (
  <span
    className="inline-flex items-center gap-1.5 text-xs text-fg-muted"
    role="status"
    aria-live="polite"
  >
    {status === 'saving' && (
      <>
        <Loader2 size={12} className="animate-spin" /> Guardando…
      </>
    )}
    {status === 'saved' && (
      <>
        <Check size={12} /> Cambios guardados
      </>
    )}
    {status === 'idle' && 'Los cambios se guardan solos'}
    {status === 'error' && (
      <span className="inline-flex items-center gap-1.5 text-danger-fg">
        <AlertTriangle size={12} /> {error ?? 'No se pudo guardar'}
        <Button type="button" variant="link" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </span>
    )}
  </span>
);
