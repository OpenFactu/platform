import React, { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  onScan?: (code: string) => void;
  className?: string;
  size?: number;
  'aria-label'?: string;
}

/**
 * Botón icono que abre el modal de cámara para escanear un código.
 * Si se pasa `onScan`, recibe el código directamente; si no, el código se
 * despacha al handler activo del `ScannerContext`.
 */
export const BarcodeScanButton: React.FC<Props> = ({
  onScan,
  className = '',
  size = 16,
  'aria-label': ariaLabelProp,
}) => {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const ariaLabel = ariaLabelProp ?? t('app.bottomNav.scan');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={
          'inline-flex items-center justify-center p-2 rounded-xs text-ink-500 dark:text-ink-400 hover:text-accent dark:hover:text-accent hover:bg-line-2 dark:hover:bg-ink-700 transition-colors ' +
          className
        }
      >
        <ScanLine size={size} />
      </button>
      <BarcodeCameraModal open={open} onClose={() => setOpen(false)} onScan={onScan} />
    </>
  );
};
