import { useGoBack } from '@/hooks/useGoBack';
import { PageBack } from '@/components/common/PageBack';
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, DatePicker, PageHeader, Table } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ArrowLeft, Download, RefreshCw, Receipt } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useFormat } from '@/hooks/useFormat';
import { reportsApi } from '../api';

interface PluginReportColumn {
  key: string;
  label: string;
  format?: 'date' | 'money' | 'percent' | 'integer' | 'text';
  align?: 'left' | 'right' | 'center';
}

interface PluginReportSection {
  title?: string;
  columns: PluginReportColumn[];
  rows: Array<Record<string, unknown>>;
  totals?: { label: string; values: Record<string, number> };
}

interface PluginReportData {
  title: string;
  subtitle?: string;
  sections: PluginReportSection[];
}

/** Página genérica de los informes legales que aportan los plugins. */
export const ReportPlugin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const fmt = useFormat();
  const goBack = useGoBack();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<PluginReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const query = useCallback(() => {
    const qs = new URLSearchParams();
    if (from) qs.append('from', from);
    if (to) qs.append('to', to);
    return qs.toString();
  }, [from, to]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reportsApi
      .get<PluginReportData>(`/api/reports/plugin/${id}?${query()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, query]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const display = (value: unknown, format?: PluginReportColumn['format']) => {
    if (value === null || value === undefined) return '';
    if (format === 'money') return fmt.money(Number(value));
    if (format === 'date') return fmt.date(String(value));
    return String(value);
  };

  const columnsOf = (section: PluginReportSection): TableColumn<Record<string, unknown>>[] =>
    section.columns.map((col) => ({
      header: col.label,
      cell: (row) => display(row[col.key], col.format),
      align: col.align === 'center' ? undefined : col.align,
      sortable: true,
      sortAccessor: (row) => row[col.key] as string | number,
    }));

  return (
    <div className="p-6 w-full space-y-5">
      <PageHeader
        title={data?.title ?? ''}
        subtitle={data?.subtitle}
        icon={<Receipt size={18} />}
        size="md"
        breadcrumbs={
          <PageBack onBack={goBack}>
            <Button type="button" variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft size={12} className="mr-1" /> {t('reports.common.back')}
            </Button>
          </PageBack>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} /> {t('reports.common.refresh')}
            </Button>
            <Button
              type="button"
              onClick={() =>
                reportsApi.openPdf(`/api/reports/plugin/${id}/pdf?${query()}`, `${id}.pdf`)
              }
              className="flex items-center gap-2"
            >
              <Download size={16} /> PDF
            </Button>
          </div>
        }
      />

      <Card className="p-4 flex items-end gap-3 flex-wrap">
        <DatePicker
          label={t('reports.common.from')}
          value={from}
          onChange={(v) => setFrom(v ?? '')}
          clearable
        />
        <DatePicker
          label={t('reports.common.to')}
          value={to}
          onChange={(v) => setTo(v ?? '')}
          clearable
        />
      </Card>

      {error ? (
        <Card className="p-10 text-center text-danger-fg">{error}</Card>
      ) : loading || !data ? (
        <Card className="p-10 text-center text-fg-subtle italic">
          {t('reports.common.loading')}
        </Card>
      ) : (
        data.sections.map((section, index) => (
          <Card key={section.title ?? index} className="p-5 space-y-3">
            {section.title && (
              <h3 className="text-xs font-black uppercase tracking-wider text-fg-default">
                {section.title}
              </h3>
            )}
            <Table
              columns={columnsOf(section)}
              data={section.rows}
              rowKey={(_row, i) => i}
              density="compact"
              summaryRow={
                section.totals
                  ? () =>
                      section.columns.map((col, i) => {
                        const value = section.totals!.values[col.key];
                        if (value !== undefined) return display(value, col.format);
                        return i === 0 ? section.totals!.label : null;
                      })
                  : undefined
              }
            />
          </Card>
        ))
      )}
    </div>
  );
};

export default ReportPlugin;
