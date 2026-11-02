import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/shared/http';
import { useAuth } from './AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { setLocalizationTerms } from '@/i18n/i18n';

export interface LocalizationInfo {
  packs: Array<{ id: string; name: string; version: string; countries: string[] }>;
  terminology: Record<string, string>;
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
  const tenantId = user?.tenantId;

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setInfo(null);
      setLocalizationTerms(null);
      return;
    }
    try {
      const next = await apiClient.get<LocalizationInfo>('/api/localization/active');
      setInfo(next);
      setLocalizationTerms(next.terminology);
    } catch {
      // Sin respuesta se quedan los términos genéricos: nada deja de funcionar.
      setInfo(null);
      setLocalizationTerms(null);
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
