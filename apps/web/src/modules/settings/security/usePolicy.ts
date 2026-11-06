import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, ApiError } from '@/shared/http';
import { policyErrorKind, samePolicy, type AuthPolicy, type PolicyErrorKind } from './policyModel';

/** Política de acceso de la empresa activa: se edita en local y se guarda de una vez. */
export function usePolicy() {
  const [saved, setSaved] = useState<AuthPolicy | null>(null);
  const [draft, setDraft] = useState<AuthPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ kind: PolicyErrorKind; message: string } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    apiClient
      .get<AuthPolicy>('/api/settings/security')
      .then((p) => {
        if (!live) return;
        setSaved(p);
        setDraft(p);
      })
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const patch = useCallback((change: Partial<AuthPolicy>) => {
    setSaveError(null);
    setDraft((d) => (d ? { ...d, ...change } : d));
  }, []);

  const patchRules = useCallback((change: Partial<AuthPolicy['passwordRules']>) => {
    setSaveError(null);
    setDraft((d) => (d ? { ...d, passwordRules: { ...d.passwordRules, ...change } } : d));
  }, []);

  const dirty = useMemo(() => !samePolicy(saved, draft), [saved, draft]);

  /** Devuelve true si se guardó. */
  const save = useCallback(async () => {
    if (!draft) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await apiClient.put<AuthPolicy>('/api/settings/security', draft);
      setSaved(next);
      setDraft(next);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError({ kind: policyErrorKind(err.body), message: err.message });
      } else {
        setSaveError({ kind: 'other', message: err instanceof Error ? err.message : String(err) });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const reset = useCallback(() => {
    setSaveError(null);
    setDraft(saved);
  }, [saved]);

  return { draft, loading, loadError, saving, saveError, dirty, patch, patchRules, save, reset };
}
