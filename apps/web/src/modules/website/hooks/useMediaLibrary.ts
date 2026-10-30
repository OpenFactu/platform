import { t } from '@/i18n/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { websiteApi } from '../api/websiteApi';
import type { WebsiteAsset } from '../domain/website';
import {
  collectFolders,
  collectTags,
  EMPTY_MEDIA_FILTERS,
  filterAssets,
  type MediaFilterState,
} from '../utils/mediaFilters';

/**
 * Estado + llamadas API de la biblioteca de medios, separado del componente
 * modal: fetch/subida/borrado/metadatos y el filtrado (delegado a las
 * funciones puras de mediaFilters).
 */
export function useMediaLibrary(open: boolean) {
  const toast = useToast();
  const [assets, setAssets] = useState<WebsiteAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<MediaFilterState>(EMPTY_MEDIA_FILTERS);

  const fetchAssets = async () => {
    try {
      setAssets(await websiteApi.listAssets());
    } catch {
      toast.error(t('website.media.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchAssets();
    } else {
      // Al cerrar, limpiar filtros para la próxima apertura
      setFilters(EMPTY_MEDIA_FILTERS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await websiteApi.uploadAsset(file, filters.folder || undefined);
      setAssets((a) => [asset, ...a]);
      toast.success(t('website.media.uploaded'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.media.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (asset: WebsiteAsset) => {
    try {
      await websiteApi.deleteAsset(asset.id);
      setAssets((a) => a.filter((x) => x.id !== asset.id));
    } catch {
      toast.error(t('website.media.deleteError'));
    }
  };

  const updateMeta = async (
    asset: WebsiteAsset,
    patch: { folder?: string | null; tags?: string[] },
  ) => {
    try {
      const updated = await websiteApi.updateAssetMeta(asset.id, patch);
      setAssets((a) => a.map((x) => (x.id === asset.id ? updated : x)));
      toast.success(t('website.media.updated'));
    } catch {
      toast.error(t('website.media.updateError'));
    }
  };

  const folders = useMemo(() => collectFolders(assets), [assets]);
  const tags = useMemo(() => collectTags(assets), [assets]);
  const filtered = useMemo(() => filterAssets(assets, filters), [assets, filters]);

  return {
    assets: filtered,
    totalCount: assets.length,
    folders,
    tags,
    filters,
    setFilters,
    loading,
    uploading,
    upload,
    remove,
    updateMeta,
  };
}
