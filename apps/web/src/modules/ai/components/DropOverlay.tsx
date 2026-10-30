import React from 'react';
import { FileUp } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Velo que cubre toda la superficie del chat mientras se arrastra un archivo
 * por encima. `pointer-events-none` es obligatorio: si el velo capturase el
 * ratón se convertiría él en el destino del arrastre y dispararía un
 * `dragleave` en el contenedor nada más aparecer, apagándose y encendiéndose
 * en bucle.
 */
export const DropOverlay: React.FC<{ visible: boolean; acceptImages: boolean }> = ({
  visible,
  acceptImages,
}) => {
  const { t } = useI18n();
  if (!visible) return null;
  return (
    <div className="absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 pointer-events-none animate-in fade-in duration-150">
      <div className="flex flex-col items-center gap-2 text-accent">
        <FileUp size={30} />
        <span className="text-sm font-semibold">{t('ai.drop.title')}</span>
        <span className="text-xs text-fg-muted">
          {t('ai.drop.formats')}
          {acceptImages ? ` · ${t('ai.drop.images')}` : ''}
        </span>
      </div>
    </div>
  );
};
