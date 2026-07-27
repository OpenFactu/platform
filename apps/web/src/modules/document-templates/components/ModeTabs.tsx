import React from 'react';
import { Tabs } from '@openfactu/ui';
import { Palette, Code2 } from 'lucide-react';

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
export const ModeTabs: React.FC<Props> = ({ mode, onVisual, onAdvanced }) => (
  <Tabs
    variant="segmented"
    value={mode}
    onChange={(k) => (k === 'visual' ? onVisual() : onAdvanced())}
    items={[
      { key: 'visual', label: 'Modo visual', icon: <Palette size={14} /> },
      { key: 'advanced', label: 'Modo avanzado (HTML)', icon: <Code2 size={14} /> },
    ]}
  />
);
