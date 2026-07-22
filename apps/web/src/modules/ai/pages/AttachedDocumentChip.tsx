import React, { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';

/** Chip plegable para un documento (Excel/PDF/Word/CSV) que el usuario
 * adjuntó — su texto extraído viaja dentro del mensaje para que el modelo lo
 * lea, pero se muestra colapsado por defecto en vez de como un muro de texto
 * plano. Clic para ver el contenido completo extraído. */
export const AttachedDocumentChip: React.FC<{
  filename: string;
  text: string;
  truncated: boolean;
}> = ({ filename, text, truncated }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-white/25 bg-white/10 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5"
      >
        <FileText size={13} className="shrink-0" />
        <span className="truncate flex-1 text-left">{filename}</span>
        {truncated && <span className="text-[10px] opacity-70 shrink-0">truncado</span>}
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <pre className="px-2 pb-2 max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words text-[11px] opacity-90">
          {text}
        </pre>
      )}
    </div>
  );
};
