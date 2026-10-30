import React from 'react';
import { Progress, cn } from '@openfactu/ui';
import { WorkLoader } from './loaders/WorkLoader';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Mientras carga una pantalla: una barra fina arriba y, en el centro, una de
 * las escenas animadas de WorkLoader (camión, carretilla, cajas, factura),
 * que se van alternando. Los dos desde el primer momento.
 *
 * `fullScreen`: para el Suspense de toda la app (App.tsx), que no tiene layout
 * alrededor; ocupa la vista con el fondo del tema. `label` va encima de la escena
 * (el arranque pone el nombre de la empresa).
 */
export const PageLoading = ({
  fullScreen = false,
  label,
}: {
  fullScreen?: boolean;
  label?: React.ReactNode;
}) => {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-label={t('app.common.loadingShort')}
      className={cn(
        'flex flex-col items-center justify-center bg-bg-app',
        fullScreen ? 'fixed inset-0 z-50' : 'relative h-full min-h-48 w-full flex-1',
      )}
    >
      <Progress indeterminate size="sm" className="absolute inset-x-0 top-0 rounded-none" />
      <div className="flex flex-col items-center gap-3">
        {label && <p className="text-sm font-semibold text-fg-default">{label}</p>}
        <WorkLoader />
        <p className="text-xs text-fg-muted">{t('app.common.loading')}</p>
      </div>
    </div>
  );
};
