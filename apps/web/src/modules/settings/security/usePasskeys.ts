import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { passkeysSupported, registerPasskey } from '@/shared/auth/webauthn';
import { passkeysApi, type PasskeyInfo } from './api';
import { summarizeUserAgent } from './sessionLabels';

/** Nombre propuesto para una passkey nueva: «Chrome en Windows», o el navegador/sistema suelto. */
export function proposePasskeyName(
  ua: string,
  browserOn: (browser: string, os: string) => string,
  fallback: string,
): string {
  const { browser, os } = summarizeUserAgent(ua);
  if (browser && os) return browserOn(browser, os);
  return browser ?? os ?? fallback;
}

const codeOf = (err: unknown): string | undefined =>
  err instanceof ApiError ? (err.body as { code?: string } | null)?.code : undefined;

/** Passkeys de la cuenta: listar, añadir, renombrar y quitar. */
export function usePasskeys(onAdded?: () => void) {
  const { t } = useI18n();
  const [items, setItems] = useState<PasskeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await passkeysApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    passkeysApi
      .list()
      .then((list) => live && setItems(list))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  /** Mensaje amable de un fallo de alta, baja o cambio. */
  const messageFor = useCallback(
    (err: unknown): string => {
      const code = codeOf(err);
      if (code === 'PASSKEY_EXISTS') return t('auth.passkey.exists');
      if (code === 'MFA_REQUIRED_BY_POLICY') return t('auth.passkey.requiredByPolicy');
      return t('auth.passkey.error');
    },
    [t],
  );

  /** Devuelve true si se añadió; false si el usuario canceló el diálogo del sistema. */
  const add = useCallback(
    async (name: string): Promise<boolean> => {
      setBusy(true);
      try {
        const options = await passkeysApi.registerOptions();
        const response = await registerPasskey(options);
        if (!response) return false;
        await passkeysApi.registerVerify({ response, name });
        await reload();
        onAdded?.();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [onAdded, reload],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      setBusy(true);
      try {
        await passkeysApi.rename(id, name);
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await passkeysApi.remove(id);
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [reload],
  );

  return {
    supported: passkeysSupported(),
    items,
    loading,
    error,
    busy,
    add,
    rename,
    remove,
    messageFor,
  };
}
