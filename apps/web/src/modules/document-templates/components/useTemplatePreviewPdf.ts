import { useEffect, useRef, useState } from 'react';
import { templatesApi } from '../api';
import type { TemplateRow } from './constants';

/**
 * PDF de muestra de la plantilla elegida en la lista. Se guarda por versión para no
 * generar otra vez al volver a una que ya se ha visto.
 */
export function useTemplatePreviewPdf(template: TemplateRow | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const cache = useRef(new Map<string, string>());

  const id = template?.id;
  const version = template?.updatedAt;

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    const key = `${id}:${version}`;
    const cached = cache.current.get(key);
    setFailed(false);
    if (cached) {
      setUrl(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setUrl(null);
    setLoading(true);
    (async () => {
      try {
        const detail: any = await templatesApi.get(id);
        const { blob } = await templatesApi.previewPdf({
          html: detail.html,
          docType: detail.docType,
          queries: detail.canvasLayout?.queries ?? [],
          params: detail.canvasLayout?.testParams ?? {},
        });
        const objectUrl = URL.createObjectURL(blob);
        cache.current.set(key, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  useEffect(() => {
    const urls = cache.current;
    return () => {
      urls.forEach((value) => URL.revokeObjectURL(value));
    };
  }, []);

  return { url, loading, failed };
}
