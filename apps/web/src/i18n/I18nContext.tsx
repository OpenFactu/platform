import React, { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import {
  I18nProvider as UiI18nProvider,
  registerTranslations,
  type DeepPartial,
  type Messages as UiMessages,
} from '@openfactu/ui';
import uiEn from './ui/en.json';
import {
  getLocale,
  setLocale,
  subscribeLocale,
  translate,
  type Locale,
  type TranslateVars,
} from './i18n';

export type { Locale } from './i18n';

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string, vars?: TranslateVars) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// `@openfactu/ui` solo trae español: su catálogo inglés lo pone la app.
registerTranslations('en', uiEn as DeepPartial<UiMessages>, { source: 'keirost' });

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);

  // Nueva identidad de `t` al cambiar de idioma para que memos y efectos se recalculen.
  const t = useCallback(
    (path: string, vars?: TranslateVars): string => translate(locale, path, vars),
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      <UiI18nProvider locale={locale}>{children}</UiI18nProvider>
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
