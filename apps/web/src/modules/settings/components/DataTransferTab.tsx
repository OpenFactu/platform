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
import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { Download, Upload, FileSpreadsheet, AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const DataTransferTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lista de empresas accesibles para que SUPERUSER pueda elegir cuál exportar.
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [exportTenantId, setExportTenantId] = useState<string>('');

  const loadTenants = () =>
    coreApi.get('/api/tenants/mine')
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
      toast.error('El nombre no coincide');
      return;
    }
    setDeleting(true);
    try {
      const res = await coreApi.raw('DELETE', `/api/admin/tenants/${deleteTenant.id}`, { confirmName: deleteConfirmText });
      const body = (res.data ?? {});
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(`Empresa "${deleteTenant.name}" eliminada`);
      setDeleteConfirmText('');
      setDeleteTenantId('');
      await loadTenants();
    } catch (e) {
      toast.error(`Error al eliminar: ${e instanceof Error ? e.message : String(e)}`);
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
      toast.success(`${label} listo`);
    } catch (e) {
      toast.error(`Error en ${label}: ${e instanceof Error ? e.message : String(e)}`);
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
      toast.error('Elige un fichero .zip antes');
      return;
    }
    if (!importName.trim()) {
      toast.error('Indica el nombre de la nueva empresa');
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
          toast.success(`Empresa "${importName}" importada (id: ${body.tenantId})`);
          setImportFile(null);
          setImportName('');
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          toast.error(`Importación falló: ${body?.error || `HTTP ${xhr.status}`}`);
        }
      } catch {
        toast.error(`Importación falló: HTTP ${xhr.status}`);
      } finally {
        setBusy(null);
        setProgress(null);
      }
    };
    xhr.onerror = () => {
      toast.error('Error de red al importar');
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
            <strong>Acceso restringido.</strong> Necesitas rol ADMIN o SUPERUSER para importar y
            exportar empresas.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Download size={18} />
            <h2 className="text-lg font-bold">Exportar empresa</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            Descarga un fichero <code>.zip</code> con el esquema, datos y adjuntos locales de la
            empresa elegida. Útil para backups o para mover la empresa a otra instalación de
            Keirost.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={exportTenantId}
              onChange={(e) => setExportTenantId(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button
              onClick={() =>
                downloadFile(
                  `/api/admin/tenants/${exportTenantId}/export?includeUploads=${includeUploads ? 'true' : 'false'}`,
                  `tenant_${exportTenantId}.zip`,
                  'Exportar empresa',
                )
              }
              disabled={!exportTenantId || busy === 'Exportar empresa'}
            >
              <Download size={14} className="mr-2" />
              {busy === 'Exportar empresa' ? 'Exportando…' : 'Exportar'}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeUploads}
              onChange={(e) => setIncludeUploads(e.target.checked)}
              className="w-4 h-4"
            />
            <span>
              Incluir archivos adjuntos (storage/uploads). Desactiva si solo quieres datos y el zip
              pesa demasiado.
            </span>
          </label>
          {busy === 'Exportar empresa' && progress && <ProgressBar progress={progress} />}
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Upload size={18} />
            <h2 className="text-lg font-bold">Importar empresa desde .zip</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            Crea una empresa nueva a partir de un export. Puedes elegir un nombre distinto al
            original — se aplicará al nuevo schema y al display name. Útil para tener una copia de
            debug ("Empresa-test", "Empresa-2026", etc.) sin tocar la original.
          </p>
          <Input
            label="Nombre de la nueva empresa"
            placeholder="Ej: ACME Test"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-200 hover:file:bg-blue-100"
          />
          <Button onClick={doImport} disabled={busy === 'import' || !importFile}>
            <Upload size={14} className="mr-2" />
            {busy === 'import' ? 'Importando…' : 'Importar empresa'}
          </Button>
          {busy === 'import' && progress && <ProgressBar progress={progress} />}
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <FileSpreadsheet size={18} />
            <h2 className="text-lg font-bold">Exportar datos en CSV (otro ERP)</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            Descarga un zip con un CSV por cada entidad principal (clientes, items, facturas,
            albaranes, pedidos…). Formato genérico para que cualquier otro ERP importe los datos.
            Una vez exportado, ya no es responsabilidad nuestra cómo los procesa el destino.
          </p>
          <Button
            onClick={() =>
              downloadFile(
                `/api/admin/tenants/${exportTenantId}/export-data`,
                `erp_data_${exportTenantId}.zip`,
                'Exportar CSV',
              )
            }
            disabled={!exportTenantId || busy === 'Exportar CSV'}
          >
            <FileSpreadsheet size={14} className="mr-2" />
            {busy === 'Exportar CSV' ? 'Exportando…' : 'Exportar CSV'}
          </Button>
          {busy === 'Exportar CSV' && progress && <ProgressBar progress={progress} />}
        </div>
      </Card>

      {isSuperuser && (
        <Card>
          <div className="p-6 space-y-3 border-2 border-rose-200 dark:border-rose-900 rounded-lg -m-px">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Trash2 size={18} />
              <h2 className="text-lg font-bold">Zona de peligro — Eliminar empresa</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
              Borra la empresa elegida de forma <strong>permanente</strong>: su schema completo
              (documentos, stock, contabilidad, usuarios asociados…) y sus archivos locales. No hay
              marcha atrás salvo que tengas un backup — expórtala o haz un backup primero si no
              estás seguro.
            </p>
            <select
              value={deleteTenantId}
              onChange={(e) => {
                setDeleteTenantId(e.target.value);
                setDeleteConfirmText('');
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="">— Elige una empresa —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {deleteTenant && (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Para confirmar, escribe el nombre exacto de la empresa:{' '}
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
                  {deleting ? 'Eliminando…' : `Eliminar "${deleteTenant.name}" definitivamente`}
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
  const determinate = progress.totalMB > 0;
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        {determinate ? (
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${progress.pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-blue-600 animate-pulse" />
        )}
      </div>
      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
        {determinate
          ? `${progress.loadedMB.toFixed(1)} / ${progress.totalMB.toFixed(1)} MB · ${progress.pct}%`
          : `${progress.loadedMB.toFixed(1)} MB transferidos…`}
      </div>
    </div>
  );
};
