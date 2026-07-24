import React, { useState } from 'react';
import { Button } from '@openfactu/ui';
import type { WebsiteAsset } from '../domain/website';

interface Props {
  asset: WebsiteAsset;
  onSave: (patch: { folder?: string | null; tags?: string[] }) => void;
  onClose: () => void;
}

/** Popover compacto para editar la carpeta y las etiquetas de un asset. */
export const AssetMetaEditor: React.FC<Props> = ({ asset, onSave, onClose }) => {
  const [folder, setFolder] = useState(asset.folder ?? '');
  const [tagsText, setTagsText] = useState((asset.tags ?? []).join(', '));

  const handleSave = () => {
    onSave({
      folder: folder.trim() || null,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl p-2.5 flex flex-col gap-2 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Carpeta</label>
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="Ej: Servicios"
          className="w-full text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
          Etiquetas (comas)
        </label>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="verano, banner"
          className="w-full text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
      </div>
      <div className="flex gap-1.5 mt-auto">
        <Button size="sm" onClick={handleSave} className="flex-1 h-7 text-xs">
          Guardar
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose} className="h-7 text-xs">
          Cancelar
        </Button>
      </div>
    </div>
  );
};
