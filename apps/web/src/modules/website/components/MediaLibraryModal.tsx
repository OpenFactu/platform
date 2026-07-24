import React, { useRef, useState } from 'react';
import { Badge, Button, Input, Modal, Skeleton } from '@openfactu/ui';
import { Cloud, Folder, HardDrive, Pencil, Search, Trash2, Upload } from 'lucide-react';
import type { WebsiteAsset } from '../domain/website';
import { useMediaLibrary } from '../hooks/useMediaLibrary';
import type { MediaTypeFilter } from '../utils/mediaFilters';
import { AssetMetaEditor } from './AssetMetaEditor';

const PROVIDER_LABELS: Record<string, string> = {
  local: 'Servidor',
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

const TYPE_TABS: { value: MediaTypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'image', label: 'Imágenes' },
  { value: 'video', label: 'Vídeos' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama con la URL pública del medio elegido. */
  onSelect: (url: string) => void;
}

/**
 * Biblioteca de medios de la web: buscador, filtro por tipo, carpetas y
 * etiquetas (chips), edición de metadatos por archivo. Los archivos viven en
 * el almacenamiento configurado por la empresa (local, Google Drive, OneDrive
 * — StorageResolver del server decide) y se sirven por la URL pública del site.
 */
export const MediaLibraryModal: React.FC<Props> = ({ open, onClose, onSelect }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    assets,
    totalCount,
    folders,
    tags,
    filters,
    setFilters,
    loading,
    uploading,
    upload,
    remove,
    updateMeta,
  } = useMediaLibrary(open);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleDelete = async (asset: WebsiteAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${asset.fileName}" de la biblioteca?`)) return;
    remove(asset);
  };

  const toggleTag = (tag: string) => {
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Biblioteca de medios"
      subtitle="Los archivos se guardan en el almacenamiento configurado en Ajustes → Almacenamiento (servidor, Google Drive u OneDrive)."
      maxWidth="4xl"
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Buscar por nombre de archivo…"
              className="pl-8 h-9"
            />
          </div>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, type: tab.value }))}
                className={`px-3 h-9 text-xs font-bold transition-colors ${
                  filters.type === tab.value
                    ? 'bg-primary text-primary-fg'
                    : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload size={14} className="mr-2" /> {uploading ? 'Subiendo…' : 'Subir'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
        </div>

        {folders.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide mr-1">
              Carpeta
            </span>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, folder: null }))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                filters.folder === null
                  ? 'bg-primary text-primary-fg border-primary'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Todas
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, folder }))}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1 ${
                  filters.folder === folder
                    ? 'bg-primary text-primary-fg border-primary'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Folder size={10} /> {folder}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, folder: '' }))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                filters.folder === ''
                  ? 'bg-primary text-primary-fg border-primary'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Sin carpeta
            </button>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide mr-1">
              Etiquetas
            </span>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  filters.tags.includes(tag)
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
              >
                <Skeleton className="h-28 w-full rounded-none" />
                <div className="p-2 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="py-12 text-center text-slate-400">
            La biblioteca está vacía. Sube tu primer archivo.
          </div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            Ningún archivo coincide con los filtros.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1">
            {assets.map((asset) => (
              <div key={asset.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(asset.publicUrl)}
                  className="group relative w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all text-left bg-slate-50 dark:bg-slate-800"
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
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {asset.provider === 'local' ? (
                        <HardDrive size={10} className="text-slate-400" />
                      ) : (
                        <Cloud size={10} className="text-sky-500" />
                      )}
                      <Badge variant="neutral" className="text-[9px]">
                        {PROVIDER_LABELS[asset.provider] ?? asset.provider}
                      </Badge>
                      {asset.folder && (
                        <Badge variant="info" className="text-[9px]">
                          {asset.folder}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(asset.id);
                    }}
                    className="absolute top-1.5 right-8 p-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil size={13} />
                  </span>
                  <span
                    role="button"
                    onClick={(e) => handleDelete(asset, e)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </span>
                </button>
                {editingId === asset.id && (
                  <AssetMetaEditor
                    asset={asset}
                    onSave={(patch) => updateMeta(asset, patch)}
                    onClose={() => setEditingId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
