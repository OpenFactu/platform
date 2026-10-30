import React from 'react';
import { Button } from '@openfactu/ui';
import { Plus } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Añadir líneas a un documento: «Añadir línea» y, al lado, atajos discretos
 * para añadir 5 o 10 de golpe. Botones normales de @openfactu/ui, el mismo
 * control en todos los formularios (antes cada uno llevaba su versión; probamos
 * un SplitButton y en temas oscuros se veía partido).
 */
export const AddLinesButton: React.FC<{
  addLine: () => void;
  /** Texto del botón; por defecto «Añadir línea». */
  label?: string;
  disabled?: boolean;
}> = ({ addLine, label, disabled }) => {
  const { t } = useI18n();
  const addMany = (n: number) => {
    for (let i = 0; i < n; i++) addLine();
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('doc.addLines.group')}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={addLine}
        disabled={disabled}
        className="gap-2"
      >
        <Plus size={14} /> {label ?? t('doc.addLines.addLine')}
      </Button>
      {[5, 10].map((n) => (
        <Button
          key={n}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => addMany(n)}
          disabled={disabled}
          title={t('doc.addLines.addN', { n })}
          aria-label={t('doc.addLines.addN', { n })}
        >
          +{n}
        </Button>
      ))}
    </div>
  );
};
