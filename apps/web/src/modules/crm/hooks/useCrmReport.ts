import { t } from '@/i18n/i18n';
import { useEffect, useState } from 'react';
import type { CrmPeriod } from '../api/reportsApi';

/** Carga un informe del CRM para el periodo y lo vuelve a pedir si cambia. */
export function useCrmReport<T>(load: (p: CrmPeriod) => Promise<T>, period: CrmPeriod) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  });
  const key = `${period.from}|${period.to}`;

  useEffect(() => {
    let cancelled = false;
    load(period)
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch(
        (err) =>
          !cancelled &&
          setState({
            key,
            data: null,
            error: err instanceof Error ? err.message : t('crm.errors.loadFailed'),
          }),
      );
    return () => {
      cancelled = true;
    };
    // `load` es estable (función del API); lo que manda es el periodo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    data: state.key === key ? state.data : null,
    loading: state.key !== key,
    error: state.error,
  };
}

/** Periodo de los últimos `months` meses hasta hoy, en yyyy-mm-dd. */
export function lastMonths(months: number, now = new Date()): CrmPeriod {
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}
