import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/http';
import { isApiPath } from '@/utils/downloadPdf';

export interface PdfDocument {
  blob: Blob;
  url: string;
  filename: string;
}

/** Pide un PDF a la API y lo deja listo para mostrarlo. */
export function usePdfDocument(src: string | null) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = isApiPath(src);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    apiClient
      .getBlob(src as string)
      .then(({ blob, filename }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdf({ blob, url: objectUrl, filename: filename || 'documento.pdf' });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, valid]);

  const failure = valid ? error : '';
  return { pdf, error: failure, loading: !pdf && failure === null };
}
