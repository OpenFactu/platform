import React from 'react';
import { Tabs } from '@openfactu/ui';
import { Palette, Code2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

export type EditorMode = 'visual' | 'advanced';

interface Props {
  mode: EditorMode;
  onVisual: () => void;
  onAdvanced: () => void;
}

/**
 * Conmutador entre el editor visual y el de HTML. Va con
 * `Tabs variant="segmented"` y no con `SegmentedControl`: tienen el mismo
 * aspecto, pero aquí lo que cambia es el panel de contenido, así que hay que
 * anunciarlo como pestañas y no como un grupo de radio.
 */
export const ModeTabs: React.FC<Props> = ({ mode, onVisual, onAdvanced }) => {
  const { t } = useI18n();
  return (
    <Tabs
      variant="segmented"
      value={mode}
      onChange={(k) => (k === 'visual' ? onVisual() : onAdvanced())}
      items={[
        { key: 'visual', label: t('templates.modeTabs.visual'), icon: <Palette size={14} /> },
        { key: 'advanced', label: t('templates.modeTabs.advanced'), icon: <Code2 size={14} /> },
      ]}
    />
  );
};
