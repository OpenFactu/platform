import { useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { parsePackageQr } from '../domain/packageQr';

/**
 * Escanear bultos uno tras otro: la cámara sigue abierta hasta que se cierra. Un bulto
 * que no toca se avisa con vibración larga, para notarlo sin mirar la pantalla.
 */
export function usePackageScanner<T extends { id: string; code: string }>(
  packages: T[],
  alreadyDone: (pkg: T) => boolean,
  onMatch: (pkg: T) => void,
) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const handle = (raw: string) => {
    const id = parsePackageQr(raw);
    const pkg = packages.find((candidate) => candidate.id === id);
    if (!pkg) {
      navigator.vibrate?.(300);
      toast.error(t(id ? 'logistics.driver.loadOut.notHere' : 'logistics.driver.qrUnrecognized'));
      return;
    }
    if (alreadyDone(pkg)) return;
    navigator.vibrate?.(60);
    toast.success(pkg.code);
    onMatch(pkg);
  };

  return { open, start: () => setOpen(true), stop: () => setOpen(false), handle };
}
