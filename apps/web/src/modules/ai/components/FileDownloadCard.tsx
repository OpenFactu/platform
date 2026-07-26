import React from 'react';
import { Button } from '@openfactu/ui';
import { Download, FileSpreadsheet, FileText, File as FileIcon } from 'lucide-react';

const ICONS: Record<string, React.ElementType> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  'application/pdf': FileIcon,
};

/** Tarjeta de descarga para archivos que Keiro genera (create_excel/word/pdf) —
 * decodifica el base64 del output de la tool a un Blob y dispara la descarga
 * client-side, sin persistir nada en el server. */
export const FileDownloadCard: React.FC<{ filename: string; mimeType: string; base64: string }> = ({
  filename,
  mimeType,
  base64,
}) => {
  const Icon = ICONS[mimeType] || FileIcon;

  const handleDownload = () => {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 max-w-sm">
      <span className="p-2 rounded-md bg-accent/10 text-accent shrink-0">
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{filename}</div>
        <div className="text-[11px] text-slate-400">Generado por Keiro</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        title="Descargar"
        className="shrink-0 text-accent"
      >
        <Download size={16} />
      </Button>
    </div>
  );
};
