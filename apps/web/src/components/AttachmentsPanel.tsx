/**
 * Panel reutilizable de adjuntos. Lista los archivos vinculados a una entidad
 * (entityType + entityId), permite drag-and-drop o click para subir, descargar
 * y borrar. Compatible con cualquier entidad del ERP — el endpoint
 * `/api/attachments` es genérico.
 *
 * Uso típico:
 *   <AttachmentsPanel entityType="SalesInvoice" entityId={inv.id} />
 *
 * El backend físico (local, Drive, OneDrive) lo decide el StorageResolver
 * server-side según la config del tenant — el front no se entera.
 */

import { coreApi } from '@/shared/api';
import React, { useCallback, useEffect, useState } from 'react';
import { Paperclip, Upload, Trash2, Download, FileText } from 'lucide-react';
import { FileDropzone } from '@openfactu/ui';
import { useAuth } from '../context/AuthContext';

interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mime: string;
  size: number;
  provider: 'local' | 'gdrive' | 'onedrive';
  externalId: string;
  uploadedBy: string | null;
  uploadedAt: string;
  deletedAt: string | null;
}

interface Props {
  entityType: string;
  entityId: string;
  /** Si true, se renderiza compacto (sin card y sin título). Default false. */
  compact?: boolean;
  /** Texto de la cabecera. Default "Adjuntos". */
  title?: string;
}

export const AttachmentsPanel: React.FC<Props> = ({
  entityType,
  entityId,
  compact = false,
  title = 'Adjuntos',
}) => {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': user?.tenantId ?? '',
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await coreApi.raw(
        'GET',
        `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(res.data);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar adjuntos');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, token, user?.tenantId]);

  useEffect(() => {
    if (entityId) refresh();
  }, [entityId, refresh]);

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        await coreApi.postForm(
          `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
          fd,
        );
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Error al subir');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('¿Eliminar este adjunto?')) return;
    try {
      const res = await coreApi.raw('DELETE', `/api/attachments/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Error al borrar');
    }
  };

  const onDownload = (a: Attachment) => {
    const tenantId = user?.tenantId ?? '';
    // Forzamos descarga vía `<a>` con headers no posibles → usamos fetch
    // y blob para preservar la auth del JWT.
    coreApi
      .getBlob(`/api/attachments/${a.id}/download`)
      .then(({ blob }) => blob)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      })
      .catch((e) => setError(e?.message || 'Error al descargar'));
  };

  const inner = (
    <>
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-fg-body">
            <Paperclip size={16} />
            <h3 className="text-sm font-bold uppercase tracking-wider">{title}</h3>
            <span className="text-xs text-fg-subtle">({items.length})</span>
          </div>
        </div>
      )}

      {/* El FileDropzone del paquete trae el arrastrar y soltar, el input
          oculto, el estado "subiendo" y el resalte al arrastrar encima, que
          aquí estaban a mano (y con el azul fijo de Tailwind). */}
      <FileDropzone
        className="mt-2"
        variant="inline"
        multiple
        acceptPaste
        isUploading={uploading}
        uploadingLabel="Subiendo…"
        label="Arrastra archivos aquí o haz clic para seleccionar"
        icon={<Upload size={16} />}
        onFiles={(files) => upload(files)}
        error={error || undefined}
      />

      {loading ? (
        <div className="mt-3 text-xs text-fg-subtle italic">Cargando adjuntos…</div>
      ) : items.length === 0 ? (
        <div className="mt-3 text-xs text-fg-subtle italic">Sin adjuntos.</div>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded border border-border-default bg-bg-card hover:bg-bg-hover"
            >
              <FileText size={14} className="text-fg-subtle shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-fg-body truncate">{a.fileName}</div>
                <div className="text-[10px] text-fg-subtle flex items-center gap-2">
                  <span>{formatBytes(a.size)}</span>
                  <span>·</span>
                  <span className="font-mono">{a.provider}</span>
                  <span>·</span>
                  <span>{new Date(a.uploadedAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDownload(a)}
                title="Descargar"
                className="p-1.5 rounded-xs hover:bg-bg-hover text-fg-subtle hover:text-accent"
              >
                <Download size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                title="Eliminar"
                className="p-1.5 rounded-xs hover:bg-danger-bg text-fg-subtle hover:text-danger-fg"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (compact) return <div>{inner}</div>;

  return <div className="rounded-xl border border-border-default bg-bg-card p-4">{inner}</div>;
};

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
