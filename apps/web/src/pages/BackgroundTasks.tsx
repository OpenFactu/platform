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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFormat } from '../hooks/useFormat';

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

/**
 * Panel en vivo con todas las tareas en segundo plano del tenant actual.
 * Por ahora muestra la cola de correo (únicamente tarea async implementada).
 * Refresca cada 2 segundos sin molestar (nada se refresca si no hay cambios).
 */
export const BackgroundTasks: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const [mails, setMails] = useState<MailQueueRow[]>([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    try {
      const res = await fetch('/api/email/queue', { headers });
      const data = await res.json();
      setMails(Array.isArray(data) ? data : []);
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
              Cola de envíos, jobs async y su estado en tiempo real.
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

      {/* Stats agregadas */}
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

export default BackgroundTasks;
