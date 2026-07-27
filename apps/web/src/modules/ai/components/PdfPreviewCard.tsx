import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

/** Vista previa embebida de un PDF generado por Keiro (preview_document_template)
 * — mismo patrón que usePreview.ts/PreviewPane.tsx del diseñador de
 * plantillas: Blob URL en un <iframe>, sin persistir nada en el server. */
export const PdfPreviewCard: React.FC<{ base64: string; title?: string }> = ({ base64, title }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [base64]);

  if (!url) return null;

  return (
    <div className="rounded-lg border border-border-default overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-muted text-[11px] text-fg-muted">
        <span>{title || 'Vista previa'}</span>
        <a
          href={url}
          download={`${title || 'preview'}.pdf`}
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          <Download size={11} /> Descargar
        </a>
      </div>
      <iframe src={url} title={title || 'Vista previa PDF'} className="w-full h-96 border-0" />
    </div>
  );
};
