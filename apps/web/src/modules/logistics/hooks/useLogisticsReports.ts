import { useEffect, useState } from 'react';
import type { DateRange } from '@openfactu/ui';
import { logisticsApi } from '../api';
import type { LogisticsSummary } from '../domain/reports';

const lastDays = (days: number): DateRange => {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  return { start: from.toISOString().slice(0, 10), end: to.toISOString().slice(0, 10) };
};

/** Los informes del reparto de unas fechas. Por defecto, los últimos 30 días. */
export function useLogisticsReports() {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [summary, setSummary] = useState<LogisticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailed(false);
    logisticsApi
      .reportSummary({ from: range.start || undefined, to: range.end || undefined })
      .then((data) => {
        if (current) setSummary(data);
      })
      .catch(() => {
        if (current) setFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [range.start, range.end]);

  return { range, setRange, summary, loading, failed };
}
