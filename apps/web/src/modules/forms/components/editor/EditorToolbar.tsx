import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { useToast } from '@openfactu/ui';
import { Image, PlusCircle, Rows3, Type } from 'lucide-react';
import { IconButton } from './IconButton';
import { pickFile } from './iconButtonStyles';

interface Props {
  onQuestion: () => void;
  onText: () => void;
  onImage: (file: File) => Promise<void>;
  onSection: () => void;
  uploadingImage: boolean;
}

const MAX_IMAGE_MB = 5;

/**
 * Barra para añadir elementos: columna fija junto al lienzo en escritorio y
 * barra flotante abajo en móvil (por encima de la navegación inferior).
 */
export const EditorToolbar: React.FC<Props> = ({
  onQuestion,
  onText,
  onImage,
  onSection,
  uploadingImage,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  // Mismo botón que los demás: el FileDropzone en modo botón tenía otro estilo.
  const addImage = () =>
    pickFile('image/*', (file) => {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        toast.error(t('forms.toolbar.imageTooBig', { mb: MAX_IMAGE_MB }));
        return;
      }
      void onImage(file);
    });
  return (
    <div
      role="toolbar"
      aria-label={t('forms.toolbar.ariaLabel')}
      className="z-30 flex items-center justify-around gap-1 rounded-xs border border-border-default bg-bg-card p-1 shadow-md max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(80px+1rem+env(safe-area-inset-bottom))] md:sticky md:top-24 md:flex-col"
    >
      <IconButton label={t('forms.toolbar.addQuestion')} onClick={onQuestion}>
        <PlusCircle size={20} />
      </IconButton>
      <IconButton label={t('forms.toolbar.addText')} onClick={onText}>
        <Type size={20} />
      </IconButton>
      <IconButton label={t('forms.toolbar.addImage')} onClick={addImage} isLoading={uploadingImage}>
        <Image size={20} />
      </IconButton>
      <IconButton label={t('forms.toolbar.addSection')} onClick={onSection}>
        <Rows3 size={20} />
      </IconButton>
    </div>
  );
};
