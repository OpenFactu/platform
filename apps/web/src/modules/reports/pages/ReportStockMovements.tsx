import React, { useEffect, useMemo, useState } from 'react';
import { DatePicker } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportStockMovements: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    const qs = new URLSearchParams();
    if (from) qs.append('from', from);
    if (to) qs.append('to', to);
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/stock-movements?${qs}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'date', label: t('reports.common.date'), format: (v: any) => fmt.date(v) },
      { key: 'type', label: t('reports.common.type') },
      { key: 'itemCode', label: t('reports.common.code') },
      { key: 'itemName', label: t('reports.common.item') },
      { key: 'qty', label: t('reports.stockMovements.quantity'), format: (v: any) => String(v) },
      { key: 'partnerName', label: t('reports.stockMovements.partner') },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.stockMovements.title')}
      subtitle={t('reports.stockMovements.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="movimientos-stock"
      filters={
        <div className="flex items-end gap-3 flex-wrap">
          {/* El estado guarda '' como «sin filtro»; DatePicker habla en null. */}
          <DatePicker
            label={t('reports.common.from')}
            value={from || null}
            onChange={(v) => setFrom(v ?? '')}
            clearable
          />
          <DatePicker
            label={t('reports.common.to')}
            value={to || null}
            onChange={(v) => setTo(v ?? '')}
            clearable
          />
        </div>
      }
    />
  );
};

export default ReportStockMovements;
