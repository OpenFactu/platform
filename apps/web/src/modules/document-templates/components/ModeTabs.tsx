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
  <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
    <button
      onClick={onVisual}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
        mode === 'visual'
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
      )}
    >
      <Palette size={14} /> Modo Visual
    </button>
    <button
      onClick={onAdvanced}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
        mode === 'advanced'
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
      )}
    >
      <Code2 size={14} /> Modo Avanzado (HTML)
    </button>
  </div>
);
