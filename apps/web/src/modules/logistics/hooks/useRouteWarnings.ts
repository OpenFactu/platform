import { useCallback } from 'react';
import { useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { RouteWarning } from '../domain/route';

/** Enseña lo que no impide planificar, pero quien lo hace tiene que saber. */
export function useRouteWarnings() {
  const toast = useToast();
  const { t } = useI18n();
  return useCallback(
    (warnings?: RouteWarning[]) => {
      for (const warning of warnings || []) {
        toast.warning(
          warning.kind === 'over_capacity'
            ? t('logistics.routes.overCapacity', {
                load: warning.loadKg,
                capacity: warning.capacityKg,
              })
            : t('logistics.routes.driverBusy', { routes: warning.routes.join(', ') }),
        );
      }
    },
    [t, toast],
  );
}
