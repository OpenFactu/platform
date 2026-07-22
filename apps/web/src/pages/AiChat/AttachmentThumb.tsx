import React from 'react';
import type { FileUIPart } from 'ai';
import { Paperclip, X } from 'lucide-react';

/** Miniatura de un adjunto (ya enviado o pendiente de enviar). */
export const AttachmentThumb: React.FC<{ file: FileUIPart; onRemove?: () => void }> = ({
  file,
  onRemove,
}) => {
  const isImage = file.mediaType?.startsWith('image');
  return (
    <div className="relative shrink-0">
      {isImage ? (
        <img
          src={file.url}
          alt={file.filename || 'imagen adjunta'}
          className="h-16 w-16 object-cover rounded-md border border-slate-200 dark:border-slate-700"
        />
      ) : (
        <div className="h-16 w-16 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-400">
          <Paperclip size={18} />
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          // Dentro del recuadro (no con offset negativo): el contenedor que
          // envuelve las miniaturas pendientes tiene overflow-x-auto, y eso
          // recorta implícitamente el eje Y también — un botón que sobresalga
          // por encima con -top-* queda cortado y se vuelve invisible.
          className="absolute top-1 right-1 bg-slate-900/80 text-white rounded-full p-1 shadow hover:bg-rose-600 transition-colors"
          title="Quitar"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
