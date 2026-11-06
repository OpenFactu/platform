import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { toPayload, type AuthProvider, type ProviderForm } from './providerForm';

const providersApi = {
  list: async (): Promise<AuthProvider[]> =>
    (await apiClient.get<{ providers: AuthProvider[] }>('/api/auth-providers')).providers,
  create: (body: Record<string, unknown>) =>
    apiClient.post<AuthProvider>('/api/auth-providers', body),
  update: (id: string, body: Record<string, unknown>) =>
    apiClient.patch<AuthProvider>(`/api/auth-providers/${encodeURIComponent(id)}`, body),
  remove: (id: string) => apiClient.delete<void>(`/api/auth-providers/${encodeURIComponent(id)}`),
};

/** Proveedores de acceso único de la instalación (solo SUPERUSER): listar, guardar y borrar. */
export function useProviders() {
  const { t } = useI18n();
  const [items, setItems] = useState<AuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await providersApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    providersApi
      .list()
      .then((list) => live && setItems(list))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  /** Mensaje de un fallo al guardar: el del servidor si es de validación, o uno genérico. */
  const messageFor = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        const body = err.body as { code?: string; error?: string } | null;
        if (body?.code === 'INVALID_INPUT' && body.error) return body.error;
        if (err.status === 403) return t('auth.providers.forbidden');
      }
      return t('auth.providers.saveFailed');
    },
    [t],
  );

  /** Crea (sin `id`) o actualiza. Devuelve el proveedor guardado. */
  const save = useCallback(
    async (id: string | null, form: ProviderForm): Promise<AuthProvider> => {
      setBusy(true);
      try {
        const body = toPayload(form, id !== null);
        const saved = id ? await providersApi.update(id, body) : await providersApi.create(body);
        await reload();
        return saved;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await providersApi.remove(id);
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [reload],
  );

  return { items, loading, error, busy, save, remove, messageFor };
}
