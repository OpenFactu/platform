import type { WebsiteAsset } from '../domain/website';

export type MediaTypeFilter = 'all' | 'image' | 'video';

export interface MediaFilterState {
  query: string;
  type: MediaTypeFilter;
  /** null = todas las carpetas; '' = sin carpeta; string = esa carpeta. */
  folder: string | null;
  /** OR entre las etiquetas seleccionadas. */
  tags: string[];
}

export const EMPTY_MEDIA_FILTERS: MediaFilterState = {
  query: '',
  type: 'all',
  folder: null,
  tags: [],
};

function assetType(asset: WebsiteAsset): 'image' | 'video' {
  return asset.mime.startsWith('video/') ? 'video' : 'image';
}

/** Filtra la lista de assets por búsqueda de texto, tipo, carpeta y etiquetas. */
export function filterAssets(assets: WebsiteAsset[], filters: MediaFilterState): WebsiteAsset[] {
  const q = filters.query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (q && !asset.fileName.toLowerCase().includes(q)) return false;
    if (filters.type !== 'all' && assetType(asset) !== filters.type) return false;
    if (filters.folder !== null && (asset.folder ?? '') !== filters.folder) return false;
    if (filters.tags.length > 0) {
      const assetTags = asset.tags ?? [];
      if (!filters.tags.some((t) => assetTags.includes(t))) return false;
    }
    return true;
  });
}

/** Carpetas distintas presentes en la biblioteca, ordenadas alfabéticamente. */
export function collectFolders(assets: WebsiteAsset[]): string[] {
  const set = new Set<string>();
  for (const a of assets) if (a.folder) set.add(a.folder);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Etiquetas distintas presentes en la biblioteca, ordenadas alfabéticamente. */
export function collectTags(assets: WebsiteAsset[]): string[] {
  const set = new Set<string>();
  for (const a of assets) for (const t of a.tags ?? []) set.add(t);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
