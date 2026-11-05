import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { logisticsApi } from '../api';
import type { AppReport } from '../domain/appReport';

/** Lo que han contado sobre la aplicación, abiertos primero a la vista. */
export function useAppReports() {
  const { t } = useI18n();
  const toast = useToast();
  const [reports, setReports] = useState<AppReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [opened, setOpened] = useState<AppReport | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await logisticsApi.appReports();
      setReports(Array.isArray(rows) ? rows : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (onlyOpen ? reports.filter((report) => report.status === 'open') : reports),
    [onlyOpen, reports],
  );

  const open = async (report: AppReport) => {
    setOpened(report);
    if (!report.hasPhoto) return;
    try {
      setOpened(await logisticsApi.appReport(report.id));
    } catch {
      toast.error(t('logistics.common.error'));
    }
  };

  const setStatus = async (id: string, status: 'open' | 'resolved') => {
    try {
      await logisticsApi.setAppReportStatus(id, status);
      setOpened(null);
      await load();
    } catch {
      toast.error(t('logistics.common.error'));
    }
  };

  return {
    visible,
    loading,
    onlyOpen,
    setOnlyOpen,
    opened,
    open,
    close: () => setOpened(null),
    setStatus,
  };
}
