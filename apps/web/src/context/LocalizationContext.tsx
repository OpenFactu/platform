import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/shared/http';
import { useAuth } from './AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { setLocalizationTerms, setPluginTranslations } from '@/i18n/i18n';

export interface LocalizationInfo {
  packs: Array<{ id: string; name: string; version: string; countries: string[] }>;
  terminology: Record<string, string>;
  /** Idiomas que no trae la aplicación y aportan los plugins activos. */
  languages: string[];
  /** Traducciones de los plugins activos, por idioma. */
  translations: Record<string, Record<string, unknown>>;
  hasPluginReports: boolean;
  fiscalConnectors: Array<{ id: string; name: string }>;
}

interface LocalizationContextType {
  info: LocalizationInfo | null;
  /** Vuelve a pedir la normativa: tras activar o desactivar un plugin. */
  refresh: () => Promise<void>;
}

const LocalizationContext = createContext<LocalizationContextType>({
  info: null,
  refresh: async () => {},
});

/**
 * Normativa de la empresa con sesión abierta. Sus términos (nombre del impuesto...) se
 * inyectan en todas las traducciones: los textos usan `{tax}`, `{taxId}`, etc.
 */
export const LocalizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [info, setInfo] = useState<LocalizationInfo | null>(null);
  // Con el segundo factor pendiente, lo de la empresa responde 403: no se pide.
  const tenantId = user?.restricted ? undefined : user?.tenantId;

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setInfo(null);
      setLocalizationTerms(null);
      setPluginTranslations(null);
      return;
    }
    try {
      const next = await apiClient.get<LocalizationInfo>('/api/localization/active');
      setInfo(next);
      setPluginTranslations(next.translations);
      setLocalizationTerms(next.terminology);
    } catch {
      // Sin respuesta se quedan los términos genéricos: nada deja de funcionar.
      setInfo(null);
      setLocalizationTerms(null);
      setPluginTranslations(null);
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
    // El idioma cambia el texto de los términos.
  }, [refresh, locale]);

  return (
    <LocalizationContext.Provider value={{ info, refresh }}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = () => useContext(LocalizationContext);
