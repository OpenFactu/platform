/**
 * Tab "Backups" — backups automáticos y bajo demanda de la empresa.
 *
 *  - Programación: frecuencia (diaria/semanal), hora, destino (local del
 *    servidor / Google Drive / OneDrive), retención e includeUploads.
 *    Se guarda en /api/config/backup; el cron del server hace el resto.
 *  - Historial: últimas ejecuciones con descarga/borrado, botón «Backup
 *    ahora» y restauración (solo SUPERUSER — crea una empresa NUEVA, nunca
 *    sobrescribe la actual).
 *
 * Endpoints solo para ADMIN/SUPERUSER (el backend devuelve 403 al resto).
 */

import { coreApi } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Checkbox,
  NumberInput,
  Select,
  SearchableSelect,
  EmptyState,
  Table,
  useToast,
  usePopup,
  Spinner,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import {
  DatabaseBackup,
  Download,
  Trash2,
  RotateCcw,
  Play,
  Save,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';

type Destination = 'local' | 'gdrive' | 'onedrive';

interface BackupConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  hour: number;
  weekday: number;
  destination: Destination;
  retentionCount: number;
  includeUploads: boolean;
}

interface BackupRun {
  id: string;
  kind: 'scheduled' | 'manual';
  status: 'running' | 'ok' | 'error';
  destination: Destination;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const DEST_LABELS: Record<Destination, string> = {
  local: 'settingsCompany.backups.destLocal',
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

const WEEKDAYS = [
  'settingsCompany.backups.weekdays.sunday',
  'settingsCompany.backups.weekdays.monday',
  'settingsCompany.backups.weekdays.tuesday',
  'settingsCompany.backups.weekdays.wednesday',
  'settingsCompany.backups.weekdays.thursday',
  'settingsCompany.backups.weekdays.friday',
  'settingsCompany.backups.weekdays.saturday',
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'settingsCompany.backups.daily' },
  { value: 'weekly', label: 'settingsCompany.backups.weekly' },
];

/** Opciones derivadas de WEEKDAYS: el índice ES el valor que espera el cron. */
const WEEKDAY_OPTIONS = WEEKDAYS.map((label, i) => ({ value: String(i), label }));

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export const BackupsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const popup = usePopup();
  const role = user?.role;
  const canUse = role === 'ADMIN' || role === 'SUPERUSER';
  const isSuperuser = role === 'SUPERUSER';

  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [cloudStatus, setCloudStatus] = useState<Record<string, { connected: boolean }> | null>(
    null,
  );
  // Si el rol no puede usar backups no hay nada que cargar
  const [loading, setLoading] = useState(canUse);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [restoreRun, setRestoreRun] = useState<BackupRun | null>(null);
  const [restoreName, setRestoreName] = useState('');
  const [restoring, setRestoring] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': user?.tenantId ?? '',
  };

  const loadRuns = async (): Promise<BackupRun[]> => {
    const body = await coreApi.get<{ runs?: BackupRun[] }>('/api/backups');
    const list: BackupRun[] = body?.runs || [];
    setRuns(list);
    return list;
  };

  useEffect(() => {
    if (!canUse) return;
    (async () => {
      try {
        const [cfgRes] = await Promise.all([
          coreApi.raw('GET', '/api/config/backup'),
          loadRuns().catch(() => []),
          coreApi
            .raw('GET', '/api/config/storage/oauth/status')
            .then((r) => setCloudStatus(r.ok ? r.data : null))
            .catch(() => setCloudStatus(null)),
        ]);
        if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status}`);
        setConfig(cfgRes.data);
      } catch {
        toast.error(t('settingsCompany.backups.loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Mientras haya un backup en curso, sondeamos la lista cada 5 s.
  useEffect(() => {
    const anyRunning = runs.some((r) => r.status === 'running');
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(() => loadRuns().catch(() => undefined), 5000);
    } else if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runs]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await coreApi.raw('PUT', '/api/config/backup', config);
      if (!res.ok) throw new Error(res.data?.error || `HTTP ${res.status}`);
      setConfig(res.data);
      toast.success(t('settingsCompany.backups.scheduleSaved'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.backups.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setLaunching(true);
    try {
      const res = await coreApi.raw('POST', '/api/backups/run');
      const body = res.data ?? {};
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(t('settingsCompany.backups.launched'));
      await loadRuns().catch(() => undefined);
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.backups.launchError'),
      );
    } finally {
      setLaunching(false);
    }
  };

  const download = async (run: BackupRun) => {
    try {
      const { blob } = await coreApi.getBlob(`/api/backups/${run.id}/download`);
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = run.fileName || 'backup.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 30_000);
    } catch (e) {
      toast.error(
        t('settingsCompany.backups.downloadError', {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  const remove = async (run: BackupRun) => {
    const ok = await popup.confirm({
      title: t('settingsCompany.backups.deleteTitle'),
      message: t('settingsCompany.backups.deleteMessage', {
        file: run.fileName || run.id,
        destination: DEST_LABELS[run.destination]
          ? t(DEST_LABELS[run.destination])
          : run.destination,
      }),
      tone: 'danger',
      confirmLabel: t('settingsCompany.backups.delete'),
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', `/api/backups/${run.id}`);
      if (!res.ok) throw new Error(res.data?.error || `HTTP ${res.status}`);
      toast.success(t('settingsCompany.backups.deleted'));
      await loadRuns().catch(() => undefined);
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.backups.deleteError'),
      );
    }
  };

  const restore = async () => {
    if (!restoreRun) return;
    if (!restoreName.trim()) {
      toast.error(t('settingsCompany.backups.nameRequired'));
      return;
    }
    setRestoring(true);
    try {
      const res = await coreApi.raw('POST', `/api/backups/${restoreRun.id}/restore`, {
        newName: restoreName.trim(),
      });
      const body = res.data ?? {};
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(
        t('settingsCompany.backups.restored', { name: restoreName.trim(), id: body.tenantId }),
      );
      setRestoreRun(null);
      setRestoreName('');
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.backups.restoreError'),
      );
    } finally {
      setRestoring(false);
    }
  };

  if (!canUse) {
    return (
      <Card>
        <div className="p-6 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <strong>{t('settingsCompany.backups.restrictedTitle')}</strong>{' '}
            {t('settingsCompany.backups.restrictedBody')}
          </div>
        </div>
      </Card>
    );
  }

  if (loading || !config) {
    return (
      <Card>
        <div className="p-6 text-sm text-fg-subtle italic">
          {t('settingsCompany.backups.loading')}
        </div>
      </Card>
    );
  }

  const cloudConnected = (d: Destination) => d === 'local' || Boolean(cloudStatus?.[d]?.connected);
  const set = <K extends keyof BackupConfig>(k: K, v: BackupConfig[K]) =>
    setConfig((c) => (c ? { ...c, [k]: v } : c));

  const historyColumns: TableColumn<BackupRun>[] = [
    {
      header: t('settingsCompany.backups.colDate'),
      cell: (run) => formatDateTime(run.startedAt),
      sortable: true,
      sortAccessor: (run) => run.startedAt,
      primary: true,
      className: 'whitespace-nowrap',
    },
    {
      header: t('settingsCompany.backups.colKind'),
      cell: (run) =>
        run.kind === 'scheduled'
          ? t('settingsCompany.backups.kindScheduled')
          : t('settingsCompany.backups.kindManual'),
    },
    {
      header: t('settingsCompany.backups.colDestination'),
      cell: (run) =>
        DEST_LABELS[run.destination] ? t(DEST_LABELS[run.destination]) : run.destination,
    },
    {
      header: t('settingsCompany.backups.colSize'),
      cell: (run) => formatSize(run.sizeBytes),
      align: 'right',
      sortable: true,
      sortAccessor: (run) => run.sizeBytes ?? 0,
    },
    {
      header: t('settingsCompany.backups.colStatus'),
      cell: (run) => (
        <>
          {run.status === 'ok' && (
            <span className="inline-flex items-center gap-1 text-success-fg text-xs font-bold">
              <CheckCircle2 size={13} /> {t('settingsCompany.backups.statusOk')}
            </span>
          )}
          {run.status === 'running' && (
            <span className="inline-flex items-center gap-1 text-info-fg text-xs font-bold">
              <Spinner size="xs" tone="inherit" /> {t('settingsCompany.backups.statusRunning')}
            </span>
          )}
          {run.status === 'error' && (
            <span
              className="inline-flex items-center gap-1 text-danger-fg text-xs font-bold"
              title={run.error || ''}
            >
              <XCircle size={13} /> {t('settingsCompany.backups.statusError')}
            </span>
          )}
        </>
      ),
    },
  ];

  /**
   * Descargar/restaurar/eliminar se mueven al menú ⋯ de la fila. Se conservan
   * las mismas condiciones que tenían los botones: solo se descarga y restaura
   * un backup terminado, restaurar sigue siendo exclusivo de SUPERUSER y no se
   * borra uno en curso.
   */
  const historyActions = (run: BackupRun): RowAction[] => {
    const actions: RowAction[] = [];
    if (run.status === 'ok') {
      actions.push({
        label: t('settingsCompany.backups.download'),
        icon: <Download size={14} />,
        onClick: () => download(run),
      });
      if (isSuperuser) {
        actions.push({
          label: t('settingsCompany.backups.restoreAsNew'),
          icon: <RotateCcw size={14} />,
          onClick: () => {
            setRestoreRun(run);
            setRestoreName('');
          },
        });
      }
    }
    if (run.status !== 'running') {
      actions.push({
        label: t('settingsCompany.backups.delete'),
        icon: <Trash2 size={14} />,
        destructive: true,
        onClick: () => remove(run),
      });
    }
    return actions;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-fg-body">
            <DatabaseBackup size={18} />
            <h2 className="text-lg font-bold">{t('settingsCompany.backups.autoTitle')}</h2>
          </div>
          <p className="text-sm text-fg-muted leading-snug">
            {t('settingsCompany.backups.autoHelpBefore')}
            <code>.zip</code>
            {t('settingsCompany.backups.autoHelpAfter', {
              uploads: config.includeUploads ? t('settingsCompany.backups.plusUploads') : '',
              count: String(config.retentionCount || '—'),
            })}
          </p>

          {/* Checkbox y no Switch: la programación se persiste con «Guardar
              programación», no al marcar la casilla. */}
          <label className="flex items-center gap-2 text-sm text-fg-body cursor-pointer font-bold">
            <Checkbox checked={config.enabled} onChange={(v) => set('enabled', v)} />
            {t('settingsCompany.backups.enableAuto')}
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select
              label={t('settingsCompany.backups.frequency')}
              options={FREQUENCY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
              value={config.frequency}
              onChange={(v) => set('frequency', v as BackupConfig['frequency'])}
            />
            {config.frequency === 'weekly' && (
              <Select
                label={t('settingsCompany.backups.day')}
                options={WEEKDAY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={String(config.weekday)}
                onChange={(v) => set('weekday', Number(v))}
              />
            )}
            {/* 24 opciones → SearchableSelect (se puede teclear «03»). Sin prop
                `label`, así que la etiqueta va aparte. */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">
                {t('settingsCompany.backups.hour')}
              </span>
              <SearchableSelect
                options={HOUR_OPTIONS}
                value={String(config.hour)}
                onChange={(v) => set('hour', Number(v))}
              />
            </div>
            <Select
              label={t('settingsCompany.backups.colDestination')}
              options={(Object.keys(DEST_LABELS) as Destination[]).map((d) => ({
                value: d,
                label: `${t(DEST_LABELS[d])}${cloudConnected(d) ? '' : t('settingsCompany.backups.notConnectedSuffix')}`,
                disabled: !cloudConnected(d),
              }))}
              value={config.destination}
              onChange={(v) => set('destination', v as Destination)}
            />
            <NumberInput
              label={t('settingsCompany.backups.retention')}
              value={config.retentionCount}
              onChange={(v) => set('retentionCount', Math.max(1, v ?? 1))}
              min={1}
              max={365}
              thousandSeparator={false}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-fg-body cursor-pointer">
            <Checkbox checked={config.includeUploads} onChange={(v) => set('includeUploads', v)} />
            <span>{t('settingsCompany.backups.includeUploads')}</span>
          </label>

          <p className="text-[11px] text-slate-400 leading-snug">
            {t('settingsCompany.backups.hourHelp')}
          </p>

          {!canUse && (
            <p className="text-[11px] text-slate-400">{t('settingsCompany.backups.adminOnly')}</p>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={saveConfig} disabled={saving || !canUse}>
              <Save size={15} className="mr-2" />
              {saving
                ? t('settingsCompany.backups.saving')
                : t('settingsCompany.backups.saveSchedule')}
            </Button>
            <Button variant="secondary" onClick={runNow} disabled={launching}>
              <Play size={15} className="mr-2" />
              {launching
                ? t('settingsCompany.backups.launching')
                : t('settingsCompany.backups.runNow')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            {t('settingsCompany.backups.history')}
          </h3>
          {runs.length === 0 ? (
            <EmptyState
              icon={<DatabaseBackup size={28} />}
              title={t('settingsCompany.backups.emptyTitle')}
              hint={t('settingsCompany.backups.emptyHint')}
            />
          ) : (
            <Table
              className="max-md:p-3"
              columns={historyColumns}
              data={runs}
              rowActions={historyActions}
            />
          )}
        </div>
      </Card>

      {restoreRun && (
        <Card>
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-fg-body">
              <RotateCcw size={18} />
              <h3 className="text-lg font-bold">{t('settingsCompany.backups.restoreTitle')}</h3>
            </div>
            <div className="rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 p-4 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {t('settingsCompany.backups.restoreBefore')}
                <strong>{t('settingsCompany.backups.restoreStrong')}</strong>
                {t('settingsCompany.backups.restoreAfter', { file: restoreRun.fileName || '' })}
              </span>
            </div>
            <Input
              label={t('settingsCompany.backups.newName')}
              placeholder={t('settingsCompany.backups.newNamePlaceholder')}
              value={restoreName}
              onChange={(e) => setRestoreName(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={restore} disabled={restoring}>
                <RotateCcw size={15} className="mr-2" />
                {restoring
                  ? t('settingsCompany.backups.restoring')
                  : t('settingsCompany.backups.restore')}
              </Button>
              <Button variant="secondary" onClick={() => setRestoreRun(null)} disabled={restoring}>
                {t('settingsCompany.backups.cancel')}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
