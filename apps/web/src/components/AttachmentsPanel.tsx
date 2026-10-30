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
import { Paperclip, Upload } from 'lucide-react';
import { AttachmentList, FileDropzone, Skeleton, usePopup } from '@openfactu/ui';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';

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
  title: titleProp,
}) => {
  const { t } = useI18n();
  const title = titleProp ?? t('app.attachments.title');
  const { token, user } = useAuth();
  const popup = usePopup();
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
      setError(e?.message || t('app.attachments.loadError'));
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
      setError(e?.message || t('app.attachments.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: t('app.attachments.deleteTitle'),
      message: t('app.common.cannotUndo'),
      tone: 'danger',
      confirmLabel: t('app.common.delete'),
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', `/api/attachments/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e: any) {
      setError(e?.message || t('app.attachments.deleteError'));
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
      .catch((e) => setError(e?.message || t('app.attachments.downloadError')));
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
        uploadingLabel={t('app.attachments.uploading')}
        label={t('app.attachments.dropLabel')}
        icon={<Upload size={16} />}
        onFiles={(files) => upload(files)}
        error={error || undefined}
      />

      {/* AttachmentList del paquete: nombre, tamaño, descargar y quitar, con
          el estado vacío; antes era una <ul> con botones a mano. */}
      {loading ? (
        <Skeleton height={44} className="mt-3" />
      ) : (
        <AttachmentList
          className="mt-3"
          aria-label={title}
          emptyMessage={t('app.attachments.empty')}
          items={items.map((a) => ({
            id: a.id,
            name: a.fileName,
            size: a.size,
            description: `${a.provider} · ${formatDateTime(a.uploadedAt)}`,
          }))}
          onDownload={(item) => {
            const a = items.find((x) => x.id === item.id);
            if (a) onDownload(a);
          }}
          onRemove={(item) => void onDelete(item.id)}
        />
      )}
    </>
  );

  if (compact) return <div>{inner}</div>;

  return <div className="rounded-lg border border-border-default bg-bg-card p-4">{inner}</div>;
};
