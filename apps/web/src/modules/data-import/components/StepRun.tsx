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
} from '@openfactu/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  Loader2,
  Play,
  Undo2,
  XCircle,
} from 'lucide-react';
import { dataImportApi } from '../api/dataImportApi';
import { useImportJob } from '../hooks/useImportJob';
import { errorMessage } from '../lib/errorMessage';
import type { ImportJob, ImportJobRow, ImportObject } from '../types';

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
  pending: { label: 'En cola', variant: 'neutral' },
  running: { label: 'En curso', variant: 'info' },
  done: { label: 'Terminada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'warning' },
  error: { label: 'Fallida', variant: 'error' },
  undone: { label: 'Deshecha', variant: 'neutral' },
};

export const StepRun: React.FC<Props> = ({ object, jobId, launching, onLaunch, onRestart }) => {
  const toast = useToast();
  const { job, errorRows, isRunning, cancel, undo } = useImportJob(jobId);
  const [confirmUndo, setConfirmUndo] = useState(false);

  if (!jobId || !job) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="p-4 space-y-3">
            <p className="text-sm text-fg-body">
              Lanza primero una <strong>simulación</strong>: recorre el fichero entero sin escribir
              nada y te dice qué filas no van a entrar.
            </p>
            <div className="rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs text-fg-muted">
              La simulación comprueba el fichero: tipos, campos obligatorios, referencias que no
              existen y claves repetidas. Las reglas del propio módulo —un NIF con formato inválido,
              un límite de crédito, la serie de numeración— las aplica {object.label.toLowerCase()}{' '}
              al escribir, así que pueden aparecer errores nuevos en la importación real.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => onLaunch(true)}
                disabled={launching}
                className="gap-1.5"
              >
                <FlaskConical size={15} /> Simular
              </Button>
              <Button onClick={() => onLaunch(false)} disabled={launching} className="gap-1.5">
                <Play size={15} /> Importar
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
              {isRunning && <Loader2 size={12} className="animate-spin" />}
              {badge.label}
            </Badge>
            {job.dryRun && <Badge variant="neutral">Simulación</Badge>}
            <span className="text-sm font-medium text-fg-default">{job.fileName}</span>
            <span className="ml-auto text-[11px] text-fg-subtle tabular-nums">
              {job.processedRows.toLocaleString('es-ES')} / {job.totalRows.toLocaleString('es-ES')}{' '}
              filas
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
            <KpiCard label="Total" value={job.totalRows.toLocaleString('es-ES')} />
            <KpiCard
              label={job.dryRun ? 'Válidas' : 'Correctas'}
              value={job.okRows.toLocaleString('es-ES')}
            />
            <KpiCard label="Con error" value={job.errorRows.toLocaleString('es-ES')} />
            <KpiCard label="Omitidas" value={job.skippedRows.toLocaleString('es-ES')} />
          </div>

          <div className="flex flex-wrap gap-2">
            {isRunning && (
              <Button variant="outline" onClick={cancel} className="gap-1.5">
                Cancelar
              </Button>
            )}

            {!isRunning && job.dryRun && (
              <Button onClick={() => onLaunch(false)} disabled={launching} className="gap-1.5">
                <Play size={15} />
                {job.errorRows > 0
                  ? `Importar igualmente (${job.okRows.toLocaleString('es-ES')} filas)`
                  : 'Importar de verdad'}
              </Button>
            )}

            {!isRunning && job.errorRows > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  dataImportApi
                    .downloadErrors(job)
                    .catch((e) => toast.error(errorMessage(e, 'No se pudo generar el CSV')))
                }
                className="gap-1.5"
              >
                <Download size={15} /> Descargar filas con error
              </Button>
            )}

            {!isRunning && !job.dryRun && job.status === 'done' && object.supportsUndo && (
              <Button variant="outline" onClick={() => setConfirmUndo(true)} className="gap-1.5">
                <Undo2 size={15} /> Deshacer
              </Button>
            )}

            {!isRunning && (
              <Button variant="ghost" onClick={onRestart} className="ml-auto">
                Importar otra cosa
              </Button>
            )}
          </div>
        </div>
      </Card>

      {!isRunning && job.errorRows > 0 && <ErrorTable rows={errorRows} />}

      {!isRunning && job.errorRows === 0 && job.status === 'done' && (
        <EmptyState
          icon={<CheckCircle2 size={30} className="text-success" />}
          title={job.dryRun ? 'El fichero está limpio' : 'Importación terminada sin errores'}
          hint={
            job.dryRun
              ? 'Ninguna fila tiene problemas de formato. Ya puedes importar de verdad.'
              : `${job.okRows.toLocaleString('es-ES')} registros procesados.`
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
            toast.info('Deshaciendo la importación…');
          } catch (e) {
            toast.error(errorMessage(e, 'No se pudo deshacer'));
          }
        }}
        title="¿Deshacer esta importación?"
        message={`Se intentarán borrar los ${job.okRows.toLocaleString('es-ES')} registros que creó. Los que ya tengan documentos o movimientos colgando NO se podrán borrar, y se te dirá cuáles. Las filas que actualizaron algo no se revierten.`}
        confirmLabel="Deshacer"
        tone="danger"
      />
    </div>
  );
};

const ErrorTable: React.FC<{ rows: ImportJobRow[] }> = ({ rows }) => {
  if (rows.length === 0) return null;

  return (
    <Card>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-warning" />
          <h3 className="text-sm font-semibold text-fg-default">
            {rows.length.toLocaleString('es-ES')} filas con error
          </h3>
        </div>
        <p className="text-xs text-fg-muted">
          Corrige el CSV que puedes descargar arriba y vuelve a subirlo: trae solo estas filas, con
          el motivo en la última columna.
        </p>
        <Table
          responsive="scroll"
          density="compact"
          columns={[
            {
              header: 'Fila',
              width: '80px',
              cell: (r: ImportJobRow) => <span className="tabular-nums">{r.rowNum}</span>,
            },
            {
              header: 'Motivo',
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
