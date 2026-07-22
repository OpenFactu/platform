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
import { Card, Button, Input, useToast } from '@openfactu/ui';
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
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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
  local: 'Disco del servidor',
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const selectCls =
  'px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100';

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export const BackupsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
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
    const res = await coreApi.get('/api/backups');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = res.data;
    const list: BackupRun[] = body.runs || [];
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
            .catch(() => null)
            .then(setCloudStatus)
            .catch(() => undefined),
        ]);
        if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status}`);
        setConfig(cfgRes.data);
      } catch {
        toast.error('No se pudo cargar la configuración de backups');
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
      toast.success('Programación guardada');
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          'Error al guardar',
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
      toast.success('Backup lanzado — puede tardar unos minutos');
      await loadRuns().catch(() => undefined);
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          'Error al lanzar el backup',
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
      toast.error(`Error al descargar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (run: BackupRun) => {
    if (
      !window.confirm(
        `¿Eliminar el backup "${run.fileName || run.id}"? Se borrará también del destino.`,
      )
    ) {
      return;
    }
    try {
      const res = await coreApi.raw('DELETE', `/api/backups/${run.id}`);
      if (!res.ok) throw new Error(res.data?.error || `HTTP ${res.status}`);
      toast.success('Backup eliminado');
      await loadRuns().catch(() => undefined);
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          'Error al eliminar',
      );
    }
  };

  const restore = async () => {
    if (!restoreRun) return;
    if (!restoreName.trim()) {
      toast.error('Indica el nombre de la nueva empresa');
      return;
    }
    setRestoring(true);
    try {
      const res = await coreApi.raw('POST', `/api/backups/${restoreRun.id}/restore`, {
        newName: restoreName.trim(),
      });
      const body = res.data ?? {};
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(`Backup restaurado como "${restoreName.trim()}" (id: ${body.tenantId})`);
      setRestoreRun(null);
      setRestoreName('');
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          'Error al restaurar',
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
            <strong>Acceso restringido.</strong> Necesitas rol ADMIN o SUPERUSER para gestionar
            backups.
          </div>
        </div>
      </Card>
    );
  }

  if (loading || !config) {
    return (
      <Card>
        <div className="p-6 text-sm text-slate-400 italic">Cargando…</div>
      </Card>
    );
  }

  const cloudConnected = (d: Destination) => d === 'local' || Boolean(cloudStatus?.[d]?.connected);
  const set = <K extends keyof BackupConfig>(k: K, v: BackupConfig[K]) =>
    setConfig((c) => (c ? { ...c, [k]: v } : c));

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <DatabaseBackup size={18} />
            <h2 className="text-lg font-bold">Backups automáticos</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            El servidor genera un <code>.zip</code> completo de la empresa (esquema + datos
            {config.includeUploads ? ' + adjuntos' : ''}) según esta programación y lo guarda en el
            destino elegido, conservando solo los últimos {config.retentionCount || '—'}.
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer font-bold">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
              className="w-4 h-4"
            />
            Activar backups automáticos
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
              Frecuencia
              <select
                className={selectCls}
                value={config.frequency}
                onChange={(e) => set('frequency', e.target.value as BackupConfig['frequency'])}
              >
                <option value="daily">Diaria</option>
                <option value="weekly">Semanal</option>
              </select>
            </label>
            {config.frequency === 'weekly' && (
              <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                Día
                <select
                  className={selectCls}
                  value={config.weekday}
                  onChange={(e) => set('weekday', Number(e.target.value))}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
              Hora
              <select
                className={selectCls}
                value={config.hour}
                onChange={(e) => set('hour', Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
              Destino
              <select
                className={selectCls}
                value={config.destination}
                onChange={(e) => set('destination', e.target.value as Destination)}
              >
                {(Object.keys(DEST_LABELS) as Destination[]).map((d) => (
                  <option key={d} value={d} disabled={!cloudConnected(d)}>
                    {DEST_LABELS[d]}
                    {!cloudConnected(d) ? ' (sin conectar)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
              Copias a conservar
              <input
                type="number"
                min={1}
                max={365}
                className={selectCls}
                value={config.retentionCount}
                onChange={(e) => set('retentionCount', Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeUploads}
              onChange={(e) => set('includeUploads', e.target.checked)}
              className="w-4 h-4"
            />
            <span>Incluir archivos adjuntos locales (storage/uploads) en el zip.</span>
          </label>

          <p className="text-[11px] text-slate-400 leading-snug">
            La hora es la hora local del servidor. Si el destino es Google Drive u OneDrive debe
            estar conectado en Ajustes → Almacenamiento; los backups se guardan en la carpeta
            «Keirost Backups».
          </p>

          <div className="flex items-center gap-3">
            <Button onClick={saveConfig} disabled={saving}>
              <Save size={15} className="mr-2" />
              {saving ? 'Guardando…' : 'Guardar programación'}
            </Button>
            <Button variant="secondary" onClick={runNow} disabled={launching}>
              <Play size={15} className="mr-2" />
              {launching ? 'Lanzando…' : 'Backup ahora'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Historial</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Todavía no hay backups.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Destino</th>
                    <th className="py-2 pr-3">Tamaño</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        {run.kind === 'scheduled' ? 'Programado' : 'Manual'}
                      </td>
                      <td className="py-2 pr-3">
                        {DEST_LABELS[run.destination] || run.destination}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatSize(run.sizeBytes)}</td>
                      <td className="py-2 pr-3">
                        {run.status === 'ok' && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                            <CheckCircle2 size={13} /> OK
                          </span>
                        )}
                        {run.status === 'running' && (
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-bold">
                            <Loader2 size={13} className="animate-spin" /> En curso
                          </span>
                        )}
                        {run.status === 'error' && (
                          <span
                            className="inline-flex items-center gap-1 text-rose-500 text-xs font-bold"
                            title={run.error || ''}
                          >
                            <XCircle size={13} /> Error
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {run.status === 'ok' && (
                          <>
                            <button
                              type="button"
                              onClick={() => download(run)}
                              title="Descargar"
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <Download size={15} />
                            </button>
                            {isSuperuser && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRestoreRun(run);
                                  setRestoreName('');
                                }}
                                title="Restaurar como empresa nueva"
                                className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                              >
                                <RotateCcw size={15} />
                              </button>
                            )}
                          </>
                        )}
                        {run.status !== 'running' && (
                          <button
                            type="button"
                            onClick={() => remove(run)}
                            title="Eliminar"
                            className="p-1.5 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {restoreRun && (
        <Card>
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <RotateCcw size={18} />
              <h3 className="text-lg font-bold">Restaurar backup</h3>
            </div>
            <div className="rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 p-4 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                La restauración crea una <strong>empresa nueva</strong> a partir del backup «
                {restoreRun.fileName}» — no sobrescribe la actual. Verifica la copia y después
                elimina o renombra la empresa antigua si procede.
              </span>
            </div>
            <Input
              label="Nombre de la nueva empresa"
              placeholder="Ej: ACME (restaurada)"
              value={restoreName}
              onChange={(e) => setRestoreName(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={restore} disabled={restoring}>
                <RotateCcw size={15} className="mr-2" />
                {restoring ? 'Restaurando…' : 'Restaurar'}
              </Button>
              <Button variant="secondary" onClick={() => setRestoreRun(null)} disabled={restoring}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
