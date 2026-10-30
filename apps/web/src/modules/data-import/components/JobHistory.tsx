import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Table, Spinner } from '@openfactu/ui';
import { History } from 'lucide-react';
import { dataImportApi } from '../api/dataImportApi';
import { useFormat } from '@/hooks/useFormat';
import type { ImportJob, ImportObject } from '../types';
import { useI18n } from '@/i18n/I18nContext';
import { formatNumber } from '@/i18n/format';

const STATUS: Record<
  ImportJob['status'],
  { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'error' }
> = {
  // `label` es la clave de i18n; se traduce al pintar.
  pending: { label: 'dataImport.status.pending', variant: 'neutral' },
  running: { label: 'dataImport.status.running', variant: 'info' },
  done: { label: 'dataImport.status.done', variant: 'success' },
  cancelled: { label: 'dataImport.status.cancelled', variant: 'warning' },
  error: { label: 'dataImport.status.error', variant: 'error' },
  undone: { label: 'dataImport.status.undone', variant: 'neutral' },
};

interface Props {
  objects: ImportObject[];
  onOpen: (jobId: string) => void;
}

export const JobHistory: React.FC<Props> = ({ objects, onOpen }) => {
  const fmt = useFormat();
  const { t } = useI18n();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      dataImportApi
        .jobs(20)
        .then((rows) => alive && setJobs(rows))
        .catch(() => undefined)
        .finally(() => alive && setLoading(false));

    load();
    // Mientras haya algo en curso conviene refrescar; fuera de eso, el
    // histórico no cambia solo.
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const labelOf = (objectId: string) => objects.find((o) => o.id === objectId)?.label || objectId;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-subtle p-4">
        <Spinner size="sm" tone="inherit" /> {t('dataImport.history.loading')}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<History size={28} />}
        title={t('dataImport.history.emptyTitle')}
        hint={t('dataImport.history.emptyHint')}
      />
    );
  }

  return (
    <Card>
      <Table
        density="compact"
        data={jobs}
        onRowClick={(job) => onOpen(job.id)}
        columns={[
          {
            header: t('dataImport.history.colFile'),
            primary: true,
            cell: (job: ImportJob) => (
              <div className="min-w-0">
                <div className="truncate">{job.fileName}</div>
                <div className="text-[11px] text-fg-subtle">{labelOf(job.objectId)}</div>
              </div>
            ),
          },
          {
            header: t('dataImport.history.colStatus'),
            width: '150px',
            cell: (job: ImportJob) => (
              <div className="flex items-center gap-1.5">
                <Badge variant={STATUS[job.status].variant}>{t(STATUS[job.status].label)}</Badge>
                {job.dryRun && (
                  <Badge variant="neutral">{t('dataImport.history.simulation')}</Badge>
                )}
              </div>
            ),
          },
          {
            header: t('dataImport.history.colResult'),
            width: '170px',
            cell: (job: ImportJob) => (
              <span className="text-xs tabular-nums text-fg-muted">
                {t('dataImport.history.ok', { ok: formatNumber(job.okRows) })}
                {job.errorRows > 0 &&
                  ` · ${t('dataImport.history.withErrors', { errors: formatNumber(job.errorRows) })}`}
              </span>
            ),
          },
          {
            header: t('dataImport.history.colWhen'),
            width: '150px',
            cell: (job: ImportJob) => (
              <span className="text-xs text-fg-muted">
                {job.createdAt ? fmt.date(new Date(job.createdAt)) : '—'}
              </span>
            ),
          },
          {
            header: '',
            width: '90px',
            align: 'right',
            cell: (job: ImportJob) => (
              <Button variant="ghost" size="sm" onClick={() => onOpen(job.id)}>
                {t('dataImport.history.view')}
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
};
