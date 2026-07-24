import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, Loader, Modal, useToast } from '@openfactu/ui';
import { Cloud, HardDrive, Trash2, Upload } from 'lucide-react';
import { websiteApi } from '../api/websiteApi';
import type { WebsiteAsset } from '../domain/website';

const PROVIDER_LABELS: Record<string, string> = {
  local: 'Servidor',
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama con la URL pública del medio elegido. */
  onSelect: (url: string) => void;
}

/**
 * Biblioteca de medios de la web: los archivos viven en el almacenamiento
 * configurado por la empresa (local, Google Drive, OneDrive — StorageResolver
 * del server decide) y se sirven por la URL pública del site.
 */
export const MediaLibraryModal: React.FC<Props> = ({ open, onClose, onSelect }) => {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<WebsiteAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchAssets = async () => {
    try {
      setAssets(await websiteApi.listAssets());
    } catch {
      toast.error('Error al cargar la biblioteca');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await websiteApi.uploadAsset(file);
      setAssets((a) => [asset, ...a]);
      toast.success('Imagen subida');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: WebsiteAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${asset.fileName}" de la biblioteca?`)) return;
    try {
      await websiteApi.deleteAsset(asset.id);
      setAssets((a) => a.filter((x) => x.id !== asset.id));
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Biblioteca de medios"
      subtitle="Los archivos se guardan en el almacenamiento configurado en Ajustes → Almacenamiento (servidor, Google Drive u OneDrive)."
      maxWidth="4xl"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload size={14} className="mr-2" /> {uploading ? 'Subiendo…' : 'Subir imagen o vídeo'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleUpload(file);
            }}
          />
        </div>

        {loading ? (
          <Loader />
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            La biblioteca está vacía. Sube tu primera imagen.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset.publicUrl)}
                className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-teal-500 hover:ring-2 hover:ring-teal-500/30 transition-all text-left bg-slate-50 dark:bg-slate-800"
              >
                {asset.mime.startsWith('video/') ? (
                  <video
                    src={asset.publicUrl}
                    muted
                    preload="metadata"
                    className="w-full h-28 object-cover bg-black"
                  />
                ) : (
                  <img
                    src={asset.publicUrl}
                    alt={asset.fileName}
                    loading="lazy"
                    className="w-full h-28 object-cover"
                  />
                )}
                <div className="p-2">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                    {asset.fileName}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {asset.provider === 'local' ? (
                      <HardDrive size={10} className="text-slate-400" />
                    ) : (
                      <Cloud size={10} className="text-sky-500" />
                    )}
                    <Badge variant="neutral" className="text-[9px]">
                      {PROVIDER_LABELS[asset.provider] ?? asset.provider}
                    </Badge>
                  </div>
                </div>
                <span
                  role="button"
                  onClick={(e) => handleDelete(asset, e)}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={13} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
