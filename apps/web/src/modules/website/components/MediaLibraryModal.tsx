import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import {
  Badge,
  EmptyState,
  Input,
  Modal,
  SegmentedControl,
  Skeleton,
  usePopup,
  FileDropzone,
} from '@openfactu/ui';
import { Cloud, Folder, HardDrive, ImageOff, Pencil, Search, Trash2, Upload } from 'lucide-react';
import type { WebsiteAsset } from '../domain/website';
import { useMediaLibrary } from '../hooks/useMediaLibrary';
import type { MediaTypeFilter } from '../utils/mediaFilters';
import { AssetMetaEditor } from './AssetMetaEditor';

/** Claves de i18n (o nombres de marca, que `t` devuelve tal cual). */
const PROVIDER_LABELS: Record<string, string> = {
  local: 'website.media.providers.local',
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

/** `label` es una clave de i18n. */
const TYPE_TABS: { value: MediaTypeFilter; label: string }[] = [
  { value: 'all', label: 'website.media.types.all' },
  { value: 'image', label: 'website.media.types.image' },
  { value: 'video', label: 'website.media.types.video' },
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
  const { t } = useI18n();
  const popup = usePopup();
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
    const ok = await popup.confirm({
      title: t('website.media.deleteTitle'),
      message: t('website.media.deleteMessage', { name: asset.fileName }),
      tone: 'danger',
      confirmLabel: t('website.common.delete'),
    });
    if (!ok) return;
    remove(asset);
  };

  const toggleTag = (tag: string) => {
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag],
    }));
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('website.media.title')}
      subtitle={t('website.media.subtitle')}
      maxWidth="4xl"
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Input
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder={t('website.media.searchPlaceholder')}
            leftIcon={<Search size={14} />}
            inputSize="sm"
            containerClassName="flex-1"
          />
          <SegmentedControl<MediaTypeFilter>
            options={TYPE_TABS.map((o) => ({ ...o, label: t(o.label) }))}
            value={filters.type}
            onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
            size="sm"
            aria-label={t('website.media.filterByType')}
            className="shrink-0"
          />
          <FileDropzone
            variant="button"
            accept="image/*,video/*"
            label={t('website.media.upload')}
            icon={<Upload size={14} />}
            isUploading={uploading}
            uploadingLabel={t('website.media.uploading')}
            onFiles={(files) => {
              if (files[0]) upload(files[0]);
            }}
          />
        </div>

        {folders.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide mr-1">
              {t('website.media.folder')}
            </span>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, folder: null }))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                filters.folder === null
                  ? 'bg-primary text-primary-fg border-primary'
                  : 'border-border-default text-slate-500 hover:bg-bg-hover'
              }`}
            >
              {t('website.media.allFolders')}
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, folder }))}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1 ${
                  filters.folder === folder
                    ? 'bg-primary text-primary-fg border-primary'
                    : 'border-border-default text-slate-500 hover:bg-bg-hover'
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
                  : 'border-border-default text-slate-500 hover:bg-bg-hover'
              }`}
            >
              {t('website.media.noFolder')}
            </button>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide mr-1">
              {t('website.media.tags')}
            </span>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  filters.tags.includes(tag)
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'border-border-default text-slate-500 hover:bg-bg-hover'
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
              <div key={i} className="rounded-lg overflow-hidden border border-border-default">
                <Skeleton className="h-28 w-full rounded-none" />
                <div className="p-2 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={<ImageOff size={28} />}
            title={t('website.media.empty')}
            hint={t('website.media.emptyHint')}
          />
        ) : assets.length === 0 ? (
          <EmptyState icon={<Search size={28} />} title={t('website.media.noMatch')} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1">
            {assets.map((asset) => (
              <div key={asset.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(asset.publicUrl)}
                  className="group relative w-full rounded-lg overflow-hidden border border-border-default hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all text-left bg-bg-muted"
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
                    <p className="text-[11px] font-bold text-fg-body truncate">{asset.fileName}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {asset.provider === 'local' ? (
                        <HardDrive size={10} className="text-slate-400" />
                      ) : (
                        <Cloud size={10} className="text-sky-500" />
                      )}
                      <Badge variant="neutral" className="text-[9px]">
                        {PROVIDER_LABELS[asset.provider]
                          ? t(PROVIDER_LABELS[asset.provider])
                          : asset.provider}
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
                    className="absolute top-1.5 right-8 p-1.5 rounded-lg bg-bg-card text-slate-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil size={13} />
                  </span>
                  <span
                    role="button"
                    onClick={(e) => handleDelete(asset, e)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-bg-card text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
