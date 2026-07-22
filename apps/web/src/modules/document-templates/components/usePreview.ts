import { templatesApi } from '../api';
import { useEffect, useRef, useState } from 'react';
import type { DocType } from './constants';

/**
 * Hook que genera un PDF preview con debounce cada vez que cambia el HTML.
 * Gestiona el object URL y su liberación.
 */
export function usePreview(
  html: string,
  docType: DocType,
  token: string,
  tenantId: string,
  onError: (msg: string) => void,
  debounceMs: number = 600,
) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const urlRef = useRef<string | null>(null);

  const generate = async () => {
    setPreviewing(true);
    try {
      const { blob } = await templatesApi.previewPdf({ html, docType });
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreviewUrl(url);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      generate();
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, docType]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { previewUrl, previewing, refresh: generate };
}
