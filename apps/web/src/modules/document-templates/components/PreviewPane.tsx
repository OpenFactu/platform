import React from 'react';
import { Card, Loader } from '@openfactu/ui';
import { Eye } from 'lucide-react';

interface Props {
  previewUrl: string | null;
  previewing: boolean;
  onRefresh: () => void;
}

export const PreviewPane: React.FC<Props> = ({ previewUrl, previewing, onRefresh }) => (
  <Card
    className="h-full border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
    noPadding
    bodyClassName="h-full flex flex-col overflow-hidden p-3"
  >
    <div className="flex items-center justify-between mb-2 flex-shrink-0">
      <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <Eye size={12} /> Vista previa PDF
        {previewing && <Loader />}
      </div>
      <button
        onClick={onRefresh}
        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest"
      >
        Refrescar
      </button>
    </div>
    <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden relative">
      {previewUrl ? (
        <iframe
          src={previewUrl}
          title="Vista previa PDF"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-slate-300 dark:text-slate-600 text-sm italic">
          Generando vista previa...
        </div>
      )}
    </div>
  </Card>
);
