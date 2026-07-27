import React from 'react';
import { cn } from '@openfactu/ui';
import { Palette, Code2 } from 'lucide-react';

export type EditorMode = 'visual' | 'advanced';

interface Props {
  mode: EditorMode;
  onVisual: () => void;
  onAdvanced: () => void;
}

export const ModeTabs: React.FC<Props> = ({ mode, onVisual, onAdvanced }) => (
  <div className="flex gap-1 p-1 bg-bg-muted rounded-xl w-fit">
    <button
      onClick={onVisual}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
        mode === 'visual'
          ? 'bg-bg-card text-fg-default shadow-sm'
          : 'text-fg-muted hover:text-fg-body',
      )}
    >
      <Palette size={14} /> Modo Visual
    </button>
    <button
      onClick={onAdvanced}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
        mode === 'advanced'
          ? 'bg-bg-card text-fg-default shadow-sm'
          : 'text-fg-muted hover:text-fg-body',
      )}
    >
      <Code2 size={14} /> Modo Avanzado (HTML)
    </button>
  </div>
);
