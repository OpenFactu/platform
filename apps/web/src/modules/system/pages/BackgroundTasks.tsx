import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Badge, useToast } from '@openfactu/ui';
import {
  Activity,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  DatabaseBackup,
  Paperclip,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';

interface MailQueueRow {
  id: string;
  tenantId: string;
  attempts: number;
  nextAttemptAt: number;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  lastError?: string;
  createdAt: number;
  sentAt?: number;
  to: string | string[];
}

interface BackupRunRow {
  id: string;
  kind: 'scheduled' | 'manual';
  status: 'running' | 'ok' | 'error';
  destination: 'local' | 'gdrive' | 'onedrive';
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface AttachmentRow {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mime: string;
  size: number;
  provider: 'local' | 'gdrive' | 'onedrive';
  uploadedBy: string | null;
  uploadedAt: string;
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Panel en vivo con todas las tareas en segundo plano del tenant actual:
 * cola de correo, backups (manuales y programados) y subidas de adjuntos
 * recientes. Refresca cada 2 segundos sin molestar (nada se refresca si no
 * hay cambios visibles).
 *
 * `/api/backups` solo responde a ADMIN/SUPERUSER — si el usuario no tiene
 * ese rol, la sección de backups se omite en silencio (sin toast de error)
 * en vez de mostrar un 403 confuso.
 */
export const BackgroundTasks: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const [mails, setMails] = useState<MailQueueRow[]>([]);
  const [backups, setBackups] = useState<BackupRunRow[]>([]);
  const [canSeeBackups, setCanSeeBackups] = useState(true);
  const [uploads, setUploads] = useState<AttachmentRow[]>([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    try {
      const [mailRes, backupsRes, uploadsRes] = await Promise.all([
        coreApi.raw('GET', '/api/email/queue'),
        coreApi.raw('GET', '/api/backups'),
        coreApi.raw('GET', '/api/attachments/recent?limit=15'),
      ]);

      const mailData = mailRes.data ?? [];
      setMails(Array.isArray(mailData) ? mailData : []);

      if (backupsRes.status === 403) {
        setCanSeeBackups(false);
      } else {
        const backupData = backupsRes.data ?? { runs: [] };
        setBackups(Array.isArray(backupData?.runs) ? backupData.runs : []);
      }

      const uploadsData = uploadsRes.data ?? [];
      setUploads(Array.isArray(uploadsData) ? uploadsData : []);

      setLastUpdate(Date.now());
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const grouped = {
    sending: mails.filter((m) => m.status === 'sending'),
    queued: mails.filter((m) => m.status === 'queued'),
    sent: mails.filter((m) => m.status === 'sent'),
    failed: mails.filter((m) => m.status === 'failed'),
  };

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const backupsGrouped = {
    running: backups.filter((b) => b.status === 'running'),
    okRecent: backups.filter(
      (b) => b.status === 'ok' && new Date(b.startedAt).getTime() >= oneHourAgo,
    ),
    failed: backups.filter((b) => b.status === 'error'),
  };

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <header className="flex items-end justify-between border-b border-line dark:border-ink-700 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-accent/10 text-accent border border-accent/20 rounded-sm">
            <Activity size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-ink-900 dark:text-slate-100">
              Tareas en segundo plano
            </h1>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Cola de envíos, backups, subidas y su estado en tiempo real.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-ink-400 animate-pulse">
            ● {new Date(lastUpdate).toLocaleTimeString('es-ES')}
          </span>
          <Button variant="outline" size="sm" onClick={load} className="gap-1">
            <RefreshCw size={12} /> Refrescar
          </Button>
        </div>
      </header>

      {/* Stats agregadas — correo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Enviándose"
          value={grouped.sending.length}
          icon={<Loader2 size={18} className="animate-spin" />}
          tone="accent"
        />
        <StatCard
          label="En cola"
          value={grouped.queued.length}
          icon={<Clock size={18} />}
          tone="neutral"
        />
        <StatCard
          label="Enviados (última h)"
          value={grouped.sent.length}
          icon={<CheckCircle2 size={18} />}
          tone="success"
        />
        <StatCard
          label="Fallidos"
          value={grouped.failed.length}
          icon={<XCircle size={18} />}
          tone="error"
        />
      </div>

      <Card>
        <div className="p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 flex items-center gap-2 mb-3">
            <Mail size={14} /> Cola de correo
          </h2>
          {loading ? (
            <div className="py-10 text-center text-ink-400 text-xs font-mono">Cargando…</div>
          ) : mails.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-ink-400">
              <Mail size={28} />
              <p className="text-xs font-mono uppercase tracking-wider">No hay emails en la cola</p>
            </div>
          ) : (
            <ul className="divide-y divide-line dark:divide-ink-700">
              {mails
                .slice()
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((m) => (
                  <MailRow key={m.id} mail={m} fmt={fmt} />
                ))}
            </ul>
          )}
        </div>
      </Card>

      {canSeeBackups && (
        <>
          {/* Stats agregadas — backups */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              label="Backups en curso"
              value={backupsGrouped.running.length}
              icon={<Loader2 size={18} className="animate-spin" />}
              tone="accent"
            />
            <StatCard
              label="Completados (última h)"
              value={backupsGrouped.okRecent.length}
              icon={<CheckCircle2 size={18} />}
              tone="success"
            />
            <StatCard
              label="Fallidos"
              value={backupsGrouped.failed.length}
              icon={<XCircle size={18} />}
              tone="error"
            />
          </div>

          <Card>
            <div className="p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 flex items-center gap-2 mb-3">
                <DatabaseBackup size={14} /> Backups
              </h2>
              {loading ? (
                <div className="py-10 text-center text-ink-400 text-xs font-mono">Cargando…</div>
              ) : backups.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-ink-400">
                  <DatabaseBackup size={28} />
                  <p className="text-xs font-mono uppercase tracking-wider">
                    Todavía no hay backups
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line dark:divide-ink-700">
                  {backups.slice(0, 15).map((b) => (
                    <BackupRow key={b.id} run={b} fmt={fmt} />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}

      <Card>
        <div className="p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 flex items-center gap-2 mb-3">
            <Paperclip size={14} /> Subidas recientes
          </h2>
          {loading ? (
            <div className="py-10 text-center text-ink-400 text-xs font-mono">Cargando…</div>
          ) : uploads.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-ink-400">
              <Paperclip size={28} />
              <p className="text-xs font-mono uppercase tracking-wider">Sin subidas recientes</p>
            </div>
          ) : (
            <ul className="divide-y divide-line dark:divide-ink-700">
              {uploads.map((u) => (
                <UploadRow key={u.id} attachment={u} fmt={fmt} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'accent' | 'neutral' | 'success' | 'error';
}> = ({ label, value, icon, tone }) => {
  const classes =
    tone === 'accent'
      ? 'bg-accent/10 text-accent border-accent/30'
      : tone === 'success'
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
        : tone === 'error'
          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30'
          : 'bg-line-2 dark:bg-ink-800 text-ink-700 dark:text-slate-200 border-line dark:border-ink-700';
  return (
    <div
      className={`border rounded-sm p-4 flex items-center gap-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${classes}`}
    >
      <div>{icon}</div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</div>
        <div className="text-2xl font-bold font-display tabular-nums">{value}</div>
      </div>
    </div>
  );
};

const MailRow: React.FC<{ mail: MailQueueRow; fmt: any }> = ({ mail, fmt }) => {
  const to = Array.isArray(mail.to) ? mail.to.join(', ') : mail.to;
  const statusMap = {
    queued: { label: 'En cola', color: 'neutral' as const, icon: <Clock size={12} /> },
    sending: {
      label: 'Enviando…',
      color: 'info' as const,
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    sent: {
      label: 'Entregado',
      color: 'success' as const,
      icon: <CheckCircle2 size={12} />,
    },
    failed: {
      label: 'Fallido',
      color: 'error' as const,
      icon: <AlertTriangle size={12} />,
    },
  }[mail.status];

  const etaSec = Math.max(0, Math.round((mail.nextAttemptAt - Date.now()) / 1000));

  return (
    <li className="py-3 flex items-center gap-3 animate-in slide-in-from-left-2 duration-300">
      <Badge variant={statusMap.color} className="gap-1">
        {statusMap.icon}
        {statusMap.label}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-ink-900 dark:text-slate-100 truncate">{to}</div>
        <div className="text-[11px] text-ink-500 dark:text-ink-400 flex items-center gap-2">
          <span className="font-mono">#{mail.id.slice(0, 8)}</span>
          <span>·</span>
          <span>{fmt.date(new Date(mail.createdAt))}</span>
          {mail.attempts > 0 && (
            <>
              <span>·</span>
              <span>
                Intento {mail.attempts}
                {mail.status === 'queued' && etaSec > 0 && ` · reintenta en ${etaSec}s`}
              </span>
            </>
          )}
        </div>
        {mail.lastError && (
          <div className="text-[10px] text-rose-600 dark:text-rose-400 italic mt-0.5 truncate">
            {mail.lastError}
          </div>
        )}
      </div>
    </li>
  );
};

const BACKUP_DEST_LABELS: Record<BackupRunRow['destination'], string> = {
  local: 'Disco local',
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

const BackupRow: React.FC<{ run: BackupRunRow; fmt: any }> = ({ run, fmt }) => {
  const statusMap = {
    running: {
      label: 'En curso…',
      color: 'info' as const,
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    ok: { label: 'Completado', color: 'success' as const, icon: <CheckCircle2 size={12} /> },
    error: { label: 'Fallido', color: 'error' as const, icon: <AlertTriangle size={12} /> },
  }[run.status];

  return (
    <li className="py-3 flex items-center gap-3 animate-in slide-in-from-left-2 duration-300">
      <Badge variant={statusMap.color} className="gap-1">
        {statusMap.icon}
        {statusMap.label}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-ink-900 dark:text-slate-100 truncate">
          {run.fileName || (run.kind === 'manual' ? 'Backup manual' : 'Backup programado')}
        </div>
        <div className="text-[11px] text-ink-500 dark:text-ink-400 flex items-center gap-2">
          <span>{run.kind === 'manual' ? 'Manual' : 'Programado'}</span>
          <span>·</span>
          <span>{BACKUP_DEST_LABELS[run.destination] || run.destination}</span>
          {run.sizeBytes ? (
            <>
              <span>·</span>
              <span>{formatBytes(run.sizeBytes)}</span>
            </>
          ) : null}
          <span>·</span>
          <span>{fmt.date(new Date(run.startedAt))}</span>
        </div>
        {run.error && (
          <div className="text-[10px] text-rose-600 dark:text-rose-400 italic mt-0.5 truncate">
            {run.error}
          </div>
        )}
      </div>
    </li>
  );
};

const UploadRow: React.FC<{ attachment: AttachmentRow; fmt: any }> = ({ attachment, fmt }) => (
  <li className="py-3 flex items-center gap-3 animate-in slide-in-from-left-2 duration-300">
    <Badge variant="neutral" className="gap-1">
      <Paperclip size={12} />
      {attachment.provider}
    </Badge>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-bold text-ink-900 dark:text-slate-100 truncate">
        {attachment.fileName}
      </div>
      <div className="text-[11px] text-ink-500 dark:text-ink-400 flex items-center gap-2">
        <span>{formatBytes(attachment.size)}</span>
        <span>·</span>
        <span>
          {attachment.entityType} #{attachment.entityId.slice(0, 8)}
        </span>
        <span>·</span>
        <span>{fmt.date(new Date(attachment.uploadedAt))}</span>
      </div>
    </div>
  </li>
);

export default BackgroundTasks;
