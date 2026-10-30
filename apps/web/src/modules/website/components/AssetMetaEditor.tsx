import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Button, Input } from '@openfactu/ui';
import type { WebsiteAsset } from '../domain/website';

interface Props {
  asset: WebsiteAsset;
  onSave: (patch: { folder?: string | null; tags?: string[] }) => void;
  onClose: () => void;
}

/** Popover compacto para editar la carpeta y las etiquetas de un asset. */
export const AssetMetaEditor: React.FC<Props> = ({ asset, onSave, onClose }) => {
  const { t } = useI18n();
  const [folder, setFolder] = useState(asset.folder ?? '');
  const [tagsText, setTagsText] = useState((asset.tags ?? []).join(', '));

  const handleSave = () => {
    onSave({
      folder: folder.trim() || null,
      tags: tagsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-10 bg-bg-card backdrop-blur-sm rounded-lg p-2.5 flex flex-col gap-2 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        label={t('website.media.folder')}
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        placeholder={t('website.media.folderPlaceholder')}
        inputSize="sm"
      />
      <Input
        label={t('website.media.tagsCommas')}
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        placeholder={t('website.media.tagsPlaceholder')}
        inputSize="sm"
      />
      <div className="flex gap-1.5 mt-auto">
        <Button size="sm" onClick={handleSave} className="flex-1 h-7 text-xs">
          {t('website.common.save')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose} className="h-7 text-xs">
          {t('website.common.cancel')}
        </Button>
      </div>
    </div>
  );
};
