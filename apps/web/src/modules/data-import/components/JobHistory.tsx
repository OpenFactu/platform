import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Table } from '@openfactu/ui';
import { History, Loader2 } from 'lucide-react';
import { dataImportApi } from '../api/dataImportApi';
import { useFormat } from '@/hooks/useFormat';
import type { ImportJob, ImportObject } from '../types';

const STATUS: Record<
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

interface Props {
  objects: ImportObject[];
  onOpen: (jobId: string) => void;
}

export const JobHistory: React.FC<Props> = ({ objects, onOpen }) => {
  const fmt = useFormat();
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
        <Loader2 size={14} className="animate-spin" /> Cargando el histórico…
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<History size={28} />}
        title="Todavía no has importado nada"
        hint="Aquí quedará el registro de cada fichero con su resultado."
      />
    );
  }

  return (
    <Card>
      <Table
        responsive="cards"
        cardsBreakpoint={768}
        density="compact"
        data={jobs}
        onRowClick={(job) => onOpen(job.id)}
        columns={[
          {
            header: 'Fichero',
            primary: true,
            cell: (job: ImportJob) => (
              <div className="min-w-0">
                <div className="truncate">{job.fileName}</div>
                <div className="text-[11px] text-fg-subtle">{labelOf(job.objectId)}</div>
              </div>
            ),
          },
          {
            header: 'Estado',
            width: '150px',
            cell: (job: ImportJob) => (
              <div className="flex items-center gap-1.5">
                <Badge variant={STATUS[job.status].variant}>{STATUS[job.status].label}</Badge>
                {job.dryRun && <Badge variant="neutral">simulación</Badge>}
              </div>
            ),
          },
          {
            header: 'Resultado',
            width: '170px',
            cell: (job: ImportJob) => (
              <span className="text-xs tabular-nums text-fg-muted">
                {job.okRows.toLocaleString('es-ES')} ok
                {job.errorRows > 0 && ` · ${job.errorRows.toLocaleString('es-ES')} con error`}
              </span>
            ),
          },
          {
            header: 'Cuándo',
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
                Ver
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
};
