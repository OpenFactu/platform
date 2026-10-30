/**
 * Tab "Importar/Exportar" — datos del ERP y empresas completas.
 *
 *  - Exportar empresa actual: descarga zip (schema + data + uploads).
 *  - Importar empresa: sube zip y crea tenant nuevo con el nombre que tú elijas.
 *  - Exportar datos en CSV: zip con un CSV por entidad para migrar a otro ERP.
 *
 * Endpoints solo disponibles para SUPERUSER (el backend devuelve 403 al resto).
 */

import { coreApi } from '@/shared/api';
import { apiClient } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Checkbox,
  FileDropzone,
  SearchableSelect,
  useToast,
  Progress,
} from '@openfactu/ui';
import { Download, Upload, FileSpreadsheet, AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

export const DataTransferTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  // ADMIN exporta su propio tenant, SUPERUSER cualquiera. Otros roles bloqueados.
  const role = user?.role;
  const canUse = role === 'ADMIN' || role === 'SUPERUSER';
  const isSuperuser = role === 'SUPERUSER';

  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    pct: number;
    loadedMB: number;
    totalMB: number;
  } | null>(null);
  const [includeUploads, setIncludeUploads] = useState(true);
  const [importName, setImportName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

  // Lista de empresas accesibles para que SUPERUSER pueda elegir cuál exportar.
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [exportTenantId, setExportTenantId] = useState<string>('');

  const loadTenants = () =>
    coreApi
      .get('/api/tenants/mine')
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setTenants(arr);
        setExportTenantId((prev) => (arr.some((t) => t.id === prev) ? prev : arr[0]?.id || ''));
      })
      .catch(() => {});

  useEffect(() => {
    loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Borrado de empresa (zona de peligro) ──────────────────────────────
  // Selector independiente del de "Exportar" a propósito: elegir la empresa
  // a borrar nunca debe depender de qué había seleccionado arriba, para no
  // arriesgarse a borrar la empresa equivocada por descuido.
  const [deleteTenantId, setDeleteTenantId] = useState<string>('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deleteTenant = tenants.find((t) => t.id === deleteTenantId);

  useEffect(() => {
    setDeleteTenantId((prev) => (tenants.some((t) => t.id === prev) ? prev : ''));
  }, [tenants]);

  const doDelete = async () => {
    if (!deleteTenant) return;
    if (deleteConfirmText !== deleteTenant.name) {
      toast.error(t('settingsCompany.dataTransfer.nameMismatch'));
      return;
    }
    setDeleting(true);
    try {
      const res = await coreApi.raw('DELETE', `/api/admin/tenants/${deleteTenant.id}`, {
        confirmName: deleteConfirmText,
      });
      const body = res.data ?? {};
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(t('settingsCompany.dataTransfer.deleted', { name: deleteTenant.name }));
      setDeleteConfirmText('');
      setDeleteTenantId('');
      await loadTenants();
    } catch (e) {
      toast.error(
        t('settingsCompany.dataTransfer.deleteError', {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Descarga con barra de progreso real. Lee el cuerpo de la respuesta como
   * stream y va sumando bytes hasta el `Content-Length` que mande el server.
   * Si el server no manda Content-Length (algunos casos chunked) la barra se
   * queda en modo indeterminado pero el download sigue.
   */
  const downloadFile = async (url: string, suggestedName: string, label: string) => {
    setBusy(label);
    setProgress({ pct: 0, loadedMB: 0, totalMB: 0 });
    try {
      const res = await apiClient.getStream(url);
      const total = Number(res.headers.get('Content-Length') || '0');
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      if (reader) {
        // Stream loop con actualización de progreso por chunk.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            setProgress({
              pct: total ? Math.min(100, Math.round((loaded * 100) / total)) : 0,
              loadedMB: loaded / 1024 / 1024,
              totalMB: total / 1024 / 1024,
            });
          }
        }
      }
      const blob = new Blob(chunks as any, {
        type: res.headers.get('Content-Type') || 'application/octet-stream',
      });
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = suggestedName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 30_000);
      toast.success(t('settingsCompany.dataTransfer.ready', { label: t(label) }));
    } catch (e) {
      toast.error(
        t('settingsCompany.dataTransfer.downloadError', {
          label: t(label),
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  /**
   * Importación con barra de progreso de subida. Usamos XHR porque fetch no
   * expone el upload progress. Cuando termina la subida, esperamos la
   * respuesta JSON con el tenantId nuevo.
   */
  const doImport = () => {
    if (!importFile) {
      toast.error(t('settingsCompany.dataTransfer.chooseZip'));
      return;
    }
    if (!importName.trim()) {
      toast.error(t('settingsCompany.dataTransfer.nameRequired'));
      return;
    }
    setBusy('import');
    setProgress({ pct: 0, loadedMB: 0, totalMB: importFile.size / 1024 / 1024 });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/tenants/import?name=${encodeURIComponent(importName.trim())}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token ?? ''}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setProgress({
          pct: Math.round((ev.loaded * 100) / ev.total),
          loadedMB: ev.loaded / 1024 / 1024,
          totalMB: ev.total / 1024 / 1024,
        });
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          toast.success(
            t('settingsCompany.dataTransfer.imported', { name: importName, id: body.tenantId }),
          );
          setImportFile(null);
          setImportName('');
        } else {
          toast.error(
            t('settingsCompany.dataTransfer.importFailed', {
              error: body?.error || `HTTP ${xhr.status}`,
            }),
          );
        }
      } catch {
        toast.error(
          t('settingsCompany.dataTransfer.importFailed', { error: `HTTP ${xhr.status}` }),
        );
      } finally {
        setBusy(null);
        setProgress(null);
      }
    };
    xhr.onerror = () => {
      toast.error(t('settingsCompany.dataTransfer.networkError'));
      setBusy(null);
      setProgress(null);
    };
    const fd = new FormData();
    fd.append('file', importFile);
    xhr.send(fd);
  };

  if (!canUse) {
    return (
      <Card>
        <div className="p-6 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <strong>{t('settingsCompany.dataTransfer.restrictedTitle')}</strong>{' '}
            {t('settingsCompany.dataTransfer.restrictedBody')}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-fg-body">
            <Download size={18} />
            <h2 className="text-lg font-bold">{t('settingsCompany.dataTransfer.exportCompany')}</h2>
          </div>
          <p className="text-sm text-fg-muted leading-snug">
            {t('settingsCompany.dataTransfer.exportHelpBefore')}
            <code>.zip</code>
            {t('settingsCompany.dataTransfer.exportHelpAfter')}
          </p>
          <div className="flex items-center gap-2">
            {/* Lista dinámica de servidor → SearchableSelect. */}
            <div className="flex-1">
              <SearchableSelect
                options={tenants.map((t) => ({ value: t.id, label: t.name }))}
                value={exportTenantId}
                onChange={setExportTenantId}
                placeholder={t('settingsCompany.dataTransfer.chooseCompany')}
              />
            </div>
            <Button
              onClick={() =>
                downloadFile(
                  `/api/admin/tenants/${exportTenantId}/export?includeUploads=${includeUploads ? 'true' : 'false'}`,
                  `tenant_${exportTenantId}.zip`,
                  'settingsCompany.dataTransfer.exportCompany',
                )
              }
              disabled={!exportTenantId || busy === 'settingsCompany.dataTransfer.exportCompany'}
            >
              <Download size={14} className="mr-2" />
              {busy === 'settingsCompany.dataTransfer.exportCompany'
                ? t('settingsCompany.dataTransfer.exporting')
                : t('settingsCompany.dataTransfer.export')}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-body cursor-pointer">
            <Checkbox checked={includeUploads} onChange={setIncludeUploads} />
            <span>{t('settingsCompany.dataTransfer.includeUploads')}</span>
          </label>
          {busy === 'settingsCompany.dataTransfer.exportCompany' && progress && (
            <ProgressBar progress={progress} />
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-fg-body">
            <Upload size={18} />
            <h2 className="text-lg font-bold">{t('settingsCompany.dataTransfer.importTitle')}</h2>
          </div>
          <p className="text-sm text-fg-muted leading-snug">
            {t('settingsCompany.dataTransfer.importHelp')}
          </p>
          <Input
            label={t('settingsCompany.dataTransfer.newName')}
            placeholder={t('settingsCompany.dataTransfer.newNamePlaceholder')}
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          />
          {/* Zona de subida visible del backup: FileDropzone acepta también
              arrastrar el .zip y muestra el archivo elegido con su tamaño. */}
          <FileDropzone
            accept=".zip"
            label={t('settingsCompany.dataTransfer.dropLabel')}
            hint={t('settingsCompany.dataTransfer.dropHint')}
            files={importFile ? [importFile] : []}
            onFiles={(files) => setImportFile(files[0] ?? null)}
            onRemoveFile={() => setImportFile(null)}
            onReject={() => toast.error(t('settingsCompany.dataTransfer.onlyZip'))}
            disabled={busy === 'import'}
          />
          <Button onClick={doImport} disabled={busy === 'import' || !importFile}>
            <Upload size={14} className="mr-2" />
            {busy === 'import'
              ? t('settingsCompany.dataTransfer.importing')
              : t('settingsCompany.dataTransfer.import')}
          </Button>
          {busy === 'import' && progress && <ProgressBar progress={progress} />}
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-fg-body">
            <FileSpreadsheet size={18} />
            <h2 className="text-lg font-bold">{t('settingsCompany.dataTransfer.csvTitle')}</h2>
          </div>
          <p className="text-sm text-fg-muted leading-snug">
            {t('settingsCompany.dataTransfer.csvHelp')}
          </p>
          <Button
            onClick={() =>
              downloadFile(
                `/api/admin/tenants/${exportTenantId}/export-data`,
                `erp_data_${exportTenantId}.zip`,
                'settingsCompany.dataTransfer.exportCsv',
              )
            }
            disabled={!exportTenantId || busy === 'settingsCompany.dataTransfer.exportCsv'}
          >
            <FileSpreadsheet size={14} className="mr-2" />
            {busy === 'settingsCompany.dataTransfer.exportCsv'
              ? t('settingsCompany.dataTransfer.exporting')
              : t('settingsCompany.dataTransfer.exportCsv')}
          </Button>
          {busy === 'settingsCompany.dataTransfer.exportCsv' && progress && (
            <ProgressBar progress={progress} />
          )}
        </div>
      </Card>

      {isSuperuser && (
        <Card>
          <div className="p-6 space-y-3 border-2 border-rose-200 dark:border-rose-900 rounded-lg -m-px">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Trash2 size={18} />
              <h2 className="text-lg font-bold">{t('settingsCompany.dataTransfer.dangerTitle')}</h2>
            </div>
            <p className="text-sm text-fg-muted leading-snug">
              {t('settingsCompany.dataTransfer.dangerBefore')}
              <strong>{t('settingsCompany.dataTransfer.dangerStrong')}</strong>
              {t('settingsCompany.dataTransfer.dangerAfter')}
            </p>
            {/* `clearable`: dejarlo sin empresa elegida es un estado válido (y el
                más seguro) en la zona de peligro. */}
            <SearchableSelect
              options={tenants.map((t) => ({ value: t.id, label: t.name }))}
              value={deleteTenantId}
              onChange={(v) => {
                setDeleteTenantId(v);
                setDeleteConfirmText('');
              }}
              placeholder={t('settingsCompany.dataTransfer.chooseCompany')}
              clearable
            />
            {deleteTenant && (
              <>
                <p className="text-xs text-fg-body">
                  {t('settingsCompany.dataTransfer.confirmName')}{' '}
                  <code className="font-bold">{deleteTenant.name}</code>
                </p>
                <Input
                  placeholder={deleteTenant.name}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
                <Button
                  variant="danger"
                  onClick={doDelete}
                  disabled={deleting || deleteConfirmText !== deleteTenant.name}
                >
                  <Trash2 size={14} className="mr-2" />
                  {deleting
                    ? t('settingsCompany.dataTransfer.deleting')
                    : t('settingsCompany.dataTransfer.deleteForever', { name: deleteTenant.name })}
                </Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

/**
 * Barra de progreso compartida entre las 3 acciones. Muestra MB cargados/totales
 * y porcentaje cuando hay Content-Length disponible. Si no, modo indeterminado.
 */
const ProgressBar: React.FC<{
  progress: { pct: number; loadedMB: number; totalMB: number };
}> = ({ progress }) => {
  const { t } = useI18n();
  const determinate = progress.totalMB > 0;
  return (
    <div className="space-y-1">
      <Progress
        size="sm"
        value={determinate ? progress.pct : undefined}
        indeterminate={!determinate}
      />
      <div className="text-[10px] text-fg-muted font-mono">
        {determinate
          ? `${progress.loadedMB.toFixed(1)} / ${progress.totalMB.toFixed(1)} MB · ${progress.pct}%`
          : t('settingsCompany.dataTransfer.transferred', { mb: progress.loadedMB.toFixed(1) })}
      </div>
    </div>
  );
};
