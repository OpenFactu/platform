import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  KpiCard,
  Progress,
  Table,
  useToast,
  Spinner,
} from '@openfactu/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  Play,
  Undo2,
  XCircle,
} from 'lucide-react';
import { dataImportApi } from '../api/dataImportApi';
import { useImportJob } from '../hooks/useImportJob';
import { errorMessage } from '../lib/errorMessage';
import type { ImportJob, ImportJobRow, ImportObject } from '../types';
import { useI18n } from '@/i18n/I18nContext';
import { formatNumber } from '@/i18n/format';

interface Props {
  object: ImportObject;
  jobId: string | null;
  launching: boolean;
  onLaunch: (dryRun: boolean) => void;
  onRestart: () => void;
}

const STATUS_BADGE: Record<
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

export const StepRun: React.FC<Props> = ({ object, jobId, launching, onLaunch, onRestart }) => {
  const toast = useToast();
  const { t } = useI18n();
  const { job, errorRows, isRunning, cancel, undo } = useImportJob(jobId);
  const [confirmUndo, setConfirmUndo] = useState(false);

  if (!jobId || !job) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="p-4 space-y-3">
            <p className="text-sm text-fg-body">
              {t('dataImport.run.introBefore')}
              <strong>{t('dataImport.run.introStrong')}</strong>
              {t('dataImport.run.introAfter')}
            </p>
            <div className="rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs text-fg-muted">
              {t('dataImport.run.simulationNote', { object: object.label.toLowerCase() })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => onLaunch(true)}
                disabled={launching}
                className="gap-1.5"
              >
                <FlaskConical size={15} /> {t('dataImport.run.simulate')}
              </Button>
              <Button onClick={() => onLaunch(false)} disabled={launching} className="gap-1.5">
                <Play size={15} /> {t('dataImport.run.import')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const badge = STATUS_BADGE[job.status];
  const percent = job.totalRows ? Math.round((job.processedRows / job.totalRows) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant} className="gap-1">
              {isRunning && <Spinner size="xs" tone="inherit" />}
              {t(badge.label)}
            </Badge>
            {job.dryRun && <Badge variant="neutral">{t('dataImport.run.simulationBadge')}</Badge>}
            <span className="text-sm font-medium text-fg-default">{job.fileName}</span>
            <span className="ml-auto text-[11px] text-fg-subtle tabular-nums">
              {t('dataImport.run.rowsProgress', {
                processed: formatNumber(job.processedRows),
                total: formatNumber(job.totalRows),
              })}
            </span>
          </div>

          <Progress
            value={percent}
            variant={job.errorRows > 0 ? 'warning' : isRunning ? 'accent' : 'success'}
          />

          {job.error && (
            <div className="flex items-start gap-2 rounded-sm border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-fg-body">
              <XCircle size={14} className="text-danger shrink-0 mt-px" />
              {job.error}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label={t('dataImport.run.kpiTotal')} value={formatNumber(job.totalRows)} />
            <KpiCard
              label={job.dryRun ? t('dataImport.run.kpiValid') : t('dataImport.run.kpiOk')}
              value={formatNumber(job.okRows)}
            />
            <KpiCard label={t('dataImport.run.kpiErrors')} value={formatNumber(job.errorRows)} />
            <KpiCard label={t('dataImport.run.kpiSkipped')} value={formatNumber(job.skippedRows)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {isRunning && (
              <Button variant="outline" onClick={cancel} className="gap-1.5">
                {t('dataImport.run.cancel')}
              </Button>
            )}

            {!isRunning && job.dryRun && (
              <Button onClick={() => onLaunch(false)} disabled={launching} className="gap-1.5">
                <Play size={15} />
                {job.errorRows > 0
                  ? t('dataImport.run.importAnyway', { rows: formatNumber(job.okRows) })
                  : t('dataImport.run.importForReal')}
              </Button>
            )}

            {!isRunning && job.errorRows > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  dataImportApi
                    .downloadErrors(job)
                    .catch((e) => toast.error(errorMessage(e, t('dataImport.run.csvError'))))
                }
                className="gap-1.5"
              >
                <Download size={15} /> {t('dataImport.run.downloadErrors')}
              </Button>
            )}

            {!isRunning && !job.dryRun && job.status === 'done' && object.supportsUndo && (
              <Button variant="outline" onClick={() => setConfirmUndo(true)} className="gap-1.5">
                <Undo2 size={15} /> {t('dataImport.run.undo')}
              </Button>
            )}

            {!isRunning && (
              <Button variant="ghost" onClick={onRestart} className="ml-auto">
                {t('dataImport.run.importAnother')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {!isRunning && job.errorRows > 0 && <ErrorTable rows={errorRows} />}

      {!isRunning && job.errorRows === 0 && job.status === 'done' && (
        <EmptyState
          icon={<CheckCircle2 size={30} className="text-success" />}
          title={job.dryRun ? t('dataImport.run.cleanFile') : t('dataImport.run.doneNoErrors')}
          hint={
            job.dryRun
              ? t('dataImport.run.cleanFileHint')
              : t('dataImport.run.processed', { count: formatNumber(job.okRows) })
          }
        />
      )}

      <ConfirmDialog
        open={confirmUndo}
        onCancel={() => setConfirmUndo(false)}
        onConfirm={async () => {
          setConfirmUndo(false);
          try {
            await undo();
            toast.info(t('dataImport.run.undoing'));
          } catch (e) {
            toast.error(errorMessage(e, t('dataImport.run.undoError')));
          }
        }}
        title={t('dataImport.run.undoTitle')}
        message={t('dataImport.run.undoMessage', { count: formatNumber(job.okRows) })}
        confirmLabel={t('dataImport.run.undo')}
        tone="danger"
      />
    </div>
  );
};

const ErrorTable: React.FC<{ rows: ImportJobRow[] }> = ({ rows }) => {
  const { t } = useI18n();
  if (rows.length === 0) return null;

  return (
    <Card>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-warning" />
          <h3 className="text-sm font-semibold text-fg-default">
            {t('dataImport.run.errorRowsTitle', { count: formatNumber(rows.length) })}
          </h3>
        </div>
        <p className="text-xs text-fg-muted">{t('dataImport.run.errorRowsHint')}</p>
        <Table
          responsive="scroll"
          density="compact"
          columns={[
            {
              header: t('dataImport.run.colRow'),
              width: '80px',
              cell: (r: ImportJobRow) => <span className="tabular-nums">{r.rowNum}</span>,
            },
            {
              header: t('dataImport.run.colReason'),
              cell: (r: ImportJobRow) => <span className="text-xs">{r.message}</span>,
            },
          ]}
          data={rows}
          pagination={{ pageSize: 20 }}
        />
      </div>
    </Card>
  );
};
