import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/http';
import { methods } from '@/pages/login/loginApi';
import { ssoErrorKey } from '@/pages/login/ssoModel';
import { useI18n } from '@/i18n/I18nContext';
import { identitiesApi, type IdentityInfo } from './api';

export interface LinkableProvider {
  id: string;
  name: string;
  kind: string;
}

/** Solo http(s): la dirección que devuelve el servidor es del proveedor, no un `javascript:`. */
export const isNavigableUrl = (url: string): boolean => /^https?:\/\//i.test(url);

/** Cuentas enlazadas de la cuenta propia, los proveedores que aún se pueden enlazar y las acciones. */
export function useIdentities(tenantId?: string) {
  const { t } = useI18n();
  const [items, setItems] = useState<IdentityInfo[]>([]);
  const [providers, setProviders] = useState<LinkableProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await identitiesApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    identitiesApi
      .list()
      .then((list) => live && setItems(list))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoading(false));
    methods(tenantId || undefined)
      .then((m) => live && setProviders(m.sso))
      .catch(() => live && setProviders([]));
    return () => {
      live = false;
    };
  }, [tenantId]);

  const messageFor = useCallback(
    (err: unknown): string => {
      const code = err instanceof ApiError ? (err.body as { code?: string } | null)?.code : null;
      return t(ssoErrorKey(code));
    },
    [t],
  );

  /** Navega al proveedor; vuelve a `/profile/security?linked=1` o con `?ssoError=`. */
  const link = useCallback(async (providerId: string) => {
    setBusy(true);
    try {
      const url = await identitiesApi.link(providerId);
      if (!isNavigableUrl(url)) throw new Error('bad url');
      window.location.assign(url);
    } catch (err) {
      setBusy(false);
      throw err;
    }
  }, []);

  const unlink = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await identitiesApi.unlink(id);
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [reload],
  );

  const linkedIds = new Set(items.map((i) => i.providerId));
  const available = providers.filter((p) => !linkedIds.has(p.id));

  return { items, available, loading, error, busy, link, unlink, messageFor };
}
